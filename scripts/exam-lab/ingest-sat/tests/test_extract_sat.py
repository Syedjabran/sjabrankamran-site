"""Unit tests for extract_sat.py's orchestration logic: upload retry/backoff,
the append-only uploaded-ids record, and always-persisting partial results.

None of these touch the network or read/set/search any Supabase credential
-- `upload_file` and `render_span` are always monkeypatched with fakes.
"""
import json
import re
import sys
import urllib.error
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_sat


def _fake_record(qid: str) -> dict:
    return {
        "id": qid, "section": "math", "domain": "algebra", "skill": "s", "difficulty": "H",
        "answer": {"kind": "spr", "accepted": ["1"], "source": "answer-line"}, "rationale": "r",
    }


def _patch_fake_pipeline(monkeypatch, tmp_path, records, render_span_fn) -> None:
    """Wire every crop_qbank/parse_qbank/report_qbank/upload call
    extract_sat.main() makes to a fake, so main()'s own orchestration logic
    can be exercised end-to-end without a real PDF, real poppler output, or
    a real network call -- those are each covered by their own module's
    test file already.
    """
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "export.pdf").write_bytes(b"")  # only needs to satisfy glob
    monkeypatch.setattr(extract_sat, "RAW", raw_dir)
    monkeypatch.setattr(extract_sat, "CROPS", tmp_path / "crops")
    monkeypatch.setattr(extract_sat, "text_of", lambda pdf: "fake text")
    monkeypatch.setattr(extract_sat, "parse_export", lambda text: (records, []))
    monkeypatch.setattr(extract_sat, "bbox_xml", lambda pdf: "<fake/>")
    monkeypatch.setattr(
        extract_sat, "anchors",
        lambda xml: {"ids": [], "diffs": [], "answers": [], "rationales": [],
                      "pages": {}, "page_size": {1: (612.0, 792.0)}},
    )
    monkeypatch.setattr(extract_sat, "question_span", lambda a, qid: {"page": 1, "top": 0.0, "bottom": 10.0})
    monkeypatch.setattr(extract_sat, "bucket_path", lambda qid, section: f"sat/{section}/{qid}.jpg")
    monkeypatch.setattr(extract_sat, "render_span", render_span_fn)


def _write_crop(pdf, span, dest, **kw):
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(b"fake-jpeg")
    return dest


# --- _upload_with_retry -----------------------------------------------

def test_upload_with_retry_retries_5xx_then_succeeds(monkeypatch):
    calls = []

    def fake_upload(dest, img):
        calls.append(img)
        if len(calls) < 3:
            raise urllib.error.HTTPError(img, 503, "Service Unavailable", {}, None)
        return img

    monkeypatch.setattr(extract_sat, "upload_file", fake_upload)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: None)

    result = extract_sat._upload_with_retry(Path("x.jpg"), "sat/math/x.jpg")
    assert result == "sat/math/x.jpg"
    assert len(calls) == 3


def test_upload_with_retry_retries_429(monkeypatch):
    calls = []

    def fake_upload(dest, img):
        calls.append(img)
        if len(calls) < 2:
            raise urllib.error.HTTPError(img, 429, "Too Many Requests", {}, None)
        return img

    monkeypatch.setattr(extract_sat, "upload_file", fake_upload)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: None)

    result = extract_sat._upload_with_retry(Path("x.jpg"), "sat/math/x.jpg")
    assert result == "sat/math/x.jpg"
    assert len(calls) == 2


def test_upload_with_retry_does_not_retry_client_error(monkeypatch):
    """A 401/403 means the credentials are wrong -- retrying the identical
    bad credentials cannot succeed, so this must fail on the first attempt
    with no sleep and no further tries.
    """
    calls = []

    def fake_upload(dest, img):
        calls.append(img)
        raise urllib.error.HTTPError(img, 401, "Unauthorized", {}, None)

    sleep_calls = []
    monkeypatch.setattr(extract_sat, "upload_file", fake_upload)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: sleep_calls.append(s))

    with pytest.raises(urllib.error.HTTPError):
        extract_sat._upload_with_retry(Path("x.jpg"), "sat/math/x.jpg")
    assert len(calls) == 1
    assert sleep_calls == []


def test_upload_with_retry_gives_up_after_max_attempts_on_connection_errors(monkeypatch):
    calls = []

    def fake_upload(dest, img):
        calls.append(img)
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(extract_sat, "upload_file", fake_upload)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: None)

    with pytest.raises(RuntimeError, match="upload failed"):
        extract_sat._upload_with_retry(Path("x.jpg"), "sat/math/x.jpg")
    assert len(calls) == extract_sat.MAX_UPLOAD_ATTEMPTS


def test_upload_with_retry_backs_off_exponentially(monkeypatch):
    def fake_upload(dest, img):
        raise urllib.error.URLError("boom")

    delays = []
    monkeypatch.setattr(extract_sat, "upload_file", fake_upload)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: delays.append(s))

    with pytest.raises(RuntimeError):
        extract_sat._upload_with_retry(Path("x.jpg"), "sat/math/x.jpg")
    assert delays == [1.0, 2.0, 4.0, 8.0]


