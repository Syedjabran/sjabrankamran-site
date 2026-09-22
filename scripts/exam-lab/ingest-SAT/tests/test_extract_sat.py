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
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "export.pdf").write_bytes(b"")  # only needs to satisfy glob
    monkeypatch.setattr(extract_sat, "RAW", raw_dir)
    monkeypatch.setattr(extract_sat, "CROPS", tmp_path / "crops")

    records = [
        {"id": "id1", "section": "math", "domain": "algebra", "skill": "s", "difficulty": "H",
         "answer": {"kind": "spr", "accepted": ["1"], "source": "answer-line"}, "rationale": "r"},
        {"id": "id2", "section": "math", "domain": "algebra", "skill": "s", "difficulty": "H",
         "answer": {"kind": "spr", "accepted": ["2"], "source": "answer-line"}, "rationale": "r"},
        {"id": "id3", "section": "math", "domain": "algebra", "skill": "s", "difficulty": "H",
         "answer": {"kind": "spr", "accepted": ["3"], "source": "answer-line"}, "rationale": "r"},
    ]
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

    def fake_render_span(pdf, span, dest, **kw):
        if dest.stem == "id2":
            raise RuntimeError("simulated crash mid-render")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"fake-jpeg")
        return dest

    monkeypatch.setattr(extract_sat, "render_span", fake_render_span)

    out_path = tmp_path / "out" / "rows.json"
    with pytest.raises(RuntimeError, match="simulated crash mid-render"):
        extract_sat.main(["--dry-run", "--out", str(out_path)])

    assert out_path.exists()
    rows = json.loads(out_path.read_text(encoding="utf-8"))
    assert [r["id"] for r in rows] == ["id1"]  # id2 crashed before id3 was ever reached

    skipped_path = out_path.with_name("skipped.json")
    assert skipped_path.exists()
    assert json.loads(skipped_path.read_text(encoding="utf-8")) == []
