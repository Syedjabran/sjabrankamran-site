"""Parse SAT Suite Question Bank PDF exports into verified records.

The block header is a flattened table, so label/value order varies between
items. Domain and difficulty are closed vocabularies, so they are found by
membership; whatever non-label line remains is the skill.

Answers come from the official `Correct Answer:` line where present. Some MCQ
exports drop that line entirely but still state the choice in the rationale
("Choice B is correct."). Grid-in (SPR) items often omit it too and state the
answer inside the rationale instead, either as "The correct answer is 2.6" or,
when the value is a rendered fraction the text layer drops, as "Note that 3/2
and 1.5 are examples of ways to enter a correct answer". That prose path is
shared with the practice tests' answer key and fails closed: a block with the
entry note resolves from the note or is rejected (`_note_answer`). Anything
still unresolved is rejected, never guessed.
"""
import re
from fractions import Fraction
from itertools import combinations

DOMAIN_SLUGS = {
    "Information and Ideas": "information-ideas",
    "Craft and Structure": "craft-structure",
    "Expression of Ideas": "expression-ideas",
    "Standard English Conventions": "standard-english",
    "Algebra": "algebra",
    "Advanced Math": "advanced-math",
    "Problem-Solving and Data Analysis": "psda",
    "Geometry and Trigonometry": "geometry-trig",
}

# Skill, like domain, is a closed vocabulary -- but unlike domain there is no
# official published list to check against, so this is hard-coded from the
# 30 real skill names verified in a full corpus run (out/qbank-records.json),
# not derived at runtime from the very output it is meant to validate. Two
# capitalizations of "Cross-Text/text Connections" both appear in the real
# exports and are both kept verbatim; that is a College Board inconsistency,
# not a parser bug.
SKILL_SLUGS = frozenset({
    # Algebra
    "Linear equations in one variable",
    "Linear equations in two variables",
    "Linear functions",
    "Linear inequalities in one or two variables",
    "Systems of two linear equations in two variables",
    # Advanced Math
    "Equivalent expressions",
    "Nonlinear equations in one variable and systems of equations in two variables",
    "Nonlinear functions",
    # Problem-Solving and Data Analysis
    "Evaluating statistical claims: Observational studies and experiments",
    "Inference from sample statistics and margin of error",
    "One-variable data: Distributions and measures of center and spread",
    "Percentages",
    "Probability and conditional probability",
    "Ratios, rates, proportional relationships, and units",
    "Two-variable data: Models and scatterplots",
    # Geometry and Trigonometry
    "Area and volume",
    "Circles",
    "Lines, angles, and triangles",
    "Right triangles and trigonometry",
    # Information and Ideas
    "Central Ideas and Details",
    "Command of Evidence",
    "Inferences",
    # Craft and Structure
    "Cross-Text Connections",
    "Cross-text Connections",
    "Text Structure and Purpose",
    "Words in Context",
    # Expression of Ideas
    "Rhetorical Synthesis",
    "Transitions",
    # Standard English Conventions
    "Boundaries",
    "Form, Structure, and Sense",
})

DIFFICULTY = {"Easy": "E", "Medium": "M", "Hard": "H"}
LABELS = {"Assessment", "Test", "Question", "Domain", "Skill", "Difficulty", "SAT", "Rationale"}
SECTIONS = {"Math": "math", "Reading and Writing": "rw"}