# --- uploaded-ids record -------------------------------------------------

def test_record_uploaded_is_append_only_and_persists_to_disk(tmp_path):
    path = tmp_path / "uploaded.json"
    already: set[str] = set()
    extract_sat._record_uploaded(path, "id1", already)
    extract_sat._record_uploaded(path, "id2", already)

    assert already == {"id1", "id2"}
    assert extract_sat._load_uploaded(path) == {"id1", "id2"}


def test_load_uploaded_returns_empty_set_when_file_absent(tmp_path):
    assert extract_sat._load_uploaded(tmp_path / "missing.json") == set()


# --- always-persist rows.json/skipped.json, even on a mid-run failure ----

def test_main_persists_partial_rows_and_skipped_on_exception(tmp_path, monkeypatch):
    """Simulates a crash partway through the double loop (e.g. a crop
    render that dies on the second of three records) and checks that
    rows.json/skipped.json still reflect the work done before the crash,
    and that the exception still propagates rather than being swallowed.
    Every pipeline call (parsing, anchors, cropping, upload) is faked --
    this tests only extract_sat.py's own orchestration, not the modules
    already covered by their own test files.
    """
    records = [_fake_record("id1"), _fake_record("id2"), _fake_record("id3")]

    def fake_render_span(pdf, span, dest, **kw):
        if dest.stem == "id2":
            raise RuntimeError("simulated crash mid-render")
        return _write_crop(pdf, span, dest, **kw)

    _patch_fake_pipeline(monkeypatch, tmp_path, records, fake_render_span)

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="simulated crash mid-render"):
        extract_sat.main(["--dry-run", "--out", str(out_path)])

    assert out_path.exists()
    rows = json.loads(out_path.read_text(encoding="utf-8"))
    assert [r["id"] for r in rows] == ["id1"]  # id2 crashed before id3 was ever reached

    skipped_path = out_path.with_name("skipped.json")
    assert skipped_path.exists()
    assert json.loads(skipped_path.read_text(encoding="utf-8")) == []


# --- _atomic_write_text (R1) ---------------------------------------------

def test_atomic_write_text_writes_the_file_and_leaves_no_tmp_leftover(tmp_path):
    path = tmp_path / "out.json"
    extract_sat._atomic_write_text(path, "hello")
    assert path.read_text(encoding="utf-8") == "hello"
    assert list(tmp_path.glob("*.tmp-*")) == []


def test_atomic_write_text_leaves_the_original_untouched_on_failure(tmp_path, monkeypatch):
    """The exact failure mode R1 exists to prevent: `uploaded.json` (or
    rows.json/skipped.json) killed mid-write must never end up truncated,
    because a truncated `uploaded.json` makes `_load_uploaded`'s
    `json.loads` raise on every future run, permanently blocking resume.
    Forces the final `os.replace` step itself to fail -- the worst-case
    timing, after the new content is fully staged in the temp file -- and
    checks the ORIGINAL file is byte-for-byte unchanged, not truncated or
    replaced with a partial write, and that no temp file is left behind.
    """
    path = tmp_path / "out.json"
    path.write_text("original", encoding="utf-8")

    def fail_replace(src, dst):
        raise OSError("disk full (simulated)")

    monkeypatch.setattr(extract_sat.os, "replace", fail_replace)
    with pytest.raises(OSError, match="disk full"):
        extract_sat._atomic_write_text(path, "new-content")

    assert path.read_text(encoding="utf-8") == "original"
    assert list(tmp_path.glob("*.tmp-*")) == []


def test_atomic_write_text_retries_a_transient_windows_lock(tmp_path, monkeypatch):
    """A scanner holding uploaded.json for a moment makes os.replace raise
    PermissionError on Windows; the write must wait it out, not abort the run."""
    path = tmp_path / "uploaded.json"
    real_replace = extract_sat.os.replace
    calls = {"n": 0}

    def flaky_replace(src, dst):
        calls["n"] += 1
        if calls["n"] < 3:
            raise PermissionError("[WinError 5] Access is denied (simulated)")
        return real_replace(src, dst)

    monkeypatch.setattr(extract_sat.os, "replace", flaky_replace)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: None)
    extract_sat._atomic_write_text(path, "[]")
    assert path.read_text(encoding="utf-8") == "[]" and calls["n"] == 3
    assert list(tmp_path.glob("*.tmp-*")) == []


def test_atomic_write_text_still_raises_a_lasting_permission_error(tmp_path, monkeypatch):
    path = tmp_path / "uploaded.json"

    def always_denied(src, dst):
        raise PermissionError("[WinError 5] Access is denied (simulated)")

    monkeypatch.setattr(extract_sat.os, "replace", always_denied)
    monkeypatch.setattr(extract_sat.time, "sleep", lambda s: None)
    with pytest.raises(PermissionError):
        extract_sat._atomic_write_text(path, "[]")
    assert not path.exists() and list(tmp_path.glob("*.tmp-*")) == []


