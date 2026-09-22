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

# Real pdftotext output for a two-line domain name: the header is a flattened
# 3-column table read row by row, so "Geometry and Trigonometry" and its
# skill "Lines, angles, and triangles" each wrap onto a second line, and both
# tails land *after* the difficulty value ("Hard" is the true difficulty,
# sitting mid-header, not a spurious bare line before it).
WRAPPED_DOMAIN = """ 6d99b141

Assessment
Test
Domain
Skill
Difficulty
SAT
Math
Geometry and
Lines, angles, and
Hard
Trigonometry
triangles

Question
In the figure, what is the value of x ?

Correct Answer: 83

Rationale
The correct answer is 83. It's given that in the figure...
"""

# Real pdftotext output where the domain fits on one line but the skill still
# wraps, with the difficulty value again landing between the skill's two
# fragments.
WRAPPED_SKILL_ONLY = """ 36ab4122

Assessment
Test
Domain
Skill
Difficulty
SAT
Math
Algebra
Linear equations in one
Medium
variable

Question
What is Megan's regular hourly wage?

Rationale
Choice B is correct. Since p represents Megan's regular pay per hour...
"""

# Real pdftotext output where a wrapped domain's two lines are consecutive
# rather than alternating with skill's line -- the opposite ordering from
# WRAPPED_DOMAIN above, both seen in the real corpus.
WRAPPED_DOMAIN_CONSECUTIVE = """ eb03096e

Assessment
Test
Domain
Skill
Difficulty
SAT
Reading and Writing
Standard English
Conventions
Boundaries
Easy

Question
Which choice completes the text?

Correct Answer: D

Rationale
Choice D is the best answer.
"""

# Some MCQ exports drop the `Correct Answer:` line entirely; the rationale
# still names the right choice explicitly.
MCQ_ANSWER_ONLY_IN_RATIONALE = """ 46f68129

Assessment
Test
SAT
Math
Question
Domain
Algebra
Skill
Linear equations in one variable
Difficulty
Easy
How many books were distributed?

Rationale
Choice B is correct. Subtracting the number of books left over from the
total number of books results in the number of books distributed.
"""

# pdftotext's column layout reorders this sentence so the tail ("of ways to
# enter a correct answer") lands before "Note that ... are examples" itself.
SPR_ENTRY_NOTE_REORDERED = """ 466b87e3

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
If the system has no solution, what is the value of c ?

Rationale
The correct answer is

. For the system of equations to have no solution, the value of c must be

of ways to enter a correct answer.

. Note that 1/2 and .5 are examples
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


def test_wrapped_domain_name_reassembled_across_difficulty():
    r = parse_block(WRAPPED_DOMAIN)
    assert r["domain"] == "geometry-trig"
    assert r["skill"] == "Lines, angles, and triangles"
    assert r["difficulty"] == "H"


def test_wrapped_skill_only_reassembled_across_difficulty():
    r = parse_block(WRAPPED_SKILL_ONLY)
    assert r["domain"] == "algebra"
    assert r["skill"] == "Linear equations in one variable"
    assert r["difficulty"] == "M"


def test_wrapped_domain_with_consecutive_lines_not_alternating():
    r = parse_block(WRAPPED_DOMAIN_CONSECUTIVE)
    assert r["domain"] == "standard-english"
    assert r["skill"] == "Boundaries"
    assert r["difficulty"] == "E"


def test_mcq_answer_recovered_from_rationale_when_answer_line_missing():
    r = parse_block(MCQ_ANSWER_ONLY_IN_RATIONALE)
    assert r["answer"] == {"kind": "mcq", "correct": 1}


def test_spr_entry_note_survives_reordered_suffix():
    r = parse_block(SPR_ENTRY_NOTE_REORDERED)
    assert r["answer"]["kind"] == "spr"
    assert set(r["answer"]["accepted"]) == {"1/2", ".5"}


def test_parse_export_splits_dedupes_and_reports():
    text = "Question ID:".join(["", MCQ, SPR_INLINE, MCQ, UNRESOLVABLE])
    records, rejected = parse_export(text)
    assert [r["id"] for r in records] == ["b1c2d3e4", "ac472881"]
    assert [r["id"] for r in rejected] == ["ffffffff"]


def test_every_domain_has_a_slug():
    assert len(DOMAIN_SLUGS) == 8
    assert DOMAIN_SLUGS["Problem-Solving and Data Analysis"] == "psda"
