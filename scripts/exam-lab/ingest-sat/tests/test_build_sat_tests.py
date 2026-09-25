import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_sat_tests

ROW = {
    "test_no": 4, "section": "rw", "module": 1, "qnum": 1,
    "answer": {"kind": "mcq", "correct": 1, "source": "best-answer"},
    "img": "sat/tests/4/rw-m1-q1.jpg",
    "ref": "SAT Practice Test 4 RW Module 1 Q1", "source": "practice-test",
}


def _complete_table() -> dict:
    """A conversion table shaped exactly like a loaded scoring.json entry --
    string raw-score keys 0..RAW_MAX per section, JSON-array [lo, hi]
    bounds -- so tests that aren't themselves about the table's shape don't
    have to hand-build one that satisfies build_sat_tests._check_table_complete."""
    return {
        section: {str(raw): [400, 400] for raw in range(raw_max + 1)}
        for section, raw_max in build_sat_tests.RAW_MAX.items()
    }


def test_validate_accepts_a_good_row():
    build_sat_tests.validate([ROW], {"4": _complete_table()})


def test_validate_rejects_an_image_outside_the_sat_prefix():
    bad = {**ROW, "img": "o-level/4/x.jpg"}
    with pytest.raises(ValueError, match="sat/"):
        build_sat_tests.validate([bad], {"4": {"rw": {}, "math": {}}})


def test_validate_rejects_a_test_with_no_conversion_table():
    """Spec 10.5: without an ingested table there is no official score, and
    a practice test that cannot be scored officially is not shippable as
    one."""
    with pytest.raises(ValueError, match="conversion"):
        build_sat_tests.validate([ROW], {})


def test_timings_must_be_present_for_every_shipped_test():
    build_sat_tests.check_timings([ROW], {"4": {"rw": [39, 39], "math": [43, 43]}})
    with pytest.raises(ValueError, match="time limits"):
        build_sat_tests.check_timings([ROW], {})
    with pytest.raises(ValueError, match="time limits"):
        build_sat_tests.check_timings([ROW], {"4": {"rw": [39], "math": [43, 43]}})


def test_rows_are_emitted_in_the_client_shape():
    q = build_sat_tests.to_client(ROW)
    assert q["testNo"] == 4 and "test_no" not in q and q["img"] == "sat/tests/4/rw-m1-q1.jpg"


def test_validate_rejects_a_duplicate_question_slot():
    with pytest.raises(ValueError, match="duplicate"):
        build_sat_tests.validate([ROW, ROW], {"4": {"rw": {}, "math": {}}})


def test_validate_rejects_a_bool_correct_for_mcq():
    """isinstance(True, int) is True in Python, so a JSON `"correct": true`
    must be rejected explicitly rather than accepted as index 1."""
    bad = {**ROW, "answer": {"kind": "mcq", "correct": True, "source": "best-answer"}}
    with pytest.raises(ValueError, match="index"):
        build_sat_tests.validate([bad], {"4": _complete_table()})


def test_validate_rejects_a_test_with_an_incomplete_conversion_table():
    """Spec 10.5: the table must be whole, not merely present -- a table
    missing even one raw score cannot officially score every possible
    result on that test."""
    table = _complete_table()
    del table["rw"]["7"]
    with pytest.raises(ValueError, match="incomplete"):
        build_sat_tests.validate([ROW], {"4": table})


def test_build_refuses_a_dry_run_rows_file(tmp_path):
    """Same gate as the question bank: a dry run's images do not exist."""
    rows = tmp_path / "rows.json"
    rows.write_text(json.dumps([ROW]), encoding="utf-8")
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": True}), encoding="utf-8")
    with pytest.raises(ValueError, match="dry-run"):
        build_sat_tests.check_provenance([ROW], rows, allow_dry_run=False)


def test_check_provenance_live_branch_passes_when_every_img_is_uploaded(tmp_path):
    """extract_tests.py's uploaded.json records the bucket KEY (a row's
    `img`), not a College Board `id` -- practice-test rows have no `id` at
    all, so the live branch must be keyed by `img` here, not the question
    bank's default."""
    rows = tmp_path / "rows.json"
    rows.write_text(json.dumps([ROW]), encoding="utf-8")
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    (tmp_path / "uploaded.json").write_text(json.dumps([ROW["img"]]), encoding="utf-8")
    build_sat_tests.check_provenance(  # must not raise
        [ROW], rows, allow_dry_run=False, key=lambda row: row["img"])


def test_check_provenance_live_branch_raises_naming_the_missing_img(tmp_path):
    rows = tmp_path / "rows.json"
    rows.write_text(json.dumps([ROW]), encoding="utf-8")
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": False}), encoding="utf-8")
    (tmp_path / "uploaded.json").write_text(json.dumps([]), encoding="utf-8")
    with pytest.raises(ValueError, match="rw-m1-q1"):
        build_sat_tests.check_provenance(
            [ROW], rows, allow_dry_run=False, key=lambda row: row["img"])