def test_load_uploaded_treats_a_corrupt_file_as_empty_and_warns_instead_of_crashing(tmp_path, capsys):
    """A truncated/corrupt uploaded.json must not hard-block every future
    resume: re-uploading ids that turn out to already be uploaded is
    harmless (Supabase upsert), so this degrades to "start over" with a
    loud warning rather than raising and killing the run outright.
    """
    path = tmp_path / "uploaded.json"
    path.write_text("{not valid json", encoding="utf-8")

    result = extract_sat._load_uploaded(path)

    assert result == set()
    captured = capsys.readouterr()
    assert "WARNING" in captured.err
    assert "uploaded.json" in captured.err
    assert "corrupt" in captured.err  # a parse failure, distinct from R6's read-failure case


def test_load_uploaded_distinguishes_a_read_failure_from_a_parse_failure(tmp_path, monkeypatch, capsys):
    """R6: a genuine read failure (permissions, the file vanishing mid-read)
    needs a different operator response than a truncated/malformed file --
    the warning text must say which one happened, not use one blanket
    "corrupt" message for both. Both still fail open (empty set), since
    re-uploading is harmless either way; only the message differs.
    """
    path = tmp_path / "uploaded.json"
    path.write_text('["id1"]', encoding="utf-8")

    def fail_read(self, encoding=None):
        raise PermissionError("simulated permission denied")

    monkeypatch.setattr(Path, "read_text", fail_read)
    result = extract_sat._load_uploaded(path)

    assert result == set()
    captured = capsys.readouterr()
    assert "WARNING" in captured.err
    assert "could not read" in captured.err
    assert "corrupt" not in captured.err  # this is a read failure, not a parse failure


# --- crops/uploaded.json desync warning (R3) ------------------------------

def test_main_warns_when_a_recropped_id_is_already_marked_uploaded(tmp_path, monkeypatch, capsys):
    """CROPS is a fixed path while uploaded.json derives from --out's
    parent, so the two can desync -- e.g. out/crops was cleared while
    out/uploaded.json survived a previous live run. If a crop had to be
    re-rendered but its id is already marked uploaded, the upload step
    below is skipped (id already in `uploaded`), so the bucket may still be
    serving the OLD image under that key. Only a human can say which copy
    is actually correct, so this must be surfaced loudly rather than
    silently skipped -- the run still succeeds, it just can't be missed.
    """
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)

    out_path = tmp_path / "out" / "rows.json"
    uploaded_path = out_path.with_name("uploaded.json")
    uploaded_path.parent.mkdir(parents=True, exist_ok=True)
    uploaded_path.write_text(json.dumps(["id1"]), encoding="utf-8")

    extract_sat.main(["--dry-run", "--out", str(out_path)])

    captured = capsys.readouterr()
    assert "WARNING" in captured.err
    assert "id1" in captured.err
    assert "stale" in captured.err


def test_main_does_not_warn_when_a_recropped_id_is_not_yet_uploaded(tmp_path, monkeypatch, capsys):
    """Sanity check for the R3 warning's condition: the ordinary case (a
    freshly cropped question that has never been uploaded, e.g. a first
    run) must NOT trigger the desync warning -- only a re-crop of an id
    already recorded as uploaded should.
    """
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    captured = capsys.readouterr()
    assert "WARNING" not in captured.err


# --- _persist() failure inside finally does not displace the original
#     exception (R4) -------------------------------------------------------

def test_persist_failure_inside_finally_does_not_displace_the_original_exception(tmp_path, monkeypatch, capsys):
    """If the loop dies for a real reason (here: a simulated crop crash)
    AND _persist() then also fails (here: _atomic_write_text simulated as
    broken), the caller must still see the ORIGINAL exception -- not the
    persistence failure -- so the real cause is never hidden behind a
    secondary bookkeeping error.
    """
    records = [_fake_record("id1")]

    def crashing_render_span(pdf, span, dest, **kw):
        raise RuntimeError("original crash")

    _patch_fake_pipeline(monkeypatch, tmp_path, records, crashing_render_span)
    monkeypatch.setattr(
        extract_sat, "_atomic_write_text",
        lambda path, text: (_ for _ in ()).throw(OSError("persist also failed")),
    )

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="original crash"):
        extract_sat.main(["--dry-run", "--out", str(out_path)])

    captured = capsys.readouterr()
    assert "failed to persist" in captured.err


# --- a persistence-only failure on an otherwise clean run must not exit 0
#     (R5) ---------------------------------------------------------------

