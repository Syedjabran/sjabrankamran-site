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


def _header_region(lines: list[str]) -> list[str] | None:
    """Lines from the id through the header, difficulty included.

    The PDF header is a flattened 3-column table (Domain / Skill /
    Difficulty), read row by row. A domain or skill name that wraps onto a
    second line has its tail emitted *after* the difficulty value,
    interleaved with the other column's wrapped tail -- e.g. "Geometry and"
    / "Lines, angles, and" / "Hard" / "Trigonometry" / "triangles". Stopping
    at the first Easy/Medium/Hard line would truncate before those tails, so
    instead the header runs through the `Question` boundary line that marks
    the start of the stem, when one follows the difficulty value. If none
    does, there is nothing to recover and the header ends at difficulty.
    """
    diff_idx = next((i for i, ln in enumerate(lines) if ln in DIFFICULTY), None)
    if diff_idx is None:
        return None
    question_idx = next(
        (i for i in range(diff_idx + 1, len(lines)) if lines[i] == "Question"), None
    )
    end = question_idx if question_idx is not None else diff_idx + 1
    return lines[:end]


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
    vocabulary. A unique match is trusted -- two different real skills never
    collide with a domain name -- and the remaining fragments, in their
    original order, are the skill. An empty or ambiguous (2+) match set
    means the header can't be verified, so nothing is guessed.
    """
    n = len(fragments)
    for size in range(1, min(n, 3) + 1):
        matches = [
            idxs
            for idxs in combinations(range(n), size)
            if " ".join(fragments[i] for i in idxs) in DOMAIN_SLUGS
        ]
        if len(matches) > 1:
            return None, None
        if len(matches) == 1:
            domain_idxs = set(matches[0])
            domain = DOMAIN_SLUGS[" ".join(fragments[i] for i in matches[0])]
            skill_parts = [frag for i, frag in enumerate(fragments) if i not in domain_idxs]
            skill = " ".join(skill_parts) if skill_parts else None
            return domain, skill
    return None, None


def _answer_from(text: str) -> dict | None:
    m = _ANSWER.search(text)
    if m:
        raw = m.group(1).strip()
        if len(raw) == 1 and raw.upper() in "ABCD":
            return {"kind": "mcq", "correct": "ABCD".index(raw.upper())}
        return {"kind": "spr", "accepted": [raw]}

    choice = _CHOICE_CORRECT.search(text)
    if choice:
        return {"kind": "mcq", "correct": "ABCD".index(choice.group(1))}

    note = _ENTRY_NOTE.search(text)
    if note:
        parts = re.split(r"\s*(?:,|and)\s*", note.group(1))
        vals = [p.strip() for p in parts if p.strip()]
        if vals:
            return {"kind": "spr", "accepted": vals}

    stated = _IN_RATIONALE.search(text)
    if stated:
        return {"kind": "spr", "accepted": [stated.group(1)]}

    return None


def parse_block(block: str) -> dict | None:
    """One `Question ID:`-delimited block, or None if it cannot be verified."""
    ident = _ID.match(block)
    if not ident:
        return None
    qid = ident.group(1)

    header = _header_region(_lines(block))
    if header is None:
        return None

    section = next((v for k, v in SECTIONS.items() if k in header), None)
    difficulty = next((DIFFICULTY[d] for d in DIFFICULTY if d in header), None)
    if not (section and difficulty):
        return None

    known = LABELS | set(SECTIONS)
    fragments = [ln for ln in header[1:] if ln not in known and ln not in DIFFICULTY]
    domain, skill = _domain_and_skill(fragments)
    if not (domain and skill):
        return None

    answer = _answer_from(block)
    if not answer:
        return None

    rationale = block.split("Rationale", 1)[1].strip() if "Rationale" in block else ""
    return {
        "id": qid,
        "section": section,
        "domain": domain,
        "skill": skill,
        "difficulty": difficulty,
        "answer": answer,
        "rationale": rationale,
    }


def parse_export(text: str) -> tuple[list[dict], list[dict]]:
    """Parse a whole export. Returns (records, rejected); records are deduped by id."""
    records: list[dict] = []
    rejected: list[dict] = []
    seen: set[str] = set()
    for block in text.split("Question ID:")[1:]:
        rec = parse_block(block)
        if rec is None:
            ident = _ID.match(block)
            rejected.append({"id": ident.group(1) if ident else "?", "reason": "unverifiable"})
            continue
        if rec["id"] in seen:
            continue
        seen.add(rec["id"])
        records.append(rec)
    return records, rejected
