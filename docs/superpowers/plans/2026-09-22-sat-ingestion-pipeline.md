# SAT Question-Bank Ingestion Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 3,770 official SAT Suite Question Bank items on disk into a verified, deduplicated, cropped question bank the site can serve.

**Architecture:** A Python pipeline mirroring `scripts/exam-lab/ingest-5054/` in both structure and discipline. Text parsing resolves metadata and answers; poppler renders and crops the exact question region; images upload to the private Supabase `exam-assets` bucket under a `sat/` prefix; a build step emits typed JSON into `src/lib/sat/`. Nothing ships that could not be verified against the official export.

**Tech Stack:** Python 3.13, pytest 8.4.2, poppler 25.07.0 (conda, absolute-path resolved), Pillow 11.3.0, Supabase storage REST API.

**Spec:** `docs/superpowers/specs/2026-09-22-sat-module-design.md`

## Global Constraints

- Poppler binaries are resolved by **absolute path** to `C:/Users/Baqir/miniconda3/Library/bin/`, never through PATH. The Xpdf 4.00 build on PATH emits a different `-bbox` XML layout and must never be used.
- Answers ship only from the official `Correct Answer:` line, the official rationale, or `reviewed.json`. A question whose answer cannot be resolved is **skipped and reported**, never guessed.
- Domain, skill and difficulty ship only as College Board labelled them.
- `Question ID` is the primary key. An item appearing in two exports ingests once.
- Question images must **exclude the metadata header**, so difficulty is never visible to a student sitting the question.
- All bucket writes go under the `sat/` prefix. The pipeline never reads, lists or writes outside it.
- Raw source PDFs are gitignored (`scripts/exam-lab/ingest-*/raw/`) and must never be committed.
- Source material lives in `scripts/exam-lab/ingest-sat/raw/`. If the directory is still named `ingest-SAT`, rename it to lowercase first (Task 0).

---

### Task 0: Normalise the working directory

**Files:**
- Rename: `scripts/exam-lab/ingest-SAT/` → `scripts/exam-lab/ingest-sat/`

- [ ] **Step 1: Check the current name**

```bash
ls -d scripts/exam-lab/ingest-*
```

- [ ] **Step 2: Rename if it is uppercase**

A case-only rename on Windows needs two hops. A stale file handle from an earlier shell can block it; if it fails, close other shells and retry.

```bash
cd scripts/exam-lab
mv ingest-SAT ingest-sat-tmp && mv ingest-sat-tmp ingest-sat
ls -d ingest-*
```

- [ ] **Step 3: Confirm raw material is still ignored**

```bash
cd /c/Users/Baqir/Documents/jj/sjabrankamran-site
git status --short scripts/
```
Expected: no PDF or zip paths listed.

---

### Task 1: Poppler resolution and preflight

**Files:**
- Create: `scripts/exam-lab/ingest-sat/poppler.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_poppler.py`

**Interfaces:**
- Produces: `POPPLER_BIN: Path`, `tool(name: str) -> str`, `preflight() -> None`

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_poppler.py
import subprocess
import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import poppler


def test_tool_returns_absolute_path():
    p = poppler.tool("pdftotext")
    assert Path(p).is_absolute()
    assert Path(p).exists()


def test_tool_rejects_unknown_binary():
    with pytest.raises(ValueError):
        poppler.tool("rm")


def test_preflight_accepts_real_poppler():
    poppler.preflight()  # must not raise


def test_preflight_rejects_xpdf(monkeypatch):
    def fake(cmd, **kw):
        return subprocess.CompletedProcess(
            cmd, 0, stderr="pdftotext version 4.00\nCopyright 1996-2017 Glyph & Cog, LLC\n", stdout=""
        )
    monkeypatch.setattr(poppler.subprocess, "run", fake)
    with pytest.raises(RuntimeError, match="Xpdf"):
        poppler.preflight()
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_poppler.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'poppler'`

- [ ] **Step 3: Write the implementation**

```python
# scripts/exam-lab/ingest-sat/poppler.py
"""Absolute-path poppler resolution.

The Xpdf 4.00 build on this machine's PATH also answers to `pdftotext` but
emits a different `-bbox` XML layout, which would produce crops that look
almost right. Every call therefore goes through an absolute path into the
conda poppler, and `preflight()` refuses to run against anything else.
"""
import os
import subprocess
from pathlib import Path

