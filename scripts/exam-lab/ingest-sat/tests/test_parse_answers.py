import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import parse_answers

# Shape taken verbatim from test 4's answer-explanations PDF: a running
# header on every page, a QUESTION heading per item, and the three official
# answer phrasings. The "is incorrect" sentences are the distractor prose
# that surrounds every real answer and must never be mistaken for the key.
ANSWERS_TEXT = """SAT ANSWER EXPLANATIONS n READING AND WRITING: MODULE 1

Reading and Writing
Module 1
(33 questions)

QUESTION 1

Choice B is the best answer because it most logically completes the text.
Choice A is incorrect because in this context "attached" means connected.
Choice C is incorrect because the text discusses a brief encounter.

SAT ANSWER EXPLANATIONS n READING AND WRITING: MODULE 1

QUESTION 2

Choice A is the best answer because it most logically completes the text.
Choice D is incorrect because it misreads the passage.

SAT ANSWER EXPLANATIONS n MATH: MODULE 1

Math
Module 1
(27 questions)

QUESTION 1

Choice D is correct. Substituting 5 for x yields the given value.
Choice B is incorrect and may result from conceptual or calculation errors.

QUESTION 2

The correct answer is 10 .

QUESTION 3

The correct answer is 2.6. Note that 3/2 and 1.5 are examples of ways to
enter a correct answer.
"""


def test_reads_the_rw_best_answer_phrasing():
    answers, rejected = parse_answers.parse_answers(ANSWERS_TEXT)
    assert answers[("rw", 1, 1)] == {"kind": "mcq", "correct": 1, "source": "best-answer"}


def test_reads_the_math_choice_is_correct_phrasing():
    answers, _ = parse_answers.parse_answers(ANSWERS_TEXT)
    assert answers[("math", 1, 1)] == {"kind": "mcq", "correct": 3, "source": "rationale"}


def test_is_incorrect_is_never_read_as_the_key():
    """Every item's prose says "Choice X is incorrect" about the distractors.
    Matching one of those would ship a wrong key on nearly every question --
    the single most expensive parse bug available here."""
    answers, _ = parse_answers.parse_answers(ANSWERS_TEXT)
    assert answers[("rw", 1, 1)]["correct"] == 1   # B, not the A/C distractors
    assert answers[("math", 1, 1)]["correct"] == 3  # D, not the B distractor


def test_reads_a_bare_spr_value_with_the_extraction_space_before_the_period():
    """pdftotext yields "The correct answer is 10 ." -- with a space. The
    value is 10, not "10 " and not a failure."""
    answers, _ = parse_answers.parse_answers(ANSWERS_TEXT)
    assert answers[("math", 1, 2)] == {"kind": "spr", "accepted": ["10"], "source": "rationale-stated"}


def test_prefers_the_entry_note_when_one_lists_equivalent_forms():
    answers, _ = parse_answers.parse_answers(ANSWERS_TEXT)
    assert answers[("math", 1, 3)]["kind"] == "spr"
    assert set(answers[("math", 1, 3)]["accepted"]) == {"3/2", "1.5"}


def test_question_numbers_are_scoped_to_their_own_module():
    """Both R&W Module 1 and Math Module 1 have a QUESTION 1. Keying on the
    number alone would silently overwrite one with the other."""
    answers, _ = parse_answers.parse_answers(ANSWERS_TEXT)
    assert ("rw", 1, 1) in answers and ("math", 1, 1) in answers
    assert answers[("rw", 1, 1)] != answers[("math", 1, 1)]


def test_an_unresolvable_item_is_rejected_not_guessed():
    text = ANSWERS_TEXT + "\n\nQUESTION 4\n\nThis explanation names no choice at all.\n"
    answers, rejected = parse_answers.parse_answers(text)
    assert ("math", 1, 4) not in answers
    assert rejected[-1]["reason"] == "no-answer"