def test_main_does_not_exit_zero_when_persistence_fails_on_a_clean_run(tmp_path, monkeypatch, capsys):
    """R5: R4 stopped a persistence failure from displacing an ORIGINAL
    exception, but on a CLEAN run (no original exception) that same
    persistence failure was only warned about, then main() returned 0
    anyway -- reporting success while rows.json/skipped.json may not
    reflect the run at all. Since I1 exists specifically so a run's
    outcome is never lost, that combination (success exit code + no
    reliable record) is exactly the wrong outcome for a live run that may
    have just uploaded thousands of images. This forces every crop to
    render successfully (no original exception) while every persistence
    write fails, and checks that main() raises rather than returning.
    """
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)
    monkeypatch.setattr(
        extract_sat, "_atomic_write_text",
        lambda path, text: (_ for _ in ()).throw(OSError("disk full (simulated)")),
    )

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(OSError, match="disk full"):
        extract_sat.main(["--dry-run", "--out", str(out_path)])

    captured = capsys.readouterr()
    assert "not reporting success" in captured.err


def test_main_still_propagates_the_original_exception_not_the_persist_error(tmp_path, monkeypatch):
    """R5 regression guard for R4: adding the clean-run persist-failure
    check must not break the case R4 fixed -- when there IS an original
    exception (here: a simulated crop crash) AND persistence also fails,
    the ORIGINAL exception must still be what propagates, not the
    persistence error and not a generic "did the run fail" signal.
    """
    records = [_fake_record("id1")]

    def crashing_render_span(pdf, span, dest, **kw):
        raise RuntimeError("original crash")

    _patch_fake_pipeline(monkeypatch, tmp_path, records, crashing_render_span)
    monkeypatch.setattr(
        extract_sat, "_atomic_write_text",
        lambda path, text: (_ for _ in ()).throw(OSError("persist also failed")),
    )

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="original crash"):
        extract_sat.main(["--dry-run", "--out", str(out_path)])


# --- mode.json sidecar (C1) ------------------------------------------------

def test_main_records_dry_run_mode_alongside_rows(tmp_path, monkeypatch):
    """build_sat_bank.py's provenance check (C1) needs to tell a dry run's
    rows.json apart from a live one's -- otherwise running it against the
    dry-run rows.json sitting on disk would silently accept rows whose
    images were never uploaded.
    """
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    mode = json.loads(out_path.with_name("mode.json").read_text(encoding="utf-8"))
    assert mode == {"dry_run": True}


def test_main_records_live_mode_alongside_rows(tmp_path, monkeypatch):
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)
    monkeypatch.setattr(extract_sat, "upload_file", lambda dest, img: img)
    monkeypatch.setattr(extract_sat, "preflight_credentials", lambda: None)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--out", str(out_path)])  # no --dry-run: live path

    mode = json.loads(out_path.with_name("mode.json").read_text(encoding="utf-8"))
    assert mode == {"dry_run": False}


# --- credential preflight (cheap fix: fail fast on missing credentials) ---

def test_main_dry_run_does_not_check_credentials(monkeypatch, tmp_path):
    """A machine with no Supabase credentials configured at all must still
    be able to run a dry-run crop-only pass -- the check is skipped under
    --dry-run.
    """
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)

    def boom():
        raise AssertionError("preflight_credentials must not run under --dry-run")

    monkeypatch.setattr(extract_sat, "preflight_credentials", boom)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])  # must not raise


def test_main_live_run_checks_credentials_before_any_crop_is_rendered(monkeypatch, tmp_path):
    """upload.py's os.environ[...] used to raise a bare KeyError only after
    the first crop was already rendered. The credential check must run
    before poppler ever touches a page, so a missing credential is reported
    immediately instead of after partial, wasted work.
    """
    records = [_fake_record("id1")]
    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)
    monkeypatch.setattr(
        extract_sat, "preflight_credentials",
        lambda: (_ for _ in ()).throw(RuntimeError(
            "missing required environment variable(s): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
        )),
    )

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        extract_sat.main(["--out", str(out_path)])  # no --dry-run: live path

    assert not (tmp_path / "crops").exists()


# --- live upload branch (I2): upload -> record -> append, never out of order,
#     and a row exists only if its upload succeeded -----------------------

def test_main_live_run_uploads_before_recording_before_appending_row(monkeypatch, tmp_path):
    """The live branch (`not args.dry_run`) had zero test coverage -- every
    existing main() test passes --dry-run. This exercises it end-to-end and
    asserts the ordering the code relies on: a question is uploaded, then
    recorded in uploaded.json, then (only after both) appended to rows.
    """
    records = [_fake_record("id1"), _fake_record("id2")]
    calls: list[tuple[str, str]] = []

    def fake_upload_file(dest, img):
        calls.append(("upload", dest.stem))
        return img

    real_record_uploaded = extract_sat._record_uploaded

    def spy_record_uploaded(path, qid, already):
        calls.append(("record", qid))
        return real_record_uploaded(path, qid, already)

    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)
    monkeypatch.setattr(extract_sat, "upload_file", fake_upload_file)
    monkeypatch.setattr(extract_sat, "_record_uploaded", spy_record_uploaded)
    monkeypatch.setattr(extract_sat, "preflight_credentials", lambda: None)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--out", str(out_path)])  # no --dry-run: live path

    assert calls == [("upload", "id1"), ("record", "id1"), ("upload", "id2"), ("record", "id2")]

    rows = json.loads(out_path.read_text(encoding="utf-8"))
    assert [r["id"] for r in rows] == ["id1", "id2"]


