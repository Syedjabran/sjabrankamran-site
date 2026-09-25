import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parse_qbank import parse_block, parse_export, DOMAIN_SLUGS, _domain_and_skill

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

Words in Context

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
# still names the right choice explicitly. `Question` is placed in its real
# post-difficulty position (unlike the other loose fixtures above) so this
# exercises _header_region's new extension path, not its legacy fallback.
MCQ_ANSWER_ONLY_IN_RATIONALE = """ 46f68129

Assessment
Test
Domain
Skill
Difficulty
SAT
Math
Algebra
Linear equations in one variable
Easy

Question
How many books were distributed?

Rationale
Choice B is correct. Subtracting the number of books left over from the
total number of books results in the number of books distributed.
"""

# Real pdftotext output where question-stem text bleeds into the header
# before the `Question` boundary is reached (id 121dc44f: "times the" /
# "population, what is the value of" are fragments of the stem, not of the
# skill). The raw skill reconstruction absorbs them, but the correct skill
# name is still its prefix, so `_resolve_skill`'s closed-vocabulary check
# recovers "Percentages" instead of shipping the polluted string or
# rejecting a question that PDF layout, not the parser, corrupted.
SKILL_BLEED_FROM_STEM = """ 121dc44f

Assessment
Test
Domain
Skill
Difficulty
SAT
Math
Problem-Solving and
Percentages
Medium
times the
population, what is the value of
Data Analysis

Question
The population of City A increased. What is the value of x ?

Correct Answer: C

Rationale
Choice C is correct. It's given that the population of City A increased...
"""

# The official `Correct Answer:` line and the official rationale disagree --
# this happens in the real export (ids bf5f80c6, 1e11190a). That is the
# source data contradicting itself, not something the parser should resolve
# by picking a side.
MCQ_ANSWER_SOURCE_CONFLICT = """ bf5f80c6

Assessment
Test
Domain
Skill
Difficulty
SAT
Math
Algebra
Linear functions
Medium

Question
Which value satisfies the equation?

Correct Answer: A

Rationale
Choice D is correct. Substituting the given value into the equation...
"""