POPPLER_BIN = Path(
    os.environ.get("POPPLER_BIN", r"C:/Users/Baqir/miniconda3/Library/bin")
)

ALLOWED = {"pdftotext", "pdftoppm", "pdfinfo"}
MIN_VERSION = (22, 0)


def tool(name: str) -> str:
    """Absolute path to a poppler binary."""
    if name not in ALLOWED:
        raise ValueError(f"not a poppler tool: {name}")
    exe = POPPLER_BIN / (name + (".exe" if os.name == "nt" else ""))
    if not exe.exists():
        raise RuntimeError(
            f"{name} not found at {exe}. Install with: conda install -c conda-forge poppler"
        )
    return str(exe)


def _version(name: str) -> tuple[str, tuple[int, int]]:
    out = subprocess.run([tool(name), "-v"], capture_output=True, text=True)
    text = (out.stderr or "") + (out.stdout or "")
    if "Glyph & Cog" in text or "Xpdf" in text:
        raise RuntimeError(
            f"{name} at {POPPLER_BIN} is the Xpdf build, not poppler. "
            "Its -bbox output differs and would corrupt crops."
        )
    if "poppler" not in text.lower():
        raise RuntimeError(f"{name} did not identify as poppler: {text.strip()[:120]}")
    nums = text.split("version", 1)[1].strip().split()[0].split(".")
    return text, (int(nums[0]), int(nums[1]))


def preflight() -> None:
    """Assert both binaries are poppler and new enough. Call before any page work."""
    for name in ("pdftotext", "pdftoppm"):
        _, ver = _version(name)
        if ver < MIN_VERSION:
            raise RuntimeError(f"{name} is poppler {ver}, need >= {MIN_VERSION}")
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_poppler.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/exam-lab/ingest-sat/poppler.py scripts/exam-lab/ingest-sat/tests/test_poppler.py
git commit -m "feat(sat-ingest): absolute-path poppler resolution with Xpdf preflight guard"
```

---

### Task 2: Question-bank metadata parser

**Files:**
- Create: `scripts/exam-lab/ingest-sat/parse_qbank.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_parse_qbank.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DOMAIN_SLUGS: dict[str, str]`, `parse_block(text: str) -> dict`, `parse_export(text: str) -> tuple[list[dict], list[dict]]` returning `(records, rejected)`. Each record is `{"id", "section", "domain", "skill", "difficulty", "answer", "rationale"}` where `answer` is `{"kind": "mcq", "correct": int}` or `{"kind": "spr", "accepted": list[str]}`.

The header of each block is a flattened table, so label and value order varies between items. Parse by **vocabulary membership**, not position: domain and difficulty come from closed sets; the remaining non-label line is the skill.

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_parse_qbank.py
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


def test_parse_export_splits_dedupes_and_reports():
    text = "Question ID:".join(["", MCQ, SPR_INLINE, MCQ, UNRESOLVABLE])
    records, rejected = parse_export(text)
    assert [r["id"] for r in records] == ["b1c2d3e4", "ac472881"]
    assert [r["id"] for r in rejected] == ["ffffffff"]


def test_every_domain_has_a_slug():
    assert len(DOMAIN_SLUGS) == 8
    assert DOMAIN_SLUGS["Problem-Solving and Data Analysis"] == "psda"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_parse_qbank.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'parse_qbank'`

- [ ] **Step 3: Write the implementation**