def test_main_live_run_appends_a_row_only_if_its_upload_succeeded(monkeypatch, tmp_path):
    """The load-bearing invariant extract_sat.py's own docstring relies on:
    a row is appended only after its upload succeeds. Forces id2's upload
    to fail partway through a run of three and checks that id1 (uploaded
    and recorded before the failure) survives in both rows.json and
    uploaded.json, id2 gets neither, and id3 is never reached.
    """
    records = [_fake_record("id1"), _fake_record("id2"), _fake_record("id3")]

    def fake_upload_file(dest, img):
        if dest.stem == "id2":
            raise RuntimeError("simulated upload failure")
        return img

    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)
    monkeypatch.setattr(extract_sat, "upload_file", fake_upload_file)
    monkeypatch.setattr(extract_sat, "preflight_credentials", lambda: None)

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="simulated upload failure"):
        extract_sat.main(["--out", str(out_path)])  # no --dry-run: live path

    rows = json.loads(out_path.read_text(encoding="utf-8"))
    assert [r["id"] for r in rows] == ["id1"]

    uploaded = json.loads(out_path.with_name("uploaded.json").read_text(encoding="utf-8"))
    assert uploaded == ["id1"]


def test_main_live_run_stores_the_canonical_upload_key_not_the_raw_bucket_path(monkeypatch, tmp_path):
    """extract_sat.py used to discard _upload_with_retry's return value (the
    canonical key guard_prefix produced) and store bucket_path's raw output
    in the row instead. Identical today, but a row's "img" must come from
    what was actually transmitted, not what was merely requested.
    """
    records = [_fake_record("id1")]

    def fake_upload_file(dest, img):
        return "sat/math/canonical-id1.jpg"  # deliberately different from bucket_path's output

    _patch_fake_pipeline(monkeypatch, tmp_path, records, _write_crop)
    monkeypatch.setattr(extract_sat, "upload_file", fake_upload_file)
    monkeypatch.setattr(extract_sat, "preflight_credentials", lambda: None)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--out", str(out_path)])  # no --dry-run: live path

    rows = json.loads(out_path.read_text(encoding="utf-8"))
    assert rows[0]["img"] == "sat/math/canonical-id1.jpg"


# --- corpus-level dedupe across exports (I4) -------------------------------

def test_main_dedupes_an_id_ingested_from_an_earlier_export(monkeypatch, tmp_path):
    """Spec integrity rule 3: an item exported under two filters ingests
    once. parse_qbank.parse_export only dedupes within a single PDF's own
    export; extract_sat.py must track ids across the whole corpus so an id
    reappearing in a later PDF (e.g. overlapping filters) is skipped with a
    reason distinct from a parse- or crop-stage reject, instead of being
    cropped/uploaded/appended a second time.
    """
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "a-export.pdf").write_bytes(b"")
    (raw_dir / "b-export.pdf").write_bytes(b"")
    monkeypatch.setattr(extract_sat, "RAW", raw_dir)
    monkeypatch.setattr(extract_sat, "CROPS", tmp_path / "crops")
    monkeypatch.setattr(extract_sat, "text_of", lambda pdf: pdf.name)
    # Both exports carry "id1"; only the second (b-export.pdf) also has "id2".
    monkeypatch.setattr(
        extract_sat, "parse_export",
        lambda text: ([_fake_record("id1")], []) if text == "a-export.pdf"
        else ([_fake_record("id1"), _fake_record("id2")], []),
    )
    monkeypatch.setattr(extract_sat, "bbox_xml", lambda pdf: "<fake/>")
    monkeypatch.setattr(
        extract_sat, "anchors",
        lambda xml: {"ids": [], "diffs": [], "answers": [], "rationales": [],
                      "pages": {}, "page_size": {1: (612.0, 792.0)}},
    )
    monkeypatch.setattr(extract_sat, "question_span", lambda a, qid: {"page": 1, "top": 0.0, "bottom": 10.0})
    monkeypatch.setattr(extract_sat, "bucket_path", lambda qid, section: f"sat/{section}/{qid}.jpg")
    monkeypatch.setattr(extract_sat, "render_span", _write_crop)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    rows = json.loads(out_path.read_text(encoding="utf-8"))
    assert [r["id"] for r in rows] == ["id1", "id2"]  # id1 ingested once, from a-export.pdf

    skipped = json.loads(out_path.with_name("skipped.json").read_text(encoding="utf-8"))
    dupes = [s for s in skipped if s["id"] == "id1"]
    assert len(dupes) == 1
    assert dupes[0]["reason"] == "duplicate-across-exports"
    assert dupes[0]["stage"] == "dedupe"


