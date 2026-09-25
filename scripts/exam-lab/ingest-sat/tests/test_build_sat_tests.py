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


def test_validate_accepts_a_good_row():
    build_sat_tests.validate([ROW], {"4": {"rw": {0: (200, 200)}, "math": {0: (200, 200)}}})


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


def test_build_refuses_a_dry_run_rows_file(tmp_path):
    """Same gate as the question bank: a dry run's images do not exist."""
    rows = tmp_path / "rows.json"
    rows.write_text(json.dumps([ROW]), encoding="utf-8")
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": True}), encoding="utf-8")
    with pytest.raises(ValueError, match="dry-run"):
        build_sat_tests.check_provenance([ROW], rows, allow_dry_run=False)