```python
# scripts/exam-lab/ingest-sat/parse_qbank.py
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
_IN_RATIONALE = re.compile(r"The correct answer is\s+([^\s.][^.]*?)\s*\.")
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
        val = stated.group(1).strip()
        if val and not val.startswith("$") and len(val) < 40:
            return {"kind": "spr", "accepted": [val]}

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
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_parse_qbank.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/exam-lab/ingest-sat/parse_qbank.py scripts/exam-lab/ingest-sat/tests/test_parse_qbank.py
git commit -m "feat(sat-ingest): question-bank metadata and answer parser"
```

---

### Task 3: Run the parser over the real exports and report coverage

**Files:**
- Create: `scripts/exam-lab/ingest-sat/report_qbank.py`

**Interfaces:**
- Consumes: `parse_qbank.parse_export`, `poppler.tool`
- Produces: a console coverage report and `out/qbank-records.json`

This task has no unit test of its own — it is the acceptance gate for Task 2 against all 3,770 real items.

- [ ] **Step 1: Write the report script**

```python
# scripts/exam-lab/ingest-sat/report_qbank.py
"""Parse the real exports and report coverage. Run before any cropping."""
import argparse
import collections
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler
from parse_qbank import parse_export

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "question-bank"
OUT = HERE / "out"


def text_of(pdf: Path) -> str:
    cache = OUT / (pdf.stem + ".txt")
    if not cache.exists():
        OUT.mkdir(parents=True, exist_ok=True)
        subprocess.run([poppler.tool("pdftotext"), str(pdf), str(cache)], check=True)
    return cache.read_text(encoding="utf-8", errors="ignore")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT / "qbank-records.json"))
    args = ap.parse_args()

    poppler.preflight()
    all_records, all_rejected = [], []
    for pdf in sorted(RAW.glob("*.pdf")):
        records, rejected = parse_export(text_of(pdf))
        print(f"{pdf.name}: {len(records)} parsed, {len(rejected)} rejected")
        all_records += records
        all_rejected += rejected

    by_domain = collections.Counter(r["domain"] for r in all_records)
    by_diff = collections.Counter(r["difficulty"] for r in all_records)
    by_kind = collections.Counter(r["answer"]["kind"] for r in all_records)
    print("\n  total:", len(all_records), " rejected:", len(all_rejected))
    print("  by domain:", dict(by_domain))
    print("  by difficulty:", dict(by_diff))
    print("  by answer kind:", dict(by_kind))
    if all_rejected:
        print("  rejected ids:", ", ".join(r["id"] for r in all_rejected[:40]))

    Path(args.out).write_text(json.dumps(all_records, indent=1), encoding="utf-8")
    print("  wrote", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run it against the real material**

```bash
python scripts/exam-lab/ingest-sat/report_qbank.py
```
Expected: roughly 3,770 parsed across the two exports, all 8 domains populated, both `mcq` and `spr` answer kinds present.

- [ ] **Step 3: Triage the rejects**

Read the reported reject ids out of the export text. Each is either a genuine unverifiable item (leave it rejected) or a parser gap (fix `parse_qbank.py` and add a regression test to Task 2's test file for that exact shape). Do not lower the bar to admit an item whose answer is not stated.

Target: fewer than 1% rejected. If more, the parser has a gap.

- [ ] **Step 4: Commit**

```bash
git add scripts/exam-lab/ingest-sat/report_qbank.py
git commit -m "feat(sat-ingest): coverage report over the real question-bank exports"
```

---

### Task 4: Crop the question region

**Files:**
- Create: `scripts/exam-lab/ingest-sat/crop_qbank.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py`

**Interfaces:**
- Consumes: `poppler.tool`
- Produces: `anchors(bbox_xml: str) -> list[dict]` and `question_span(anchors, qid) -> dict` with keys `page`, `top`, `bottom`.

The crop must start **below the difficulty token** so the metadata header is not visible to a student, and end **above `Correct Answer:`** or, when absent, above `Rationale`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crop_qbank import anchors, question_span

BBOX = """<?xml version="1.0"?>
<html><body>
<page width="612" height="792">
<word xMin="70" yMin="100" xMax="140" yMax="112">Question</word>
<word xMin="142" yMin="100" xMax="160" yMax="112">ID:</word>
<word xMin="162" yMin="100" xMax="220" yMax="112">ac472881</word>
<word xMin="70" yMin="150" xMax="110" yMax="162">Hard</word>
<word xMin="70" yMin="200" xMax="120" yMax="212">What</word>
<word xMin="70" yMin="400" xMax="150" yMax="412">Correct</word>
<word xMin="152" yMin="400" xMax="210" yMax="412">Answer:</word>
<word xMin="70" yMin="500" xMax="140" yMax="512">Rationale</word>
</page>
</body></html>
"""


def test_anchors_find_question_ids():
    a = anchors(BBOX)
    assert a["ids"][0]["qid"] == "ac472881"
    assert a["ids"][0]["page"] == 1


def test_span_starts_below_difficulty_and_ends_above_answer():
    a = anchors(BBOX)
    span = question_span(a, "ac472881")
    assert span["page"] == 1
    assert span["top"] >= 162      # below the "Hard" token
    assert span["bottom"] <= 400   # above "Correct Answer:"


def test_span_is_none_for_unknown_id():
    assert question_span(anchors(BBOX), "deadbeef") is None
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'crop_qbank'`