# --- official-rationale crops (Task 11) --------------------------------------
#
# The rationale's bucket key is a hash of its JPEG bytes (upload.
# rationale_bucket_path), never derived from the question id: the browser
# holds the question's key mid-sitting and the asset route signs any sat/
# path for an enrolled student. The fakes below are keyed by question id
# only to give each record distinct bytes.

QID = "ac472881"  # a realistic College Board id, so "not in the key" means something


def _rationale_bytes(qid: str, version: int = 1) -> bytes:
    return f"jpeg-of-the-rationale-of-{qid}-v{version}".encode()


def _key(qid: str, version: int = 1) -> str:
    return extract_sat.rationale_bucket_path("math", _rationale_bytes(qid, version))


def _local(tmp_path: Path, key: str) -> Path:
    return tmp_path / "crops" / key.removeprefix("sat/")


def _patch_rationales(monkeypatch, span=lambda a, i: [{"page": 1, "top": 0.0, "bottom": 10.0, "qid": i}],
                      reason=lambda a, i: None, render=None) -> list[str]:
    """Fake the crop_rationale calls; returns the list of ids rendered.
    `id_index` hands back the id itself so a fake `span` can decide per
    record, and the default span carries it through to the fake render."""
    rendered: list[str] = []

    def default_render(pdf, regions, sizes):
        rendered.append(regions[0]["qid"])
        return _rationale_bytes(regions[0]["qid"])

    monkeypatch.setattr(extract_sat, "id_index", lambda a, qid: qid)
    monkeypatch.setattr(extract_sat, "rationale_span", span)
    monkeypatch.setattr(extract_sat, "rationale_span_reason", reason)
    monkeypatch.setattr(extract_sat, "render_rationale", render or default_render)
    return rendered


def _live(monkeypatch, upload) -> None:
    monkeypatch.setattr(extract_sat, "upload_file", upload)
    monkeypatch.setattr(extract_sat, "preflight_credentials", lambda: None)


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


def _refuse_upload(dest, img):
    raise AssertionError(f"must not upload {img}")


def _question_already_uploaded(tmp_path: Path, out_path: Path, qid: str = QID) -> None:
    _write(out_path.with_name("uploaded.json"), [qid])
    (tmp_path / "crops" / "math").mkdir(parents=True, exist_ok=True)
    (tmp_path / "crops" / "math" / f"{qid}.jpg").write_bytes(b"already-cropped")


def _rationale_already_cropped(tmp_path: Path, key: str, data: bytes, qid: str = QID) -> None:
    _local(tmp_path, key).parent.mkdir(parents=True, exist_ok=True)
    _local(tmp_path, key).write_bytes(data)
    _write(tmp_path / "crops" / "rationale-crops.json", {qid: key})


def test_main_dry_run_crops_the_rationale_under_its_content_hash_without_uploading(tmp_path, monkeypatch):
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    _patch_rationales(monkeypatch)
    monkeypatch.setattr(extract_sat, "upload_file", _refuse_upload)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    (row,) = _read(out_path)
    key = row["rationale_img"]
    assert key == _key(QID)
    assert re.fullmatch(r"sat/math/r/[0-9a-f]{20}\.jpg", key)
    assert QID not in key                       # not derivable from the question id
    assert row["img"] == f"sat/math/{QID}.jpg"
    # The local mirror is exactly where the dev local-image route resolves
    # the key: out/crops/<key without "sat/">.
    assert _local(tmp_path, key).read_bytes() == _rationale_bytes(QID)
    assert _read(tmp_path / "crops" / "rationale-crops.json") == {QID: key}
    assert not out_path.with_name("uploaded-rationales.json").exists()


