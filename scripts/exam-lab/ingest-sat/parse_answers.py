"""Read the official answer key out of a practice test's explanations PDF.

The key is the highest authority available for these tests, so it is read
directly rather than inferred: every answer here came from College Board
stating it in print. Anything this cannot resolve is rejected and reported,
never guessed (spec section 10.1).

Three phrasings occur, all official, all measured on test 4:

    Choice B is the best answer ...      Reading and Writing MCQ  (66)
    Choice D is correct. ...             Math MCQ                 (40)
    The correct answer is 2.6. ...       Math SPR                 (14)

The surrounding prose says "Choice X is incorrect" about every distractor,
so the correct-answer patterns must not also match those. They do not: the
literal "is correct" is not a substring of "is incorrect" at the anchor
position, because "incorrect" begins with an i where "correct" begins the
match.

Question numbers restart at 1 in each module, so the key is keyed by
(section, module, qnum) -- keying on the number alone would let Math
Module 1's Q1 silently overwrite Reading and Writing Module 1's Q1.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler
from parse_qbank import _CHOICE_CORRECT, _ENTRY_NOTE, _IN_RATIONALE

# The bullet between "EXPLANATIONS" and the section name extracts as a bare
# letter n; accept any short run of non-alphabetic filler so a different
# glyph in another test does not break the header.
_RUNNING_HEADER = re.compile(
    r"SAT ANSWER EXPLANATIONS.{0,4}(READING AND WRITING|MATH):\s*MODULE\s*([12])",
    re.IGNORECASE,
)
_QUESTION = re.compile(r"^QUESTION\s+(\d+)\s*$")
# Reading and Writing's own phrasing, absent from the question-bank corpus
# and so not already covered by parse_qbank's regexes.
_BEST_ANSWER = re.compile(r"Choice ([A-D]) is the best answer\b")

SECTION_OF = {"READING AND WRITING": "rw", "MATH": "math"}


def text_of(pdf: Path) -> str:
    """Plain text for `pdf`, decoded strict UTF-8 (see bbox.bbox_xml for why
    the explicit encoding is not optional)."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "t.txt"
        subprocess.run(
            [poppler.tool("pdftotext"), str(pdf), str(out)],
            check=True, capture_output=True, encoding="utf-8",
        )
        return out.read_text(encoding="utf-8")


def _answer_from(block: str) -> tuple[dict | None, str | None]:
    """(answer, reject_reason) -- exactly one is None.

    Order matters. The entry note ("Note that 3/2 and 1.5 are examples...")
    is checked before the bare stated value, because an item carrying both
    should ship every accepted form, not just the first one printed.
    """
    best = _BEST_ANSWER.search(block)
    if best:
        return {"kind": "mcq", "correct": "ABCD".index(best.group(1)), "source": "best-answer"}, None

    choice = _CHOICE_CORRECT.search(block)
    if choice:
        return {"kind": "mcq", "correct": "ABCD".index(choice.group(1)), "source": "rationale"}, None

    note = _ENTRY_NOTE.search(block)
    if note:
        vals = [p.strip() for p in re.split(r"\s*(?:,|and)\s*", note.group(1)) if p.strip()]
        if vals:
            return {"kind": "spr", "accepted": vals, "source": "entry-note"}, None

    stated = _IN_RATIONALE.search(block)
    if stated:
        return {"kind": "spr", "accepted": [stated.group(1)], "source": "rationale-stated"}, None

    return None, "no-answer"


def parse_answers(text: str) -> tuple[dict, list[dict]]:
    """({(section, module, qnum): answer}, rejected).

    The running header is what establishes which module the following
    QUESTION headings belong to. It repeats on every page, which is exactly
    what makes it reliable: the section/module context is re-stated more
    often than it changes, so a block can never inherit a stale one.
    """
    answers: dict[tuple[str, int, int], dict] = {}
    rejected: list[dict] = []
    section: str | None = None
    module: int | None = None
    current: tuple[str, int, int] | None = None
    buffer: list[str] = []

    def flush() -> None:
        if current is None:
            return
        answer, reason = _answer_from("\n".join(buffer))
        if answer is None:
            rejected.append({
                "section": current[0], "module": current[1],
                "qnum": current[2], "reason": reason,
            })
        else:
            answers[current] = answer

    for line in text.splitlines():
        head = _RUNNING_HEADER.search(line)
        if head:
            section = SECTION_OF[head.group(1).upper()]
            module = int(head.group(2))
            continue
        q = _QUESTION.match(line.strip())
        if q:
            flush()
            buffer = []
            current = (section, module, int(q.group(1))) if section and module else None
            continue
        buffer.append(line)
    flush()
    return answers, rejected


def check_structure(answers: dict, rejected: list[dict], structure: list[dict]) -> list[str]:
    """Spec section 10.4: a test whose question count does not match its
    printed module structure is a parse failure, not something to ship short.

    Returns a list of complaints; empty means the test matches. Counts
    `rejected` items too -- a module with 33 questions of which 2 could not
    be resolved is still structurally complete but not shippable, and the
    caller needs to tell those two situations apart.
    """
    problems: list[str] = []
    for mod in structure:
        key = (mod["section"], mod["module"])
        got = {k[2] for k in answers if k[:2] == key}
        lost = {r["qnum"] for r in rejected if (r["section"], r["module"]) == key}
        expected = set(range(1, mod["questions"] + 1))
        if got | lost != expected:
            problems.append(
                f"{key[0]} module {key[1]}: expected questions {min(expected)}-{max(expected)}, "
                f"found {len(got | lost)} ({sorted(expected - (got | lost))[:5]} missing)"
            )
        if lost:
            problems.append(f"{key[0]} module {key[1]}: unresolved answers for {sorted(lost)}")
    return problems