- [ ] **Step 3: Write the implementation**

```python
# scripts/exam-lab/ingest-sat/crop_qbank.py
"""Locate and crop the exact question region of a question-bank export.

The crop deliberately starts below the difficulty token so a student never
sees College Board's difficulty rating on the question image, and ends above
the answer so the key is not in the picture either.
"""
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

import poppler

DIFFICULTY_WORDS = {"Easy", "Medium", "Hard"}
_HEX8 = re.compile(r"^[0-9a-f]{8}$")
PAD = 6.0


def bbox_xml(pdf: Path) -> str:
    out = subprocess.run(
        [poppler.tool("pdftotext"), "-bbox", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    )
    return out.stdout


def anchors(xml_text: str) -> dict:
    """Extract question-id, difficulty, answer and rationale anchors per page."""
    root = ET.fromstring(xml_text)
    ns = {"h": root.tag.split("}")[0].strip("{")} if "}" in root.tag else {}

    def findall(node, tag):
        return node.iter("{%s}%s" % (ns["h"], tag)) if ns else node.iter(tag)

    ids, diffs, answers, rationales = [], [], [], []
    for pageno, page in enumerate(findall(root, "page"), start=1):
        words = [
            {
                "text": (w.text or "").strip(),
                "top": float(w.get("yMin")),
                "bottom": float(w.get("yMax")),
            }
            for w in findall(page, "word")
        ]
        for i, w in enumerate(words):
            if w["text"] == "Question" and i + 2 < len(words) and words[i + 1]["text"] == "ID:":
                cand = words[i + 2]["text"]
                if _HEX8.match(cand):
                    ids.append({"qid": cand, "page": pageno, "top": w["top"], "bottom": w["bottom"]})
            if w["text"] in DIFFICULTY_WORDS:
                diffs.append({"page": pageno, "bottom": w["bottom"]})
            if w["text"] == "Correct" and i + 1 < len(words) and words[i + 1]["text"] == "Answer:":
                answers.append({"page": pageno, "top": w["top"]})
            if w["text"] == "Rationale":
                rationales.append({"page": pageno, "top": w["top"]})
    return {"ids": ids, "diffs": diffs, "answers": answers, "rationales": rationales}


def question_span(a: dict, qid: str) -> dict | None:
    """Region between the difficulty token and the answer, for one question."""
    entry = next((x for x in a["ids"] if x["qid"] == qid), None)
    if entry is None:
        return None
    page, start = entry["page"], entry["bottom"]

    after = [d["bottom"] for d in a["diffs"] if d["page"] == page and d["bottom"] > start]
    top = (min(after) if after else start) + PAD

    ends = [x["top"] for x in a["answers"] + a["rationales"] if x["page"] == page and x["top"] > top]
    if not ends:
        return None
    return {"page": page, "top": top, "bottom": min(ends) - PAD}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/exam-lab/ingest-sat/crop_qbank.py scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py
git commit -m "feat(sat-ingest): question-region anchor detection and span calculation"
```

