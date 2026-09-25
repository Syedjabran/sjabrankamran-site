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


# Test 7, Math Module 1, Question 7, in the shape pdftotext really emits: the
# roots are stated with "either", and the entry note that repeats them wraps
# between "are" and "examples", so `_ENTRY_NOTE` cannot see it.
TEST_7_MATH_M1_Q7 = """SAT ANSWER EXPLANATIONS n MATH: MODULE 1

QUESTION 7

The correct answer is either 14, -5, or -4. The x-intercepts of a graph in the
xy-plane are the points at which the graph intersects the x-axis, or when the
value of y is 0. Applying the zero product property to this equation
yields three equations: x - 14 = 0, x + 5 = 0, and x + 4 = 0. Therefore, the x-coordinates of the x-intercepts
of the graph of the given equation are 14, -5, and -4. Note that 14, -5, and -4 are
examples of ways to enter a correct answer.
"""


def test_an_either_answer_ships_every_root_when_its_entry_note_wraps():
    """Rejected as no-answer before `parse_qbank`'s either handling was
    reused here -- which dropped all of test 7 under spec rule 4."""
    answers, rejected = parse_answers.parse_answers(TEST_7_MATH_M1_Q7)
    assert rejected == []
    assert answers[("math", 1, 7)] == {
        "kind": "spr", "accepted": ["14", "-5", "-4"], "source": "rationale-either",
    }


def test_an_entry_note_joined_with_or_ships_each_form_separately():
    """Test 7, Math Module 2, Q7 prints "Note that 11/4 or 2.75 are
    examples". Splitting only on commas and "and" shipped the single
    accepted value "11/4 or 2.75", which no student entry can ever match."""
    text = (
        "SAT ANSWER EXPLANATIONS n MATH: MODULE 2\n\nQUESTION 7\n\n"
        "the value of f b 14 l is 11\n. Note that 11/4 or 2.75 are examples of "
        "ways to enter a\n4\ncorrect answer.\n"
    )
    answers, _ = parse_answers.parse_answers(text)
    assert answers[("math", 2, 7)] == {
        "kind": "spr", "accepted": ["11/4", "2.75"], "source": "entry-note",
    }


def test_a_stated_answer_with_a_thousands_separator_keeps_every_digit():
    """Test 5, Math Module 2, Q14: "The correct answer is 4,205." shipped as
    "4". The bank's own key for these items prints no separator (e.g. 2850)."""
    text = (
        "SAT ANSWER EXPLANATIONS n MATH: MODULE 2\n\nQUESTION 14\n\n"
        "The correct answer is 4,205. The exterior surface area of a figure is the sum of the\n"
        "areas of its faces.\n"
    )
    answers, _ = parse_answers.parse_answers(text)
    assert answers[("math", 2, 14)] == {"kind": "spr", "accepted": ["4205"], "source": "rationale-stated"}


def test_a_stated_answer_joined_with_or_ships_both_values():
    """Test 4, Math Module 2, Q6: its entry note wraps between "are" and
    "examples" and prints an en dash for the minus, so the stated "15 or -5"
    is the only readable statement -- and it names two answers, not one."""
    text = (
        "SAT ANSWER EXPLANATIONS n MATH: MODULE 2\n\nQUESTION 6\n\n"
        "The correct answer is 15 or -5 . By the definition of absolute value, if x - 5 = 10 ,\n"
        "then x - 5 = 10 or x - 5 = -10. Thus, the\n"
        "given equation has two possible solutions, 15 and -5 . Note that 15 and –5 are\n"
        "examples of ways to enter a correct answer.\n"
    )
    answers, _ = parse_answers.parse_answers(text)
    assert answers[("math", 2, 6)] == {"kind": "spr", "accepted": ["15", "-5"], "source": "rationale-stated"}