# The reviewer's exact bug report: a header carrying "Hard" -- the real
# difficulty, and the line `_header_region` actually anchors the boundary
# on -- then "Easy" elsewhere in the header (simulating a stray wrapped-row
# word). The old code re-derived difficulty by re-scanning DIFFICULTY in
# dict order (Easy, Medium, Hard) and would find "Easy" first regardless of
# which one is the true boundary, shipping "E" instead of the correct "H".
TWO_DIFFICULTY_WORDS_HEADER = """ 7a2b9c1d

Assessment
Test
Domain
Skill
Difficulty
SAT
Math
Algebra
Linear equations in one variable
Hard
Easy

Question
What is x ?

Correct Answer: B

Rationale
Choice B is correct.
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
    assert r["skill"] == "Words in Context"
    assert r["difficulty"] == "M"
    assert r["answer"] == {"kind": "mcq", "correct": 2, "source": "answer-line"}


def test_spr_inline_answer():
    r = parse_block(SPR_INLINE)
    assert r["section"] == "math"
    assert r["domain"] == "algebra"
    assert r["difficulty"] == "H"
    assert r["answer"] == {"kind": "spr", "accepted": ["403"], "source": "answer-line"}


def test_spr_answer_recovered_from_rationale():
    r = parse_block(SPR_IN_RATIONALE)
    assert r["answer"] == {"kind": "spr", "accepted": ["2.6"], "source": "rationale-stated"}
    assert r["skill"] == "Linear functions"


def test_spr_fraction_recovered_from_entry_note():
    r = parse_block(SPR_FRACTION)
    assert r["answer"]["kind"] == "spr"
    assert set(r["answer"]["accepted"]) == {"3/2", "1.5"}
    assert r["answer"]["source"] == "entry-note"


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
    assert r["answer"] == {"kind": "mcq", "correct": 1, "source": "rationale"}


def test_spr_entry_note_survives_reordered_suffix():
    r = parse_block(SPR_ENTRY_NOTE_REORDERED)
    assert r["answer"]["kind"] == "spr"
    assert set(r["answer"]["accepted"]) == {"1/2", ".5"}
    assert r["answer"]["source"] == "entry-note"


def test_domain_and_skill_ambiguous_match_is_rejected():
    # A spurious smaller match ({1} = "Algebra") coexists with the real
    # larger one ({0, 2} = "Problem-Solving and Data Analysis"); both must
    # be seen before deciding, or the smaller one silently wins.
    assert _domain_and_skill(["Problem-Solving and", "Algebra", "Data Analysis"]) == (None, None)


def test_difficulty_derived_from_boundary_line_not_a_dict_order_rescan():
    r = parse_block(TWO_DIFFICULTY_WORDS_HEADER)
    assert r["difficulty"] == "H"


def test_skill_bleed_from_stem_recovered_by_vocabulary_prefix():
    r = parse_block(SKILL_BLEED_FROM_STEM)
    assert r["domain"] == "psda"
    assert r["skill"] == "Percentages"


def test_answer_source_conflict_is_rejected_not_resolved():
    assert parse_block(MCQ_ANSWER_SOURCE_CONFLICT) is None


def test_answer_source_conflict_reason_is_specific():
    text = "Question ID:" + MCQ_ANSWER_SOURCE_CONFLICT
    _, rejected = parse_export(text)
    assert rejected == [{"id": "bf5f80c6", "reason": "answer-source-conflict: line=A rationale=D"}]


def test_parse_export_splits_dedupes_and_reports():
    text = "Question ID:".join(["", MCQ, SPR_INLINE, MCQ, UNRESOLVABLE])
    records, rejected = parse_export(text)
    assert [r["id"] for r in records] == ["b1c2d3e4", "ac472881"]
    assert [r["id"] for r in rejected] == ["ffffffff"]


def test_every_domain_has_a_slug():
    assert len(DOMAIN_SLUGS) == 8
    assert DOMAIN_SLUGS["Problem-Solving and Data Analysis"] == "psda"


def test_spr_either_phrasing_yields_every_stated_root():
    """A grid-in whose equation has several roots is answered with all of
    them: "The correct answer is either 8 or 9." College Board accepts any
    one of them, so all must ship. Confirmed on question-bank id 364a2d25,
    which was rejected as no-answer until this phrasing was handled."""
    block = (
        "364a2d25\nAssessment\nSAT\nTest\nMath\nDomain\nAlgebra\nSkill\n"
        "Systems of two linear equations in two variables\nDifficulty\nHard\n"
        "Question\nWhat is a solution?\n"
        "Rationale\nThe correct answer is either 8 or 9. The first equation "
        "can be rewritten as follows.\n"
    )
    record = parse_block(block)
    assert record is not None, "the answer is stated plainly and must resolve"
    assert record["answer"]["kind"] == "spr"
    assert record["answer"]["accepted"] == ["8", "9"]
    assert record["answer"]["source"] == "rationale-either"


def test_spr_either_phrasing_handles_a_comma_and_or_list():
    """"either 14, -5, or -4" is three answers, not "14" plus a stray
    "or -4". Confirmed in practice test 7, Math module 1 Q7."""
    block = (
        "abcd1234\nAssessment\nSAT\nTest\nMath\nDomain\nAlgebra\nSkill\n"
        "Nonlinear equations in one variable and systems of equations in two variables\n"
        "Difficulty\nHard\nQuestion\nWhat is an x-intercept?\n"
        "Rationale\nThe correct answer is either 14, -5, or -4. The x-intercepts "
        "of a graph are the points where it meets the axis.\n"
    )
    record = parse_block(block)
    assert record["answer"]["accepted"] == ["14", "-5", "-4"]


def test_spr_either_phrasing_keeps_a_decimal_intact():
    """The terminator is a period followed by whitespace, so "2.5" survives
    where an `[^.]` capture would have truncated it to "2"."""
    block = (
        "abcd5678\nAssessment\nSAT\nTest\nMath\nDomain\nAlgebra\nSkill\n"
        "Linear equations in one variable\nDifficulty\nMedium\n"
        "Question\nSolve.\n"
        "Rationale\nThe correct answer is either 2.5 or 3. Substituting yields "
        "the result.\n"
    )
    record = parse_block(block)
    assert record["answer"]["accepted"] == ["2.5", "3"]


def test_entry_note_matches_when_the_phrase_wraps_across_a_line_break():
    """pdftotext breaks "Note that" across lines in the real material
    (practice test 9, Math module 2 Q14). A literal space silently missed it
    and the item fell through to no-answer despite a stated answer."""
    block = (
        "ef019012\nAssessment\nSAT\nTest\nMath\nDomain\nAlgebra\nSkill\n"
        "Linear equations in one variable\nDifficulty\nMedium\n"
        "Question\nSolve.\n"
        "Rationale\nSetting each factor equal to 0 yields two equations. Note\n"
        "that 2 and -12 are examples of ways to enter a correct answer.\n"
    )
    record = parse_block(block)
    assert record["answer"]["kind"] == "spr"
    assert set(record["answer"]["accepted"]) == {"2", "-12"}


def test_entry_note_forms_joined_by_or_are_split():
    """"Note that 11/4 or 2.75 are examples" is two accepted forms. The
    split is shared with parse_answers, where practice test 7 Math module 2
    Q7 prints exactly this; "11/4 or 2.75" as one value matches no entry."""
    block = (
        "ab12cd34\nAssessment\nSAT\nTest\nMath\nDomain\nAlgebra\nSkill\n"
        "Linear functions\nDifficulty\nMedium\n"
        "Question\nEvaluate.\n"
        "Rationale\nThe value is 11/4. Note that 11/4 or 2.75 are examples of "
        "ways to enter a correct answer.\n"
    )
    record = parse_block(block)
    assert record["answer"] == {"kind": "spr", "accepted": ["11/4", "2.75"], "source": "entry-note"}


def _spr_block(ident, tail):
    return (
        f"{ident}\nAssessment\nSAT\nTest\nMath\nDomain\nAlgebra\nSkill\n"
        f"Linear functions\nDifficulty\nMedium\nQuestion\nEvaluate.\n{tail}"
    )


def test_answer_line_ships_every_form_it_lists():
    """91 bank rows print several forms on the answer line, comma-space
    separated (e.g. 002dba45 ".1764, .1765, 3/17"); a single-token capture
    kept only ".1764," -- trailing comma included."""
    record = parse_block(_spr_block("002dba45", "Correct Answer: .1764, .1765, 3/17\n\nRationale\nThe correct answer is\n\n.\n"))
    assert record["answer"] == {"kind": "spr", "accepted": [".1764", ".1765", "3/17"], "source": "answer-line"}


def test_answer_line_keeps_a_negative_form_in_a_list():
    record = parse_block(_spr_block("abcd0001", "Correct Answer: -13/2, -6.5\n\nRationale\nText.\n"))
    assert record["answer"]["accepted"] == ["-13/2", "-6.5"]


def test_answer_line_thousands_separator_is_stripped_not_split():
    """A comma with exactly three digits after it and no space is a
    thousands separator: one value, entered without the comma."""
    record = parse_block(_spr_block("abcd0002", "Correct Answer: 3,540\n\nRationale\nText.\n"))
    assert record["answer"]["accepted"] == ["3540"]


def test_stated_answer_keeps_every_digit_past_a_thousands_separator():
    """Bank id 9ee22c16: "The correct answer is 3,540." shipped as "3"."""
    record = parse_block(_spr_block("9ee22c16", "Rationale\nThe correct answer is 3,540. According to the table, of 400 voters.\n"))
    assert record["answer"] == {"kind": "spr", "accepted": ["3540"], "source": "rationale-stated"}


def test_stated_answer_with_or_ships_both_values():
    record = parse_block(_spr_block("abcd0003", "Rationale\nThe correct answer is 15 or -5 . By the definition.\n"))
    assert record["answer"]["accepted"] == ["15", "-5"]