---

### Task 5: Render crops to disk and eyeball them

**Files:**
- Modify: `scripts/exam-lab/ingest-sat/crop_qbank.py` — add `render_span`
- Modify: `scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py` — add the scaling test

**Interfaces:**
- Produces: `render_span(pdf, span, dest, dpi=150) -> Path`

- [ ] **Step 1: Write the failing test**

```python
# append to scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py
from crop_qbank import scale_box


def test_scale_box_converts_points_to_pixels():
    # PDF points are 1/72 inch; at 150 dpi the factor is 150/72
    box = scale_box({"top": 72.0, "bottom": 144.0}, page_width_pt=612.0, dpi=150)
    assert box["top"] == 150
    assert box["bottom"] == 300
    assert box["width"] == 1275
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py::test_scale_box_converts_points_to_pixels -v`
Expected: FAIL with `ImportError: cannot import name 'scale_box'`

- [ ] **Step 3: Write the implementation**

```python
# append to scripts/exam-lab/ingest-sat/crop_qbank.py
import tempfile
from PIL import Image


def scale_box(span: dict, page_width_pt: float, dpi: int = 150) -> dict:
    f = dpi / 72.0
    return {
        "top": int(round(span["top"] * f)),
        "bottom": int(round(span["bottom"] * f)),
        "width": int(round(page_width_pt * f)),
    }


def render_span(pdf: Path, span: dict, dest: Path, dpi: int = 150,
                page_width_pt: float = 612.0) -> Path:
    """Rasterise the span's page and crop it to the question region."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "page"
        subprocess.run(
            [poppler.tool("pdftoppm"), "-r", str(dpi), "-f", str(span["page"]),
             "-l", str(span["page"]), "-jpeg", str(pdf), str(stem)],
            check=True, capture_output=True,
        )
        rendered = sorted(Path(tmp).glob("page*.jpg"))
        if not rendered:
            raise RuntimeError(f"pdftoppm produced no page for {pdf.name} p{span['page']}")
        img = Image.open(rendered[0])
        box = scale_box(span, page_width_pt, dpi)
        crop = img.crop((0, box["top"], img.width, min(box["bottom"], img.height)))
        crop.save(dest, "JPEG", quality=85, optimize=True)
    return dest
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py -v`
Expected: 4 passed

- [ ] **Step 5: Render a sample and look at it**

```bash
python - <<'PY'
import sys, json
from pathlib import Path
sys.path.insert(0, "scripts/exam-lab/ingest-sat")
import poppler
from crop_qbank import bbox_xml, anchors, question_span, render_span

poppler.preflight()
pdf = sorted(Path("scripts/exam-lab/ingest-sat/raw/question-bank").glob("*math*.pdf"))[0]
a = anchors(bbox_xml(pdf))
out = Path("scripts/exam-lab/ingest-sat/out/samples")
for entry in a["ids"][:10]:
    span = question_span(a, entry["qid"])
    if span:
        render_span(pdf, span, out / f"{entry['qid']}.jpg")
print("wrote samples to", out)
PY
```

Open the ten JPEGs. Each must show the question and any figure, with **no Question ID, no Domain, no Skill, no Difficulty, and no answer or rationale**. If the header bleeds in, `PAD` or the difficulty anchor needs adjusting — fix it and re-render before moving on.

- [ ] **Step 6: Commit**

```bash
git add scripts/exam-lab/ingest-sat/crop_qbank.py scripts/exam-lab/ingest-sat/tests/test_crop_qbank.py
git commit -m "feat(sat-ingest): render and crop question regions to JPEG"
```

---

