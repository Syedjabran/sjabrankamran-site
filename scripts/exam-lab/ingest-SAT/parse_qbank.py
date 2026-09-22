"""Parse SAT Suite Question Bank PDF exports into verified records.

The block header is a flattened table, so label/value order varies between
items. Domain and difficulty are closed vocabularies, so they are found by
membership; whatever non-label line remains is the skill.

Answers come from the official `Correct Answer:` line where present. Grid-in
(SPR) items often omit it and state the answer inside the rationale instead,
either as "The correct answer is 2.6" or, when the value is a rendered
fraction the text layer drops, as "Note that 3/2 and 1.5 are examples of ways
to enter a correct answer". Anything still unresolved is rejected, never guessed.
"""
import re

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
# Grid-in (SPR) answers are numeric, so anchor on digits rather than free text:
# the brief's original `[^.]*?` is lazy and stops at the decimal point, so
# "The correct answer is 2.6." would only capture "2" instead of "2.6".
_IN_RATIONALE = re.compile(r"The correct answer is\s+(-?\d+(?:\.\d+)?(?:/\d+)?)")
_ENTRY_NOTE = re.compile(r"Note that\s+(.+?)\s+are examples of ways to enter")


def _head_and_body(text: str) -> tuple[list[str], str]:
    """Split a block into its header lines and everything from the question on."""
    lines = [ln.strip() for ln in text.splitlines()]
    head: list[str] = []
    for ln in lines:
        if not ln:
            continue
        head.append(ln)
        if ln in DIFFICULTY:          # difficulty is the last header value
            break
    return head, text


def _answer_from(text: str) -> dict | None:
    m = _ANSWER.search(text)
    if m:
        raw = m.group(1).strip()
        if len(raw) == 1 and raw.upper() in "ABCD":
            return {"kind": "mcq", "correct": "ABCD".index(raw.upper())}
        return {"kind": "spr", "accepted": [raw]}

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

    head, full = _head_and_body(block)
    section = next((v for k, v in SECTIONS.items() if k in head), None)
    domain = next((DOMAIN_SLUGS[d] for d in DOMAIN_SLUGS if d in head), None)
    difficulty = next((DIFFICULTY[d] for d in DIFFICULTY if d in head), None)
    if not (section and domain and difficulty):
        return None

    known = LABELS | set(DOMAIN_SLUGS) | set(DIFFICULTY) | set(SECTIONS)
    skill = next((ln for ln in head[1:] if ln not in known and not ln.startswith(qid)), None)
    if not skill:
        return None

    answer = _answer_from(full)
    if not answer:
        return None

    rationale = full.split("Rationale", 1)[1].strip() if "Rationale" in full else ""
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
