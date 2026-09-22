import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parse_qbank import parse_block, parse_export, DOMAIN_SLUGS

MCQ = """ b1c2d3e4

Assessment

Test

SAT

Reading and Writing

Question

Domain
Craft and Structure

Skill

Difficulty

Words in context

Medium

Which choice completes the text?

Correct Answer: C

Rationale

Choice C is the best answer because it fits the context.
"""

SPR_INLINE = """ ac472881

Assessment

Test

SAT

Math

Question

Domain
Algebra

Skill

Difficulty

Linear equations in one variable

Hard

What is the value of k ?

Correct Answer: 403

Rationale

The correct answer is 403.
"""

SPR_IN_RATIONALE = """ e62cfe5f

Assessment
Test
SAT
Math
Domain
Algebra
Skill
Linear functions
Difficulty
Medium
Question
What is the head width?
Rationale
The correct answer is 2.6. According to the model, the head width is found by
"""

SPR_FRACTION = """ d1b66ae6

Assessment
Test
SAT
Math
Question
Domain
Algebra
Skill
Systems of two linear equations in two variables
Difficulty
Hard
What is the value of y ?
Rationale
The correct answer is
. One method for solving is to add the equations.
Note that 3/2 and 1.5 are examples of ways to enter a correct answer.
"""

UNRESOLVABLE = """ ffffffff

Assessment
Test
SAT
Math
Question
Domain
Algebra
Skill
Linear functions
Difficulty
Easy
What is x ?
Rationale
Adding the two sides gives the result shown in the figure.
"""


def test_mcq_letter_becomes_index():
    r = parse_block(MCQ)
    assert r["id"] == "b1c2d3e4"
    assert r["section"] == "rw"
    assert r["domain"] == "craft-structure"
    assert r["skill"] == "Words in context"
    assert r["difficulty"] == "M"
    assert r["answer"] == {"kind": "mcq", "correct": 2}


def test_spr_inline_answer():
    r = parse_block(SPR_INLINE)
    assert r["section"] == "math"
    assert r["domain"] == "algebra"
    assert r["difficulty"] == "H"
    assert r["answer"] == {"kind": "spr", "accepted": ["403"]}


def test_spr_answer_recovered_from_rationale():
    r = parse_block(SPR_IN_RATIONALE)
    assert r["answer"] == {"kind": "spr", "accepted": ["2.6"]}
    assert r["skill"] == "Linear functions"


def test_spr_fraction_recovered_from_entry_note():
    r = parse_block(SPR_FRACTION)
    assert r["answer"]["kind"] == "spr"
    assert set(r["answer"]["accepted"]) == {"3/2", "1.5"}


def test_unresolvable_answer_is_rejected_not_guessed():
    assert parse_block(UNRESOLVABLE) is None


def test_parse_export_splits_dedupes_and_reports():
    text = "Question ID:".join(["", MCQ, SPR_INLINE, MCQ, UNRESOLVABLE])
    records, rejected = parse_export(text)
    assert [r["id"] for r in records] == ["b1c2d3e4", "ac472881"]
    assert [r["id"] for r in rejected] == ["ffffffff"]


def test_every_domain_has_a_slug():
    assert len(DOMAIN_SLUGS) == 8
    assert DOMAIN_SLUGS["Problem-Solving and Data Analysis"] == "psda"