### Task 6: Idempotent upload to the private bucket

**Files:**
- Create: `scripts/exam-lab/ingest-sat/upload.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_upload.py`

**Interfaces:**
- Produces: `bucket_path(qid: str, section: str) -> str`, `upload_file(path, dest, *, client) -> str`

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_upload.py
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from upload import bucket_path, guard_prefix


def test_bucket_path_is_under_sat_prefix():
    p = bucket_path("ac472881", "math")
    assert p.startswith("sat/")
    assert p == "sat/math/ac472881.jpg"


def test_guard_rejects_paths_outside_sat():
    guard_prefix("sat/math/x.jpg")           # must not raise
    with pytest.raises(ValueError):
        guard_prefix("o-level/p1/x.jpg")
    with pytest.raises(ValueError):
        guard_prefix("sat/../o-level/x.jpg")
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_upload.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'upload'`

- [ ] **Step 3: Write the implementation**

```python
# scripts/exam-lab/ingest-sat/upload.py
"""Upload question crops to the private Supabase `exam-assets` bucket.

Every write is under the `sat/` prefix and `guard_prefix` enforces it, so the
existing 9702 and o-level assets cannot be touched by this pipeline.
"""
import os
import posixpath
from pathlib import Path

import urllib.request

BUCKET = "exam-assets"
PREFIX = "sat/"


def bucket_path(qid: str, section: str) -> str:
    return f"{PREFIX}{section}/{qid}.jpg"


def guard_prefix(dest: str) -> None:
    normalised = posixpath.normpath(dest)
    if not normalised.startswith(PREFIX) or ".." in dest:
        raise ValueError(f"refusing to write outside {PREFIX}: {dest}")


def upload_file(path: Path, dest: str, *, url: str | None = None, key: str | None = None) -> str:
    """PUT one file. Idempotent: an existing object at `dest` is overwritten."""
    guard_prefix(dest)
    url = url or os.environ["SUPABASE_URL"]
    key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    endpoint = f"{url.rstrip('/')}/storage/v1/object/{BUCKET}/{dest}"
    req = urllib.request.Request(
        endpoint,
        data=path.read_bytes(),
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
    )
    with urllib.request.urlopen(req) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"upload failed {resp.status} for {dest}")
    return dest
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_upload.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/exam-lab/ingest-sat/upload.py scripts/exam-lab/ingest-sat/tests/test_upload.py
git commit -m "feat(sat-ingest): prefix-guarded idempotent bucket upload"
```

---

### Task 7: Orchestrate, resume, and emit the bank

**Files:**
- Create: `scripts/exam-lab/ingest-sat/extract_sat.py`
- Create: `scripts/exam-lab/ingest-sat/build_sat_bank.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_build_sat_bank.py`

**Interfaces:**
- Consumes: `parse_qbank.parse_export`, `crop_qbank.{bbox_xml,anchors,question_span,render_span}`, `upload.{bucket_path,upload_file}`
- Produces: `src/lib/sat/question-bank.json`, a list of `SATQuestion` rows as defined in the spec.

- [ ] **Step 1: Write the failing test for the build gate**

```python
# scripts/exam-lab/ingest-sat/tests/test_build_sat_bank.py
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_sat_bank import validate

GOOD = [{
    "id": "ac472881", "section": "math", "domain": "algebra",
    "skill": "Linear equations in one variable", "difficulty": "H",
    "answer": {"kind": "spr", "accepted": ["403"]},
    "rationale": "The correct answer is 403.",
    "img": "sat/math/ac472881.jpg", "ref": "SAT Question Bank ac472881",
    "source": "question-bank",
}]


def test_validate_accepts_a_good_row():
    validate(GOOD)


def test_validate_rejects_missing_image():
    bad = [{**GOOD[0], "img": ""}]
    with pytest.raises(ValueError, match="image"):
        validate(bad)


def test_validate_rejects_duplicate_ids():
    with pytest.raises(ValueError, match="duplicate"):
        validate(GOOD + GOOD)