def test_main_live_run_uploads_a_rationale_even_when_its_question_was_already_uploaded(tmp_path, monkeypatch):
    """The real situation after this task lands: all 3,731 questions are
    already in the bucket and recorded in uploaded.json. The rationale is
    bookkept separately (by key, per id), so it is still uploaded -- and the
    question is not uploaded a second time."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    _patch_rationales(monkeypatch)
    sent = []
    _live(monkeypatch, lambda dest, img: sent.append((dest, img)) or img)

    out_path = tmp_path / "out" / "rows.json"
    _question_already_uploaded(tmp_path, out_path)
    extract_sat.main(["--out", str(out_path)])

    assert sent == [(_local(tmp_path, _key(QID)), _key(QID))]
    assert _read(out_path.with_name("uploaded.json")) == [QID]
    assert _read(out_path.with_name("uploaded-rationales.json")) == {QID: _key(QID)}
    assert _read(out_path)[0]["rationale_img"] == _key(QID)


def test_main_resume_rerenders_and_reuploads_nothing_already_recorded(tmp_path, monkeypatch):
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    rendered = _patch_rationales(monkeypatch)
    _live(monkeypatch, _refuse_upload)

    out_path = tmp_path / "out" / "rows.json"
    _question_already_uploaded(tmp_path, out_path)
    _rationale_already_cropped(tmp_path, _key(QID), _rationale_bytes(QID))
    _write(out_path.with_name("uploaded-rationales.json"), {QID: _key(QID)})
    extract_sat.main(["--out", str(out_path)])

    assert rendered == []
    assert _read(out_path)[0]["rationale_img"] == _key(QID)


def test_a_rerender_with_identical_bytes_keeps_its_key_and_is_not_reuploaded(tmp_path, monkeypatch):
    """The crop record was lost but the upload record wasn't: the re-render
    is byte-identical (the renderer is deterministic), so its key is the
    one already uploaded."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    rendered = _patch_rationales(monkeypatch)
    _live(monkeypatch, _refuse_upload)

    out_path = tmp_path / "out" / "rows.json"
    _question_already_uploaded(tmp_path, out_path)
    _write(out_path.with_name("uploaded-rationales.json"), {QID: _key(QID)})
    extract_sat.main(["--out", str(out_path)])

    assert rendered == [QID]
    assert _read(out_path)[0]["rationale_img"] == _key(QID)


def test_a_rerender_whose_bytes_differ_gets_a_new_key_and_is_uploaded_under_it(tmp_path, monkeypatch):
    """The v1 crop was uploaded, then its local file went missing and the
    renderer now produces different bytes (v2). That is a different object:
    new key, uploaded, recorded in place of v1 -- the v1 object is left in
    the bucket, orphaned (the README says so)."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    _patch_rationales(monkeypatch, render=lambda pdf, regions, sizes: _rationale_bytes(QID, 2))
    sent = []
    _live(monkeypatch, lambda dest, img: sent.append(img) or img)

    out_path = tmp_path / "out" / "rows.json"
    _question_already_uploaded(tmp_path, out_path)
    _write(tmp_path / "crops" / "rationale-crops.json", {QID: _key(QID, 1)})  # its file is gone
    _write(out_path.with_name("uploaded-rationales.json"), {QID: _key(QID, 1)})
    extract_sat.main(["--out", str(out_path)])

    assert _key(QID, 2) != _key(QID, 1)
    assert sent == [_key(QID, 2)]
    assert _read(out_path.with_name("uploaded-rationales.json")) == {QID: _key(QID, 2)}
    assert _read(tmp_path / "crops" / "rationale-crops.json") == {QID: _key(QID, 2)}
    assert _read(out_path)[0]["rationale_img"] == _key(QID, 2)


def test_an_upload_record_from_the_old_list_format_confirms_nothing(tmp_path, monkeypatch, capsys):
    """A list of ids (the pre-content-hash format) says nothing about which
    key was uploaded, so every rationale is uploaded again under its key."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    _patch_rationales(monkeypatch)
    sent = []
    _live(monkeypatch, lambda dest, img: sent.append(img) or img)

    out_path = tmp_path / "out" / "rows.json"
    _question_already_uploaded(tmp_path, out_path)
    _write(out_path.with_name("uploaded-rationales.json"), [QID])
    extract_sat.main(["--out", str(out_path)])

    assert sent == [_key(QID)]
    assert "uploaded-rationales.json" in capsys.readouterr().err
    assert _read(out_path.with_name("uploaded-rationales.json")) == {QID: _key(QID)}


def test_main_live_run_uploads_question_then_rationale_before_the_row_exists(tmp_path, monkeypatch):
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    _patch_rationales(monkeypatch)
    calls = []
    real_record, real_record_key = extract_sat._record_uploaded, extract_sat._record_key

    def spy_record(path, qid, already):
        calls.append(("record", path.name))
        return real_record(path, qid, already)

    def spy_record_key(path, qid, key, record):
        calls.append(("record", path.name))
        return real_record_key(path, qid, key, record)

    _live(monkeypatch, lambda dest, img: calls.append(("upload", dest.name)) or img)
    monkeypatch.setattr(extract_sat, "_record_uploaded", spy_record)
    monkeypatch.setattr(extract_sat, "_record_key", spy_record_key)

    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--out", str(out_path)])

    assert calls == [
        ("upload", f"{QID}.jpg"), ("record", "uploaded.json"),
        ("record", "rationale-crops.json"),
        ("upload", _key(QID).rsplit("/", 1)[1]), ("record", "uploaded-rationales.json"),
    ]


