import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_tests
import upload


def test_test_bucket_path_stays_under_the_sat_prefix():
    # Controller amendment (2026-09-25): keys live under tests/<n>/, not
    # practice/<n>/, to match the dev image route -- see the closing
    # amendments paragraph of task-5-brief.md.
    p = upload.test_bucket_path(4, "rw", 1, 12)
    assert p == "sat/tests/4/rw-m1-q12.jpg"
    assert upload.guard_prefix(p) == p


def test_a_test_missing_questions_is_dropped_whole_not_shipped_short():
    """Spec 10.4. Shipping 32 of 33 questions would put a broken form in
    front of a student and score it against a 33-question conversion table."""
    rows = [{"test_no": 4, "section": "rw", "module": 1, "qnum": n} for n in range(1, 33)]
    structure = [{"section": "rw", "module": 1, "questions": 33}]
    complaints = extract_tests.check_test_complete(4, rows, structure)
    assert complaints and "33" in complaints[0]


def test_a_complete_test_passes_the_structure_gate():
    rows = [{"test_no": 4, "section": "rw", "module": 1, "qnum": n} for n in range(1, 34)]
    structure = [{"section": "rw", "module": 1, "questions": 33}]
    assert extract_tests.check_test_complete(4, rows, structure) == []


def test_module_minutes_are_read_off_the_paper():
    text = ("Reading and Writing, Module 1: 39 minutes ... Reading and Writing, Module 2: 39 minutes "
            "Math, Module 1: 43 minutes ... Math, Module 2: 43 minutes")
    assert extract_tests.module_minutes(text) == {"rw": [39, 39], "math": [43, 43]}
    assert extract_tests.module_minutes(text.replace("Math, Module 2: 43 minutes", "")) is None
    assert extract_tests.module_minutes(text + " Math, Module 1: 35 minutes") is None


def test_a_row_is_never_emitted_without_a_resolved_answer():
    """Integrity rule 1: an unanswerable question is reported, not guessed."""
    with pytest.raises(KeyError):
        extract_tests.build_row(
            test_no=4, section="rw", module=1, qnum=1,
            answers={}, img="sat/tests/4/rw-m1-q1.jpg",
        )
