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


def _whole_test(test_no: int = 4) -> list[dict]:
    """Every question of one paper test -- 33/33/27/27 -- shaped like ROW,
    so tests that aren't themselves about the module counts pass that gate."""
    return [
        {**ROW, "test_no": test_no, "section": section, "module": module, "qnum": qnum,
         "img": f"sat/tests/{test_no}/{section}-m{module}-q{qnum}.jpg",
         "ref": f"SAT Practice Test {test_no} {section.upper()} Module {module} Q{qnum}"}
        for (section, module), size in build_sat_tests.MODULE_QUESTIONS.items()
        for qnum in range(1, size + 1)
    ]


def _complete_table() -> dict:
    """A conversion table shaped exactly like a loaded scoring.json entry --
    string raw-score keys 0..RAW_MAX per section, JSON-array [lo, hi]
    bounds -- so tests that aren't themselves about the table's shape don't
    have to hand-build one that satisfies build_sat_tests._check_table_complete."""
    return {
        section: {str(raw): [400, 400] for raw in range(raw_max + 1)}
        for section, raw_max in build_sat_tests.RAW_MAX.items()
    }


def test_validate_accepts_a_whole_test():
    build_sat_tests.validate(_whole_test(), {"4": _complete_table()})


def test_module_sizes_are_the_printed_33_33_27_27():
    assert build_sat_tests.MODULE_QUESTIONS == {
        ("rw", 1): 33, ("rw", 2): 33, ("math", 1): 27, ("math", 2): 27,
    }


def test_validate_rejects_a_test_missing_a_question():
    """Spec 10.4: a test ships whole or not at all -- the final gate re-checks
    it rather than trusting extract_tests.py."""
    rows = [r for r in _whole_test() if not (r["section"] == "math" and r["module"] == 2 and r["qnum"] == 27)]
    with pytest.raises(ValueError, match=r"math module 2: expected questions 1-27.*missing \[27\]"):
        build_sat_tests.validate(rows, {"4": _complete_table()})


def test_validate_rejects_a_question_past_the_end_of_its_module():
    extra = {**ROW, "qnum": 34, "img": "sat/tests/4/rw-m1-q34.jpg"}
    with pytest.raises(ValueError, match=r"rw module 1: expected questions 1-33.*extra \[34\]"):
        build_sat_tests.validate(_whole_test() + [extra], {"4": _complete_table()})


def test_validate_rejects_a_module_missing_entirely():
    rows = [r for r in _whole_test() if r["section"] != "rw" or r["module"] != 2]
    with pytest.raises(ValueError, match="rw module 2"):
        build_sat_tests.validate(rows, {"4": _complete_table()})


@pytest.mark.parametrize("correct", [4, -1, 7])
def test_validate_rejects_an_mcq_index_outside_the_four_options(correct):
    bad = {**ROW, "answer": {"kind": "mcq", "correct": correct, "source": "best-answer"}}
    with pytest.raises(ValueError, match="outside 0-3"):
        build_sat_tests.validate([bad], {"4": _complete_table()})


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
        build_sat_tests.validate(_whole_test(), {"4": table})


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
