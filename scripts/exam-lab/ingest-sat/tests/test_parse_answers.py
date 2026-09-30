import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import parse_answers
import reviewed

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

The correct answer is 1.5. Note that 3/2 and 1.5 are examples of ways to
enter a correct answer.
"""
# QUESTION 3's stated value was 2.6 in the plan's fixture -- a value its own
# note does not list. Under the fail-closed rule that is two official
# statements disagreeing, so it is now its own test
# (test_a_stated_value_the_note_does_not_list_is_a_conflict).


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
# between "are" and "examples".
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
    """Rejected as no-answer in round 1, which dropped all of test 7 under
    spec rule 4. The note reader now reads the wrapped note itself, and the
    "either" roots corroborate it."""
    answers, rejected = parse_answers.parse_answers(TEST_7_MATH_M1_Q7)
    assert rejected == []
    assert answers[("math", 1, 7)] == {
        "kind": "spr", "accepted": ["14", "-5", "-4"], "source": "entry-note",
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


def _item(body, module=1, qnum=1):
    """(answer, rejected) for one Math grid-in block with `body` as its text."""
    header = f"SAT ANSWER EXPLANATIONS n MATH: MODULE {module}\n\nQUESTION {qnum}\n\n"
    answers, rejected = parse_answers.parse_answers(header + body)
    return answers.get(("math", module, qnum)), rejected


def test_a_stated_answer_joined_with_or_ships_both_values():
    answer, _ = _item("The correct answer is 15 or -5 . By the definition of absolute value.\n")
    assert answer == {"kind": "spr", "accepted": ["15", "-5"], "source": "rationale-stated"}


# Test 4, Math Module 2, Q6 as pdftotext emits it: the note wraps between
# "are" and "examples" and prints its minus as an en dash.
TEST_4_MATH_M2_Q6 = (
    "The correct answer is 15 or -5 . By the definition of absolute value, if x - 5 = 10 ,\n"
    "then x - 5 = 10 or x - 5 = -10. Thus, the\n"
    "given equation has two possible solutions, 15 and -5 . Note that 15 and \u20135 are\n"
    "examples of ways to enter a correct answer.\n"
)


def test_an_en_dash_minus_in_a_wrapped_note_is_read_as_a_minus():
    answer, _ = _item(TEST_4_MATH_M2_Q6, module=2, qnum=6)
    assert answer == {"kind": "spr", "accepted": ["15", "-5"], "source": "entry-note"}


# Test 6, Math Module 1, Q13 as pdftotext emits it: the answer 1/2 is a
# stacked fraction, so the stated sentence reads "12" (numerator and
# denominator run together), and the note wraps before "examples".
TEST_6_MATH_M1_Q13 = (
    "The correct answer is 12 . The value of h ^2h is the value of h ^xh when x = 2.\n\n"
    "Substituting 2 for x in the given equation yields h ^2h= 5^28h+ 6 , which is equivalent\n"
    "8\n"
    "to h ^2h= 16\n"
    ", or h ^2h= 12 . Therefore, the value of h ^2h is 12 . Note that 1/2 and .5 are\n\n"
    "examples of ways to enter a correct answer.\n"
)


def test_a_stacked_fraction_is_read_from_its_note_not_its_stated_digits():
    """Shipped ["12"] before: the note wrapped, so the stated fallback won."""
    answer, rejected = _item(TEST_6_MATH_M1_Q13, qnum=13)
    assert rejected == []
    assert answer == {"kind": "spr", "accepted": ["1/2", ".5"], "source": "entry-note"}


def test_an_unreadable_note_fails_closed_instead_of_shipping_the_stated_value():
    """The same item with a note that yields no plain form must be rejected,
    never resolved from "The correct answer is 12"."""
    unreadable = TEST_6_MATH_M1_Q13.replace("1/2 and .5", "one half and a half")
    answer, rejected = _item(unreadable, qnum=13)
    assert answer is None
    assert rejected == [{"section": "math", "module": 1, "qnum": 13, "reason": "unreadable-entry-note"}]


def test_a_wrapped_note_skips_the_equation_fragments_between_its_lines():
    """Test 4, Math Module 2, Q20: pdftotext drops "cos (L) =", "17n" and
    "17" between the note's lines; the stated sentence keeps only 15 of
    15/17. Shipped ["15"] before."""
    body = (
        "The correct answer is 15 . It's given that angle J is the right angle in triangle JKL.\n"
        "17\n\n"
        "of each side of this equation yields JL = 15n . Since cos (L) = , it follows that\n"
        "KL\n15n\n15\n"
        ", which can be rewritten as cos (L) = . Note that 15/17, .8824, .8823,\n"
        "cos (L) =\n17n\n17\n"
        "and 0.882 are examples of ways to enter a correct answer.\n"
    )
    answer, _ = _item(body, module=2, qnum=20)
    assert answer == {"kind": "spr", "accepted": ["15/17", ".8824", ".8823", "0.882"], "source": "entry-note"}


def test_a_note_split_by_stacked_digits_before_its_forms_is_read():
    """Test 4, Math Module 2, Q13: "Note that" is followed by the stray
    denominators "100" and "10" before the forms. Shipped ["3"] before."""
    body = (
        "The correct answer is 3 . It's given that there are a total of 100 tiles of equal\n"
        "10\n\n"
        "By definition, the probability of selecting a red tile is given by 30 , or 3 . Note that\n"
        "100\n10\n"
        "3/10 and .3 are examples of ways to enter a correct answer.\n"
    )
    answer, _ = _item(body, module=2, qnum=13)
    assert answer == {"kind": "spr", "accepted": ["3/10", ".3"], "source": "entry-note"}


def test_a_note_whose_forms_disagree_fails_closed():
    """Test 6, Math Module 2, Q20 prints 0.219 among the forms of 7/24
    (0.2916...). A note that does not hang together is not shipped."""
    body = (
        "7\nThe correct answer is 24\n. An expression of the form n a m.\n"
        "Dividing both sides of this equation by 8 yields c = 24\n. Note\n\n"
        "that 7/24, .2916, .2917, 0.219, and 0.292 are examples of ways to enter a correct\n"
        "answer.\n"
    )
    answer, rejected = _item(body, module=2, qnum=20)
    assert answer is None
    assert rejected[0]["reason"] == "unreadable-entry-note"


def test_a_stated_value_the_note_does_not_list_is_a_conflict():
    answer, rejected = _item(
        "The correct answer is 2.6. Note that 3/2 and 1.5 are examples of ways to\n"
        "enter a correct answer.\n"
    )
    assert answer is None
    assert rejected[0]["reason"].startswith("answer-source-conflict")


def test_several_values_in_a_note_need_the_either_shape():
    """A note listing distinct values is a multi-root answer only when the
    rationale says so; otherwise it cannot be told from misread fragments."""
    note = "Note that 2 and -12 are examples of ways to enter a correct answer.\n"
    answer, rejected = _item("Setting each factor equal to 0 yields two equations. " + note)
    assert answer is None and rejected[0]["reason"] == "unreadable-entry-note"
    answer, _ = _item("The correct answer is either 2 or -12. Setting each factor to 0. " + note)
    assert answer == {"kind": "spr", "accepted": ["2", "-12"], "source": "entry-note"}


def test_an_override_ships_over_the_parse_and_clears_the_rejection():
    answers, rejected = {}, [{"section": "math", "module": 2, "qnum": 20, "reason": "unreadable-entry-note"}]
    override = {"test": 6, "section": "math", "module": 2, "qnum": 20,
                "accepted": ["7/24", ".2916"], "verified": "fixture"}
    answers, rejected, stale = parse_answers.apply_overrides(answers, rejected, 6, [override])
    assert answers[("math", 2, 20)] == {"kind": "spr", "accepted": ["7/24", ".2916"], "source": "reviewed"}
    assert rejected == [] and stale == []


def test_an_override_the_parse_now_agrees_with_is_reported_stale():
    answers = {("math", 2, 20): {"kind": "spr", "accepted": [".2916", "7/24"], "source": "entry-note"}}
    override = {"test": 6, "section": "math", "module": 2, "qnum": 20,
                "accepted": ["7/24", ".2916"], "verified": "fixture"}
    _, _, stale = parse_answers.apply_overrides(answers, [], 6, [override])
    assert len(stale) == 1 and "('math', 2, 20)" in stale[0]


def test_an_override_only_applies_to_its_own_test():
    override = {"test": 6, "section": "math", "module": 2, "qnum": 20,
                "accepted": ["7/24"], "verified": "fixture"}
    answers, _, _ = parse_answers.apply_overrides({}, [], 5, [override])
    assert answers == {}


def test_reviewed_json_overrides_test_6_m2_q20_without_the_misprint():
    [entry] = reviewed.entries("answer_overrides", 6)
    assert (entry["section"], entry["module"], entry["qnum"]) == ("math", 2, 20)
    assert entry["accepted"] == ["7/24", ".2916", ".2917", "0.292"]
    assert all(reviewed.entries("answer_overrides", n) == [] for n in (4, 5, 7, 8, 9, 10, 11))