def test_a_failed_rationale_upload_leaves_the_row_out_and_resumes_cleanly(tmp_path, monkeypatch):
    """A row exists only once everything it points at is uploaded. If the
    rationale upload dies, the row is not written -- but the question's
    upload is on record, so the resumed run uploads only the rationale."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    rendered = _patch_rationales(monkeypatch)

    def fail_rationale(dest, img):
        if "/r/" in img:
            raise RuntimeError("simulated rationale upload failure")
        return img

    _live(monkeypatch, fail_rationale)
    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="simulated rationale upload failure"):
        extract_sat.main(["--out", str(out_path)])
    assert _read(out_path) == []
    assert _read(out_path.with_name("uploaded.json")) == [QID]
    assert not out_path.with_name("uploaded-rationales.json").exists()

    sent = []
    _live(monkeypatch, lambda dest, img: sent.append(img) or img)
    extract_sat.main(["--out", str(out_path)])
    assert sent == [_key(QID)]
    assert rendered == [QID]  # the crop survived the failed run; not rendered twice
    assert _read(out_path)[0]["rationale_img"] == _key(QID)


def test_a_rationale_that_cannot_be_located_ships_the_row_without_one(tmp_path, monkeypatch):
    """Controller ruling 3: left out (text fallback) and recorded with its
    reason -- never approximated. The question itself still ships, so it
    is not in skipped.json."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record("id1"), _fake_record("id2")], _write_crop)
    _patch_rationales(
        monkeypatch,
        span=lambda a, i: None if i == "id1" else [{"page": 1, "top": 0.0, "bottom": 10.0, "qid": i}],
        reason=lambda a, i: "no-rationale-label" if i == "id1" else None,
    )
    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    rows = _read(out_path)
    assert [r["id"] for r in rows] == ["id1", "id2"]
    assert "rationale_img" not in rows[0] and rows[1]["rationale_img"] == _key("id2")
    assert _read(tmp_path / "crops" / "rationale-crops.json") == {"id2": _key("id2")}
    assert _read(out_path.with_name("skipped-rationales.json")) == [
        {"id": "id1", "reason": "no-rationale-label", "stage": "rationale-span", "section": "math"},
    ]
    assert _read(out_path.with_name("skipped.json")) == []


def test_a_render_refusal_is_recorded_and_the_row_ships_without_a_rationale_image(tmp_path, monkeypatch):
    def refuse(pdf, regions, sizes):
        raise extract_sat.RationaleCropError("cut-through-ink", "top of p1 at 510px")

    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record(QID)], _write_crop)
    _patch_rationales(monkeypatch, render=refuse)
    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    assert "rationale_img" not in _read(out_path)[0]
    assert not (tmp_path / "crops" / "math" / "r").exists()
    (entry,) = _read(out_path.with_name("skipped-rationales.json"))
    assert entry["stage"] == "rationale-render"
    assert entry["reason"].startswith("cut-through-ink")


def test_two_records_with_identical_rationale_bytes_share_one_object(tmp_path, monkeypatch):
    """Content addressing: byte-identical rationales are one object. Both
    rows point at it; it is written once locally."""
    _patch_fake_pipeline(monkeypatch, tmp_path, [_fake_record("id1"), _fake_record("id2")], _write_crop)
    _patch_rationales(monkeypatch, render=lambda pdf, regions, sizes: b"same bytes")
    out_path = tmp_path / "out" / "rows.json"
    extract_sat.main(["--dry-run", "--out", str(out_path)])

    key = extract_sat.rationale_bucket_path("math", b"same bytes")
    assert [r["rationale_img"] for r in _read(out_path)] == [key, key]
    assert list((tmp_path / "crops" / "math" / "r").iterdir()) == [_local(tmp_path, key)]


# --- per-id key records ------------------------------------------------------

def test_record_key_persists_and_load_keys_reads_it_back(tmp_path):
    path = tmp_path / "uploaded-rationales.json"
    record: dict[str, str] = {}
    extract_sat._record_key(path, "id1", "sat/math/r/aaaa.jpg", record)
    extract_sat._record_key(path, "id2", "sat/math/r/bbbb.jpg", record)
    extract_sat._record_key(path, "id1", "sat/math/r/cccc.jpg", record)
    assert extract_sat._load_keys(path) == record == {"id1": "sat/math/r/cccc.jpg", "id2": "sat/math/r/bbbb.jpg"}


def test_load_keys_treats_a_missing_or_corrupt_record_as_empty(tmp_path, capsys):
    assert extract_sat._load_keys(tmp_path / "missing.json") == {}
    bad = tmp_path / "bad.json"
    bad.write_text('{"id1": "sat/', encoding="utf-8")
    assert extract_sat._load_keys(bad) == {}
    assert "bad.json" in capsys.readouterr().err


def test_atomic_write_bytes_leaves_nothing_behind_on_failure(tmp_path, monkeypatch):
    dest = tmp_path / "math" / "r" / "k.jpg"

    def fail_replace(src, dst):
        raise OSError("disk full (simulated)")

    monkeypatch.setattr(extract_sat.os, "replace", fail_replace)
    with pytest.raises(OSError, match="disk full"):
        extract_sat._atomic_write_bytes(dest, b"jpeg")
    assert not dest.exists()
    assert list(dest.parent.glob("*.tmp-*")) == []