def test_validate_rejects_mcq_without_an_index():
    bad = [{**GOOD[0], "answer": {"kind": "mcq"}}]
    with pytest.raises(ValueError, match="answer"):
        validate(bad)


def test_validate_rejects_path_outside_sat_prefix():
    bad = [{**GOOD[0], "img": "o-level/p1/x.jpg"}]
    with pytest.raises(ValueError, match="prefix"):
        validate(bad)
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_build_sat_bank.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'build_sat_bank'`

- [ ] **Step 3: Write the build step**

```python
# scripts/exam-lab/ingest-sat/build_sat_bank.py
"""Emit src/lib/sat/question-bank.json, refusing to ship an unverifiable row."""
import argparse
import json
from pathlib import Path

REQUIRED = ("id", "section", "domain", "skill", "difficulty", "answer", "img", "ref", "source")
REPO = Path(__file__).resolve().parents[3]
DEST = REPO / "src" / "lib" / "sat" / "question-bank.json"


def validate(rows: list[dict]) -> None:
    seen: set[str] = set()
    for row in rows:
        for field in REQUIRED:
            if field not in row:
                raise ValueError(f"{row.get('id', '?')}: missing field {field}")
        if row["id"] in seen:
            raise ValueError(f"duplicate id {row['id']}")
        seen.add(row["id"])
        if not row["img"]:
            raise ValueError(f"{row['id']}: no image")
        if not row["img"].startswith("sat/"):
            raise ValueError(f"{row['id']}: image outside the sat/ prefix")
        ans = row["answer"]
        if ans.get("kind") == "mcq" and not isinstance(ans.get("correct"), int):
            raise ValueError(f"{row['id']}: mcq answer has no index")
        if ans.get("kind") == "spr" and not ans.get("accepted"):
            raise ValueError(f"{row['id']}: spr answer has no accepted values")
        if ans.get("kind") not in ("mcq", "spr"):
            raise ValueError(f"{row['id']}: unknown answer kind")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", help="JSON produced by extract_sat.py")
    args = ap.parse_args()
    rows = json.loads(Path(args.rows).read_text(encoding="utf-8"))
    validate(rows)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(f"wrote {DEST} ({len(rows)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest scripts/exam-lab/ingest-sat/tests/test_build_sat_bank.py -v`
Expected: 5 passed

- [ ] **Step 5: Write the orchestrator**

```python
# scripts/exam-lab/ingest-sat/extract_sat.py
"""Crop, upload and emit metadata for every question-bank item.

Resumable: a question whose crop already exists on disk is not re-rendered,
and `--dry-run` skips upload entirely so crops can be eyeballed first.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler
from crop_qbank import anchors, bbox_xml, question_span, render_span
from parse_qbank import parse_export
from report_qbank import text_of
from upload import bucket_path, upload_file

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "question-bank"
CROPS = HERE / "out" / "crops"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="crop only, do not upload")
    ap.add_argument("--limit", type=int, default=0, help="stop after N questions")
    ap.add_argument("--out", default=str(HERE / "out" / "rows.json"))
    args = ap.parse_args()

    poppler.preflight()
    rows, skipped = [], []

    for pdf in sorted(RAW.glob("*.pdf")):
        records, rejected = parse_export(text_of(pdf))
        skipped += rejected
        a = anchors(bbox_xml(pdf))
        print(f"{pdf.name}: {len(records)} records, {len(a['ids'])} anchors")

        for rec in records:
            if args.limit and len(rows) >= args.limit:
                break
            span = question_span(a, rec["id"])
            if span is None:
                skipped.append({"id": rec["id"], "reason": "no-span"})
                continue
            dest = CROPS / rec["section"] / f"{rec['id']}.jpg"
            if not dest.exists():
                render_span(pdf, span, dest)
            img = bucket_path(rec["id"], rec["section"])
            if not args.dry_run:
                upload_file(dest, img)
            rows.append({
                **rec,
                "img": img,
                "ref": f"SAT Question Bank {rec['id']}",
                "source": "question-bank",
            })

    Path(args.out).write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(f"\n  {len(rows)} rows -> {args.out}")
    print(f"  {len(skipped)} skipped")
    if skipped:
        Path(args.out).with_name("skipped.json").write_text(
            json.dumps(skipped, indent=1), encoding="utf-8"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: Dry-run a small batch and check the crops**

```bash
python scripts/exam-lab/ingest-sat/extract_sat.py --dry-run --limit 40
```
Open a sample of `scripts/exam-lab/ingest-sat/out/crops/**`. Confirm again that no metadata header and no answer appear in any image.

- [ ] **Step 7: Full run and build**

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
python scripts/exam-lab/ingest-sat/extract_sat.py
python scripts/exam-lab/ingest-sat/build_sat_bank.py scripts/exam-lab/ingest-sat/out/rows.json
```
Expected: roughly 3,770 rows written to `src/lib/sat/question-bank.json`.

- [ ] **Step 8: Commit**

```bash
git add scripts/exam-lab/ingest-sat/extract_sat.py scripts/exam-lab/ingest-sat/build_sat_bank.py \
        scripts/exam-lab/ingest-sat/tests/test_build_sat_bank.py src/lib/sat/question-bank.json
git commit -m "feat(sat-ingest): orchestrate crop/upload and emit the verified question bank"
```

---

### Task 8: Pipeline README

**Files:**
- Create: `scripts/exam-lab/ingest-sat/README.md`

- [ ] **Step 1: Write the README**

Mirror `scripts/exam-lab/ingest-5054/README.md`: a file table, a numbered run sequence, the integrity rules the code enforces, and how to add new material. It must state explicitly:

- poppler is resolved by absolute path and preflighted against the Xpdf build on PATH
- answers ship only from the official key, the official rationale, or `reviewed.json`
- question crops exclude the metadata header so difficulty is never shown to students
- all writes are under the `sat/` bucket prefix
- raw material is gitignored and must not be committed

- [ ] **Step 2: Verify every command in it runs**

Copy each command out of the README and run it. A README command that does not work is a defect.

- [ ] **Step 3: Commit**

```bash
git add scripts/exam-lab/ingest-sat/README.md
git commit -m "docs(sat-ingest): pipeline README"
```

---

## Self-Review

**Spec coverage.** This plan implements spec §2.2 (question bank), §3.3 (crop-first), §3.4 (SPR answer recovery), §6 (pipeline), and the parts of §10 that apply to question-bank items — rules 1, 2, 3 and the `sat/` prefix guard. Spec §2.1 (practice tests), §7 (adaptive engine), §8 (scoring), §9 (portal, database, access) and §11 phases 3-7 are **out of scope for this plan** and belong to plans 2 and 3.

**Deferred to plan 2 (core module and database):** practice-test ingestion including `parse_scoring.py`, the `SATQuestion` TypeScript types, bank loaders, form assembly, the adaptive router, scoring, the `sat-001` migration and course gating.

**Deferred to plan 3 (surfaces):** portal SAT Lab, the SPR pad, score report, the public `/sat` vertical, and integration with study plans, analytics and admin allocation.

**Type consistency.** `parse_qbank.parse_block` emits `id/section/domain/skill/difficulty/answer/rationale`; `extract_sat` adds `img/ref/source`; `build_sat_bank.validate` requires exactly that union, matching the spec's `SATQuestion`. The `answer` shape is `{"kind": "mcq", "correct": int}` or `{"kind": "spr", "accepted": [str]}` in the parser, the validator and the spec alike.

**Known gap to watch.** Task 4's anchor logic assumes one question per page region and a single difficulty token between consecutive question ids. Task 3's coverage report and Task 5's visual check exist to catch where that does not hold; a question spanning a page break will need the stitching logic `crop5054.py` already implements, which is the most likely source of rework in this plan.