_ID = re.compile(r"^\s*([0-9a-f]{8})\b")
# The whole line, not one token: 91 grid-in answer lines list several forms
# (".1764, .1765, 3/17"), and a single-token capture kept only ".1764,".
_ANSWER = re.compile(r"Correct Answer:\s*([^\n]+)")
# Some MCQ exports omit the `Correct Answer:` line altogether; the rationale
# still names the right choice explicitly, and never says "is incorrect" for
# the correct one, so this is safe to trust as a fallback.
_CHOICE_CORRECT = re.compile(r"Choice ([A-D]) is correct\b")
# Grid-in (SPR) answers are numeric, so anchor on digits rather than free text:
# the brief's original `[^.]*?` is lazy and stops at the decimal point, so
# "The correct answer is 2.6." would only capture "2" instead of "2.6".
# A comma between digits with exactly three digits after it is a thousands
# separator, so "The correct answer is 4,205." is 4205, not 4 (practice tests
# 5-11 and bank id 9ee22c16). Several values may be stated with "or" ("15 or
# -5", practice test 4, Math module 2 Q6); every one of them is an answer.
# The minus may be printed as an en dash or U+2212; `_forms` normalises it.
_NUMBER = r"[-–−]?\d+(?:,\d{3}(?!\d))*(?:\.\d+)?(?:/\d+)?"
_IN_RATIONALE = re.compile(rf"The correct answer is\s+({_NUMBER}(?:\s+or\s+{_NUMBER})*)")
# A number printed with thousands separators: 1-3 digits not continuing a
# fraction or decimal, then comma-and-exactly-three-digit groups. "3,540" is
# one value; "3/2,1.5" is two.
_GROUPED = re.compile(r"(?<![\d./])(\d{1,3})((?:,\d{3})+)(?!\d)")
_DASHES = str.maketrans({"–": "-", "−": "-"})
# What separates the forms of one answer, measured on every answer line,
# entry note and "either" list in both corpora: a comma (with or without
# whitespace, optionally then "and"/"or"), or "and"/"or" between spaces.
# Thousands separators are removed before this split, so never split on.
_FORM_SEPARATOR = re.compile(r"\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+")
# One grid-in entry as a student types it: an integer, a decimal (with or
# without a leading 0), or a fraction, optionally negative.
_PLAIN = re.compile(r"^-?(?:\d+(?:\.\d+)?|\.\d+|\d+/[1-9]\d*)$")
# The entry note: "Note that 3/2 and 1.5 are examples of ways to enter a
# correct answer." pdftotext wraps it anywhere -- "Note\nthat" (test 9),
# "are\nexamples" (tests 4, 6, 7), and it drops stacked-fraction digits and
# equation fragments *between* the note's own lines (test 4 M2 Q13's note
# reads "Note that\n100\n10\n3/10 and .3 are examples"). So the note runs
# from the "Note that" nearest its end to whichever end comes first, "are
# examples" or "examples of ways"; `_note_forms` then reads it line by line.
_NOTE = re.compile(
    r"Note\s+that\b((?:(?!Note\s+that\b).)*?)(?:\bare\s+examples\b|\bexamples\s+of\s+ways\b)",
    re.S,
)
# A line of the note that carries the list itself: it has a list separator.
# A line without one, between the note's first and last lines, is a fragment
# the text layer dropped there ("100", "cos (L) =", "17n").
_LIST_LINE = re.compile(r",|\band\b|\bor\b")
# A grid-in whose equation has several roots is answered with all of them:
# "The correct answer is either 8 or 9." / "... either 14, -5, or -4."
# These are distinct correct answers, not alternative spellings of one, and
# College Board accepts any of them. `_IN_RATIONALE` cannot read them -- it
# anchors on a digit immediately after "is", where these have the word
# "either" -- so without this they are rejected as `no-answer` despite the
# answer being stated plainly (confirmed: question-bank id 364a2d25, and
# practice tests 7 and 9, where losing one item would drop the whole test
# under spec rule 4).
#
# The terminator is a period followed by whitespace rather than `[^.]`, so a
# decimal answer ("either 2.5 or 3.") keeps its fractional part.
_EITHER = re.compile(r"The correct answer is either\s+(.+?)\.\s")
# The same statement when its values are images the text layer dropped
# (bank id eeb4143c: "The correct answer is either\n\n,\n\n, or\n\n."). It
# still says the note lists several distinct answers.
_EITHER_PHRASE = re.compile(r"The correct answer is\s+either\b")


def _ungroup(text: str) -> str:
    """Remove thousands separators ("3,540" -> "3540"; College Board's own
    answer lines print these values without one, e.g. 2850 and 11875)."""
    return _GROUPED.sub(lambda m: m.group(1) + m.group(2).replace(",", ""), text)


