import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_sat_bank import validate

GOOD = [{
    "id": "ac472881", "section": "math", "domain": "algebra",
    "skill": "Linear equations in one variable", "difficulty": "H",
    "answer": {"kind": "spr", "accepted": ["403"]},
    "rationale": "The correct answer is 403.",
    "img": "sat/math/ac472881.jpg", "ref": "SAT Question Bank ac472881",
    "source": "question-bank",
}]


def test_validate_accepts_a_good_row():
    validate(GOOD)


def test_validate_rejects_missing_image():
    bad = [{**GOOD[0], "img": ""}]
    with pytest.raises(ValueError, match="image"):
        validate(bad)


def test_validate_rejects_duplicate_ids():
    with pytest.raises(ValueError, match="duplicate"):
        validate(GOOD + GOOD)


def test_validate_rejects_mcq_without_an_index():
    bad = [{**GOOD[0], "answer": {"kind": "mcq"}}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)


def test_validate_rejects_path_outside_sat_prefix():
    bad = [{**GOOD[0], "img": "o-level/p1/x.jpg"}]
    with pytest.raises(ValueError, match="prefix"):
        validate(bad)


def test_validate_tolerates_and_preserves_answer_source_key():
    """Real answer dicts carry a `source` key (answer-line / rationale /
    entry-note / rationale-stated) recording how parse_qbank established the
    answer -- the audit trail for the ~1 in 10 answers that come from
    rationale prose rather than the official `Correct Answer:` line.
    validate() must accept a row whose answer dict carries it without
    requiring it (a hand-authored row may omit it) and without stripping it.
    """
    with_source = [{**GOOD[0], "answer": {**GOOD[0]["answer"], "source": "answer-line"}}]
    validate(with_source)
    assert with_source[0]["answer"]["source"] == "answer-line"


def test_validate_rejects_unknown_section():
    """`section` is a closed 2-value vocabulary ("rw"/"math") -- this is a
    deliberate independent re-check of what extract_sat.py should already
    have gotten right, not a rule this gate invents; a typo anywhere
    upstream must not ship silently.
    """
    bad = [{**GOOD[0], "section": "science"}]
    with pytest.raises(ValueError, match="section"):
        validate(bad)


def test_validate_rejects_unknown_difficulty():
    bad = [{**GOOD[0], "difficulty": "X"}]
    with pytest.raises(ValueError, match="difficulty"):
        validate(bad)


def test_validate_rejects_unknown_domain():
    bad = [{**GOOD[0], "domain": "algebrra"}]  # typo, not a real domain slug
    with pytest.raises(ValueError, match="domain"):
        validate(bad)


def test_validate_rejects_non_dict_answer():
    """A malformed `answer` (not an object at all) must fail with this
    gate's own ValueError, not an AttributeError from calling `.get()` on
    something that isn't a dict -- still loud, but with a confusing
    traceback that doesn't say which row or why.
    """
    bad = [{**GOOD[0], "answer": "B"}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)


def test_validate_rejects_boolean_as_mcq_index():
    """`bool` is a subclass of `int` in Python, so `isinstance(True, int)`
    is True -- `correct: true` must not silently pass as a valid MCQ index.
    """
    bad = [{**GOOD[0], "answer": {"kind": "mcq", "correct": True}}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)
