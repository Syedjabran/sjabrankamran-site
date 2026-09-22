"""Parse SAT Suite Question Bank PDF exports into verified records.

The block header is a flattened table, so label/value order varies between
items. Domain and difficulty are closed vocabularies, so they are found by
membership; whatever non-label line remains is the skill.

Answers come from the official `Correct Answer:` line where present. Some MCQ
exports drop that line entirely but still state the choice in the rationale
("Choice B is correct."). Grid-in (SPR) items often omit it too and state the
answer inside the rationale instead, either as "The correct answer is 2.6" or,
when the value is a rendered fraction the text layer drops, as "Note that 3/2
and 1.5 are examples of ways to enter a correct answer". Anything still
unresolved is rejected, never guessed.
"""
import re
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
_ANSWER = re.compile(r"Correct Answer:\s*(\S+)")
# Some MCQ exports omit the `Correct Answer:` line altogether; the rationale
# still names the right choice explicitly, and never says "is incorrect" for
# the correct one, so this is safe to trust as a fallback.
_CHOICE_CORRECT = re.compile(r"Choice ([A-D]) is correct\b")
# Grid-in (SPR) answers are numeric, so anchor on digits rather than free text:
# the brief's original `[^.]*?` is lazy and stops at the decimal point, so
# "The correct answer is 2.6." would only capture "2" instead of "2.6".
_IN_RATIONALE = re.compile(r"The correct answer is\s+(-?\d+(?:\.\d+)?(?:/\d+)?)")
# The trailing "of ways to enter a correct answer" is dropped: pdftotext's
# column layout sometimes reorders this sentence so that half lands earlier
# in the block than "Note that ... are examples" itself (see
# test_spr_entry_note_survives_reordered_suffix). The captured group is the
# same either way, so relaxing the suffix costs nothing on the normal case.
_ENTRY_NOTE = re.compile(r"Note that\s+(.+?)\s+are examples")


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
        return {"kind": "spr", "accepted": [raw], "source": "answer-line"}, None

    # No `Correct Answer:` line at all: MCQ's rationale-stated "Choice X is
    # correct" is tried before SPR's rationale patterns below, on purpose.
    # The two are mutually exclusive in the real corpus (an MCQ never also
    # carries "The correct answer is ..."/"Note that ... are examples"
    # phrasing), so this ordering is not resolving a genuine ambiguity
    # between the two -- it just means MCQ's fallback is checked first.
    choice = _CHOICE_CORRECT.search(text)
    if choice:
        return {"kind": "mcq", "correct": "ABCD".index(choice.group(1)), "source": "rationale"}, None

    note = _ENTRY_NOTE.search(text)
    if note:
        parts = re.split(r"\s*(?:,|and)\s*", note.group(1))
        vals = [p.strip() for p in parts if p.strip()]
        if vals:
            return {"kind": "spr", "accepted": vals, "source": "entry-note"}, None

    stated = _IN_RATIONALE.search(text)
    if stated:
        return {"kind": "spr", "accepted": [stated.group(1)], "source": "rationale-stated"}, None

    return None, "no-answer"


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