def _forms(listing: str) -> list[str]:
    """The separate accepted forms in a printed list of them, each as a
    student enters it -- or [] when any part of the list is not a plain
    grid-in entry ("B Rationale" merged onto an answer line), because a list
    that cannot be read whole must not ship in part.

    Every list-reading path below splits through this one function, so the
    bank and the practice tests can never disagree on how a list is read.
    """
    parts = [
        p.strip().rstrip(".,;:").strip()
        for p in _FORM_SEPARATOR.split(_ungroup(listing.translate(_DASHES)))
    ]
    parts = [p for p in parts if p]
    return parts if parts and all(_PLAIN.match(p) for p in parts) else []


def _note_forms(text: str) -> list[str] | None:
    """The plain forms an entry note lists: None when the text has no note,
    [] when it has one that yields no plain form.

    The note's first line (from "Note that") and last line (up to "are
    examples") are always read; a line between them is read only if it
    carries a list separator, so the fragments pdftotext drops between the
    note's lines are skipped. Of what is read, only plain grid-in tokens are
    kept -- words and equation pieces are not forms. Whether the result is
    trustworthy is `_note_answer`'s decision, not this function's.
    """
    note = _NOTE.search(text)
    if note is None:
        return None
    lines = note.group(1).split("\n")
    kept = [ln for i, ln in enumerate(lines) if i in (0, len(lines) - 1) or _LIST_LINE.search(ln)]
    tokens = re.split(r"[\s,]+", _ungroup(" ".join(kept).translate(_DASHES)))
    return [t for t in (tok.rstrip(".;:") for tok in tokens) if _PLAIN.match(t)]


def _places(form: str) -> int:
    return len(form.split(".", 1)[1]) if "." in form else 0


def _note_values(forms: list[str]) -> set[Fraction] | None:
    """The distinct values a note's forms spell, or None when they do not
    hang together.

    Integers and fractions are exact, so each one is a value. A decimal is a
    grid-in's truncation or rounding of a value, so it must lie within one
    unit of its own last place of one of those values (".8823" and ".8824"
    are both 15/17); a decimal that matches none is a misread or a misprint
    (test 6 M2 Q20 prints "0.219" among the forms of 7/24 = 0.2916...). A
    note of decimals alone is one value, each within the coarser one's last
    place of the others.
    """
    exact = {Fraction(f) for f in forms if "." not in f}
    decimals = [f for f in forms if "." in f]
    if not exact:
        first = decimals[0]
        close = all(
            abs(Fraction(d) - Fraction(first)) <= Fraction(1, 10 ** min(_places(d), _places(first)))
            for d in decimals
        )
        return {Fraction(first)} if close else None
    for d in decimals:
        if not any(abs(Fraction(d) - v) < Fraction(1, 10 ** _places(d)) for v in exact):
            return None
    return exact


def _agrees(stated: str, forms: list[str]) -> bool:
    """Whether a stated value corroborates the note's forms.

    Numerically equal to one of them, or -- the one text-layer artefact this
    admits -- the stated sentence's rendering of the note's own stacked
    fraction p/q: pdftotext keeps only the numerator on that line ("The
    correct answer is 11" for 11/28, tests 4-11), only the denominator
    (test 6 M2 Q20's "24" for 7/24, whose 7 lands on the line above), or
    both digits run together ("12" for 1/2, test 6 M1 Q13; "14" for 1/4,
    test 10 M2 Q21). Anything else is a conflict.
    """
    if any(Fraction(stated) == Fraction(f) for f in forms):
        return True
    if not stated.isdigit():
        return False
    fractions = (f.lstrip("-").split("/") for f in forms if "/" in f)
    return any(stated in (p, q, p + q) for p, q in fractions)


