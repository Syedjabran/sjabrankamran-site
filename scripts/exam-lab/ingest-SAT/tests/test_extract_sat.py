"""Unit tests for extract_sat.py's orchestration logic: upload retry/backoff,
the append-only uploaded-ids record, and always-persisting partial results.

None of these touch the network or read/set/search any Supabase credential
-- `upload_file` and `render_span` are always monkeypatched with fakes.
"""
import json
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