def _note_answer(text: str) -> tuple[list[str] | None, str | None]:
    """(forms, reject_reason) for a block's entry note; (None, None) when the
    block has no note.

    Fail closed: a block that carries the note sentence resolves from the
    note or not at all -- never from the stated fallback, which is exactly
    what shipped "3" for 3/10 when the note wrapped. The note must yield
    plain forms that hang together (`_note_values`); several distinct values
    are accepted only in the multi-root shape ("The correct answer is either
    ..." or several stated values); and every stated or "either" value must
    agree with the note (`_agrees`), else the two official statements
    disagree and the item is rejected rather than resolved by choosing one.
    """
    forms = _note_forms(text)
    if forms is None:
        return None, None
    values = _note_values(forms) if forms else None
    if not values:
        return None, "unreadable-entry-note"
    stated = _either_values(text) or _stated_values(text)
    if len(values) > 1:
        if not (_EITHER_PHRASE.search(text) or len(stated) > 1):
            return None, "unreadable-entry-note"
        if len(stated) > 1 and {Fraction(s) for s in stated} != values:
            return None, f"answer-source-conflict: stated={stated} note={forms}"
    disagree = [s for s in stated if not _agrees(s, forms)]
    if disagree:
        return None, f"answer-source-conflict: stated={disagree} note={forms}"
    return forms, None


def _either_values(text: str) -> list[str]:
    """Every root an "either" answer states, or [] when there is none.

    "14, -5, or -4" -> three values. The comma and the "or" may appear
    together ("a, b, or c") or alone ("a or b"), so both separators are
    consumed in one split rather than leaving a stray "or 9" behind.
    Shared with parse_answers, which meets the same phrasing in practice
    tests 5, 7 and 9.
    """
    either = _EITHER.search(text)
    return _forms(either.group(1)) if either else []


def _stated_values(text: str) -> list[str]:
    """Every value "The correct answer is ..." states, or [] when there is
    none."""
    stated = _IN_RATIONALE.search(text)
    return _forms(stated.group(1)) if stated else []


def _spr_from_rationale(text: str) -> tuple[dict | None, str | None]:
    """A grid-in answer read from the rationale prose: (answer, reason).

    The entry note first, and fail-closed (`_note_answer`); only a block with
    no note at all falls back to the "either" roots, then the stated value.
    Shared by the bank (after its answer line) and parse_answers (after its
    MCQ phrasings), so both corpora resolve prose identically.
    """
    forms, reason = _note_answer(text)
    if reason:
        return None, reason
    if forms:
        return {"kind": "spr", "accepted": forms, "source": "entry-note"}, None
    vals = _either_values(text)
    if vals:
        return {"kind": "spr", "accepted": vals, "source": "rationale-either"}, None
    vals = _stated_values(text)
    if vals:
        return {"kind": "spr", "accepted": vals, "source": "rationale-stated"}, None
    return None, "no-answer"


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _header_region(lines: list[str]) -> tuple[list[str], int] | None:
    """Lines from the id through the header, difficulty included, plus the
    index within that slice of the line that anchored the boundary.

    The PDF header is a flattened 3-column table (Domain / Skill /
    Difficulty), read row by row. A domain or skill name that wraps onto a
    second line has its tail emitted *after* the difficulty value,
    interleaved with the other column's wrapped tail -- e.g. "Geometry and"
    / "Lines, angles, and" / "Hard" / "Trigonometry" / "triangles". Stopping
    at the first Easy/Medium/Hard line would truncate before those tails, so
    instead the header runs through the `Question` boundary line that marks
    the start of the stem, when one follows the difficulty value. If none
    does, there is nothing to recover and the header ends at difficulty.

    The returned index is the *specific* line that anchored this boundary --
    the first Easy/Medium/Hard token found -- not merely "some difficulty
    word is present somewhere in the header". A caller that re-scanned the
    header afterward for any DIFFICULTY member, instead of reading this
    exact index, could land on an unrelated second difficulty word bled in
    from elsewhere (e.g. question-stem text absorbed into the header) and
    ship the wrong one.
    """
    diff_idx = next((i for i, ln in enumerate(lines) if ln in DIFFICULTY), None)
    if diff_idx is None:
        return None
    question_idx = next(
        (i for i in range(diff_idx + 1, len(lines)) if lines[i] == "Question"), None
    )
    end = question_idx if question_idx is not None else diff_idx + 1
    return lines[:end], diff_idx


def _domain_and_skill(fragments: list[str]) -> tuple[str | None, str | None]:
    """Reassemble domain/skill from row-major, possibly wrapped fragments.

    A domain or skill name that wraps has its lines emitted in the header's
    row-by-row reading order, which is *not* a fixed layout: sometimes the
    two columns alternate one row at a time (e.g. "Geometry and" / "Lines,
    angles, and" / "Trigonometry" / "triangles"), and sometimes a wrapped
    domain's lines are consecutive with the skill following whole (e.g.
    "Standard English" / "Conventions" / "Boundaries"). Rather than assume
    one fixed pattern, every subsequence of 1-3 fragments (order preserved,
    not necessarily contiguous) is checked against the closed 8-value domain
    vocabulary. All sizes are collected before any decision is made: a
    unique match across every size is trusted -- two different real skills
    never collide with a domain name -- and the remaining fragments, in
    their original order, become the (not yet vocabulary-checked) skill.
    Stopping at the first size with exactly one match, instead of checking
    every size before deciding, would let a spurious smaller match shadow
    the real larger one without ever registering as ambiguous -- for
    example fragments ['Problem-Solving and', 'Algebra', 'Data Analysis']
    contain both the correct match {0, 2} = "Problem-Solving and Data
    Analysis" *and* the accidental single-fragment match {1} = "Algebra";
    only checking every size first exposes that as the ambiguity it is,
    instead of returning whichever size happens to be scanned first. An
    empty or ambiguous (2+) match set means the header can't be verified,
    so nothing is guessed.
    """
    n = len(fragments)
    all_matches = [
        idxs
        for size in range(1, min(n, 3) + 1)
        for idxs in combinations(range(n), size)
        if " ".join(fragments[i] for i in idxs) in DOMAIN_SLUGS
    ]
    if len(all_matches) != 1:
        return None, None
    domain_idxs = set(all_matches[0])
    domain = DOMAIN_SLUGS[" ".join(fragments[i] for i in all_matches[0])]
    skill_parts = [frag for i, frag in enumerate(fragments) if i not in domain_idxs]
    skill = " ".join(skill_parts) if skill_parts else None
    return domain, skill


def _resolve_skill(raw: str | None) -> str | None:
    """Recover the closed-vocabulary skill name from a raw reconstruction.

    Skill is a fixed 30-value vocabulary (`SKILL_SLUGS`) exactly like
    domain is an 8-value one. Sometimes text from the question body leaks
    into the header's skill fragments before the `Question` boundary is
    reached -- an absorbed question stem, a chart axis label, a table
    header -- so the raw reconstruction is right at the start and wrong at
    the end. Rather than reject those outright, the longest known skill
    that is a *prefix* of the raw string is trusted and the trailing noise
    is dropped; `longest` matters so a skill that happens to be a prefix of
    another (none currently are, but the vocabulary could grow) can never
    shadow the more specific, correct one. Only when no known skill is a
    prefix at all does this give up and return None.
    """
    if raw is None:
        return None
    candidates = [s for s in SKILL_SLUGS if raw.startswith(s)]
    if not candidates:
        return None
    return max(candidates, key=len)


def _answer_from(text: str) -> tuple[dict | None, str | None]:
    """Returns (answer, reject_reason); exactly one is None.

    `source` on the answer records which of the four paths resolved it, so
    "how many records rest on rationale prose alone" is a one-line query on
    the shipped data (see report_qbank.py's `by answer source` counter)
    instead of a fact only this function knows.
    """
    m = _ANSWER.search(text)
    if m:
        raw = m.group(1).strip()
        if len(raw) == 1 and raw.upper() in "ABCD":
            line_letter = raw.upper()
            # The official `Correct Answer:` line and the official rationale
            # are two independent statements from College Board of the same
            # fact. When they disagree, that is the source export
            # contradicting itself, not something this parser can resolve
            # by picking one -- shipping either risks shipping the wrong
            # one, so both are rejected together and reported precisely
            # enough to become a reviewed override later.
            choice = _CHOICE_CORRECT.search(text)
            if choice and choice.group(1) != line_letter:
                return None, f"answer-source-conflict: line={line_letter} rationale={choice.group(1)}"
            return {"kind": "mcq", "correct": "ABCD".index(line_letter), "source": "answer-line"}, None
        vals = _forms(raw)
        if not vals:
            # Not a letter and not a list of plain grid-in forms -- e.g. a
            # letter with the next heading merged on ("B Rationale").
            return None, "unreadable-answer-line"
        return {"kind": "spr", "accepted": vals, "source": "answer-line"}, None

    # No `Correct Answer:` line at all: MCQ's rationale-stated "Choice X is
    # correct" is tried before SPR's rationale patterns below, on purpose.
    # The two are mutually exclusive in the real corpus (an MCQ never also
    # carries "The correct answer is ..."/"Note that ... are examples"
    # phrasing), so this ordering is not resolving a genuine ambiguity
    # between the two -- it just means MCQ's fallback is checked first.
    choice = _CHOICE_CORRECT.search(text)
    if choice:
        return {"kind": "mcq", "correct": "ABCD".index(choice.group(1)), "source": "rationale"}, None

    return _spr_from_rationale(text)


def _parse_block_detailed(block: str) -> tuple[dict | None, str | None]:
    """Same contract as `parse_block`, but also returns *why* when rejected.

    `parse_block` stays a thin wrapper around this so its existing signature
    (and every test written against it) is unaffected; `parse_export` calls
    this directly so every reject in a report carries a specific, actionable
    reason instead of a single blanket "unverifiable".
    """
    ident = _ID.match(block)
    if not ident:
        return None, "no-id"
    qid = ident.group(1)

    region = _header_region(_lines(block))
    if region is None:
        return None, "no-difficulty"
    header, diff_idx = region

    section = next((v for k, v in SECTIONS.items() if k in header), None)
    # Read difficulty off the exact line `_header_region` anchored the
    # boundary on, not by re-scanning the header for any DIFFICULTY member
    # -- see `_header_region`'s docstring for why a re-scan can land on the
    # wrong one when a second difficulty-shaped word is present.
    difficulty = DIFFICULTY.get(header[diff_idx])
    if not section:
        return None, "no-section"
    if not difficulty:
        return None, "no-difficulty"

    known = LABELS | set(SECTIONS)
    fragments = [ln for ln in header[1:] if ln not in known and ln not in DIFFICULTY]
    domain, raw_skill = _domain_and_skill(fragments)
    if not domain:
        return None, "no-domain-match"
    skill = _resolve_skill(raw_skill)
    if not skill:
        return None, f"no-skill-match: raw={raw_skill!r}"

    answer, reason = _answer_from(block)
    if not answer:
        return None, reason or "no-answer"

    rationale = block.split("Rationale", 1)[1].strip() if "Rationale" in block else ""
    return {
        "id": qid,
        "section": section,
        "domain": domain,
        "skill": skill,
        "difficulty": difficulty,
        "answer": answer,
        "rationale": rationale,
    }, None


def parse_block(block: str) -> dict | None:
    """One `Question ID:`-delimited block, or None if it cannot be verified."""
    return _parse_block_detailed(block)[0]


def parse_export(text: str) -> tuple[list[dict], list[dict]]:
    """Parse a whole export. Returns (records, rejected); records are deduped by id."""
    records: list[dict] = []
    rejected: list[dict] = []
    seen: set[str] = set()
    for block in text.split("Question ID:")[1:]:
        rec, reason = _parse_block_detailed(block)
        if rec is None:
            ident = _ID.match(block)
            rejected.append({"id": ident.group(1) if ident else "?", "reason": reason or "unverifiable"})
            continue
        if rec["id"] in seen:
            continue
        seen.add(rec["id"])
        records.append(rec)
    return records, rejected
