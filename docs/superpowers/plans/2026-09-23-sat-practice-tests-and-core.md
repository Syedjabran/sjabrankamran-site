# SAT Practice Tests & Core Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the 8 official linear practice tests and their raw→scaled conversion tables, and build the TypeScript core (types, bank loaders, adaptive form assembly, scoring, `sat-001` migration, course gating) that turns both banks into something the site can serve.

**Architecture:** Part A extends the Python pipeline in `scripts/exam-lab/ingest-sat/`, reusing its poppler resolution, prefix-guarded upload and provenance gate. The practice tests are a *different document shape* from the question bank — two-column pages, module-scoped question numbers, a separate answer-explanations PDF and a separate scoring guide — so they get their own parser and crop geometry rather than bending the question-bank code. Part B builds `src/lib/sat/` as a parallel module to `src/lib/exam-lab/`, sharing only generic infrastructure (asset serving, course gating). Physics types are not touched.

**Tech Stack:** Python 3.13, pytest 8.4.2, poppler 25.07.0 (conda, absolute-path resolved), Pillow 11.3.0, Supabase storage REST API; TypeScript, Next.js App Router, Zod, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-09-22-sat-module-design.md`

**Predecessor:** `docs/superpowers/plans/2026-09-22-sat-ingestion-pipeline.md` (plan 1, executed — question-bank ingestion)

## Global Constraints

- Poppler binaries are resolved by **absolute path** to `C:/Users/Baqir/miniconda3/Library/bin/`, never through PATH. The Xpdf 4.00 build on PATH emits a different `-bbox` XML layout and must never be used.
- Use `python`, never `python3` — `python3` is shadowed by a Windows Store alias that prints an install prompt and **exits 0 with no output**, so commands appear to succeed while doing nothing.
- Answers ship only from the official answer key, the official rationale, or `reviewed.json`. A question whose answer cannot be resolved is **skipped and reported**, never guessed. (Spec §10.1)
- Domain, skill and difficulty ship only as College Board labelled them. (Spec §10.2)
- `Question ID` is the primary key for bank items; practice-test items are keyed `{testNo, section, module, qnum}`. (Spec §10.3)
- **A practice test whose extracted question count does not match 33/33/27/27 is dropped as a parse failure, never shipped short.** (Spec §10.4)
- **A scaled score is called official only when it came from an ingested conversion table.** Everything else is labelled *estimated*. (Spec §10.5)
- **The adaptive routing threshold is documented as an approximation everywhere it is surfaced.** College Board does not publish the real algorithm or cut score. (Spec §10.6)
- Question images must exclude anything that reveals the answer or College Board's difficulty rating. **A text-layer anchor cannot see a vector glyph** — verify every crop change by scanning the rendered images (see plan 1's `ebf6d68`).
- All bucket writes go under the `sat/` prefix, via `upload.guard_prefix`. The pipeline never reads, lists or writes outside it.
- Raw source PDFs are gitignored and must never be committed.
- The live upload needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` **and the user's explicit authorisation**. Until then `--dry-run` only.

## Measured facts this plan is built on

Established by inspecting the real material on 2026-09-23. Do not re-derive; do not assume anything beyond these.

| Fact | Value |
| --- | --- |
| Bundles on disk | `raw/practice-tests/extracted/full-length-sat-paper-practice-test_-bundle-N/`, N ∈ 4…11 (8 bundles, tests 1–3 absent) |
| Files per bundle | `sat-practice-test-N-digital.pdf` (the test), `sat-practice-test-N-answers-digital.pdf` (key + explanations), `scoring-sat-practice-test-N-digital.pdf` (conversion tables) |
| Page counts (test 4) | 56 / 53 / 5, all US Letter 612×792pt |
| Module structure | R&W Module 1 = 33, R&W Module 2 = 33, Math Module 1 = 27, Math Module 2 = 27; total **120** |
| Module header in the test PDF | the words `Module`, then `1`/`2`, then `Reading and Writing`/`Math`, then `33 QUESTIONS`/`27 QUESTIONS`, then `DIRECTIONS` |
| **Test pages are two-column** | left-column question number at x≈60, right-column at x≈338, separated by a dotted leader run at x≈312. Two questions per page. |
| A question number is outdented ~11pt | Q3 at x=60.3 against body text at x=71.8 — but outdent **alone** is not enough to identify one (see Task 4) |
| Question numbers are body-sized | bbox height 9.83pt, identical to the text beside them; font size is not a usable signal |
| The dotted gutter leader is not universal | on 39–41 of 56 pages in tests 4–10, and on **no** page of test 11 |
| **Test 11 is a different generation** | 52 pages not 56, no leader, and letter-spaced headings: `33 QUESTIONS` tokenises as `'33','Q','U','E',…`, so the word `QUESTIONS` never appears |
| Answer-explanations structure | `QUESTION <n>` headings (120 per test), grouped under `Module 1`/`Module 2` + `(33 questions)`/`(27 questions)` |
| Answer phrasings | R&W MCQ `Choice X is the best answer` (66); Math MCQ `Choice X is correct` (40); SPR `The correct answer is <value>` (14); and SPR-with-several-roots `The correct answer is either 14, -5, or -4` |
| The `either` phrasing is **already handled** | `parse_qbank._EITHER`, added in `1534bc4` after this parser found the two items it broke on (test 7 Math M1 Q7, test 9 Math M2 Q14). `parse_answers` reuses it, so nothing extra is needed here |
| `Note that` can wrap across a line break | also fixed in `1534bc4` (`Note\s+that`); it silently cost test 9 Q14 its answer |
| Distractor phrasing to not match | `Choice X is incorrect` — `is correct` does not match `is incorrect`, so anchor on the literal `is correct` |
| SPR extraction artifact | `The correct answer is 10 .` — a space can precede the period |
| **`pdftotext -bbox` emits invalid XML for the scoring guides** | 11 × `0x07` (BEL) in test 4's guide. `ET.fromstring` raises `ParseError: not well-formed`, so plan 1's `anchors()` crashes outright on this corpus. Must be sanitised. |
| Conversion table shape | raw-score column plus `LOWER`/`UPPER` columns, R&W (0–66) and Math (0–54) tables side by side; the text stream is column-major and unusable — parse in `-bbox` space |
| Scoring is a range | section score range 200–800 per section, summed to a 400–1600 **range**, never a point score |

## File Structure

**Part A — ingestion (Python), all under `scripts/exam-lab/ingest-sat/`:**

| File | Responsibility |
| --- | --- |
| `manifest.json` | the 8 bundles, their test numbers, file names, refs and printed module structure — the single source of what exists |
| `bbox.py` | shared `-bbox` reading: run pdftotext, sanitise XML-illegal control characters, strip namespace, yield words with positions. Extracted from `crop_qbank.py` so both corpora use one hardened reader |
| `parse_answers.py` | answer-explanations PDF → `{(section, module, qnum): answer}` with the three official phrasings; enforces 33/33/27/27 |
| `parse_scoring.py` | scoring guide → `{section: {raw: (lower, upper)}}` conversion tables, parsed in bbox space |
| `crop_tests.py` | two-column crop geometry for test pages: column split, question-number anchors, span end |
| `extract_tests.py` | orchestrates crop + upload + row emission for all 8 tests; resumable, `--dry-run` by default |
| `build_sat_tests.py` | last gate: validates rows and conversion tables, refuses unverifiable provenance, writes `src/lib/sat/practice-tests.json` |

**Part B — core module (TypeScript):**

| File | Responsibility |
| --- | --- |
| `src/lib/sat/types.ts` | the data model from spec §5.2 — no logic |
| `src/lib/sat/bank.ts` | load and index both generated banks; filters for drills |
| `src/lib/sat/forms.ts` | assemble an adaptive form's six question sets to the digital blueprint |
| `src/lib/sat/adaptive.ts` | Module 1 → Module 2 routing, with the threshold documented as an approximation |
| `src/lib/sat/scoring.ts` | official range from an ingested table; estimated score otherwise |
| `supabase/migrations/sat-001-sat-lab.sql` | `sat_questions`, `sat_forms`, `sat_attempts`, `sat_module_results` + RLS mirroring `el-001` |
| `src/lib/portal/course-access.ts` | `Course` gains `"SAT"` |
| `src/app/api/exam-lab/asset/route.ts` | `sat/` prefix resolves to the SAT course |

---

### Task 0: Finish the directory rename plan 1 deferred

Plan 1 Task 0 called for `ingest-sat`; a stale Windows file handle blocked the case-only rename and it shipped as `ingest-SAT`. **This breaks on case-sensitive CI** and every path in this plan assumes lowercase. Do it before anything else, while nothing holds the directory.

**Files:**
- Rename: `scripts/exam-lab/ingest-SAT/` → `scripts/exam-lab/ingest-sat/`

- [ ] **Step 1: Confirm nothing holds the directory**

Close any other shell sitting inside it. Then:

```bash
cd /c/Users/Baqir/Documents/jj/sjabrankamran-site
ls -d scripts/exam-lab/ingest-*
```

- [ ] **Step 2: Rename via a temporary name**

A case-only rename on Windows needs two hops, and `git mv` records it properly:

```bash
cd scripts/exam-lab
git mv ingest-SAT ingest-sat-tmp && git mv ingest-sat-tmp ingest-sat
ls -d ingest-*
```

- [ ] **Step 3: Verify git sees a rename, not a delete-and-add**

```bash
cd /c/Users/Baqir/Documents/jj/sjabrankamran-site
git status --short scripts/exam-lab/ | head
```

Expected: `R  scripts/exam-lab/ingest-SAT/... -> scripts/exam-lab/ingest-sat/...` lines only.

- [ ] **Step 4: Confirm the suite still passes from the new path**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/ -q
```

Expected: `106 passed`.

- [ ] **Step 5: Update the two docs that name the old path**

`docs/superpowers/SAT-HANDOFF.md` and `scripts/exam-lab/ingest-sat/README.md` both spell `ingest-SAT`. Replace with `ingest-sat`.

- [ ] **Step 6: Commit**

```bash
git add -A scripts/exam-lab docs/superpowers/SAT-HANDOFF.md
git commit -m "refactor(sat-ingest): rename ingest-SAT to ingest-sat for case-sensitive CI"
```

---

### Task 1: Manifest and a hardened shared bbox reader

The scoring guides make `pdftotext -bbox` emit **XML-illegal control characters** (11 BEL bytes in test 4's guide), which makes `ET.fromstring` raise `ParseError` — plan 1's `anchors()` cannot read this corpus at all. Fix it once, in a shared module both corpora use.

**Files:**
- Create: `scripts/exam-lab/ingest-sat/bbox.py`
- Create: `scripts/exam-lab/ingest-sat/manifest.py`
- Create: `scripts/exam-lab/ingest-sat/manifest.json`
- Modify: `scripts/exam-lab/ingest-sat/crop_qbank.py` (delegate the reader)
- Test: `scripts/exam-lab/ingest-sat/tests/test_bbox.py`, `scripts/exam-lab/ingest-sat/tests/test_manifest.py`

**Interfaces:**
- Produces: `bbox.bbox_xml(pdf: Path) -> str`; `bbox.parse(xml_text: str) -> Element`; `bbox.words_by_page(xml_text: str) -> dict[int, list[dict]]` where a word is `{"text": str, "left": float, "top": float, "right": float, "bottom": float}`; `bbox.page_sizes(xml_text: str) -> dict[int, tuple[float, float]]`; `manifest.load() -> dict`; `manifest.bundle_paths(entry, spec) -> dict[str, Path]`; `manifest.missing() -> list[str]`.
- Consumes: `poppler.tool`, `poppler.preflight` from plan 1.

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_bbox.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bbox

# Real `pdftotext -bbox` output for a scoring guide contains BEL (0x07),
# which is not a legal XML 1.0 character. Confirmed on test 4's guide: 11 of
# them, and ElementTree refuses the WHOLE document over one ("not
# well-formed (invalid token)"), so every page is lost, not just the word.
WITH_CONTROL_CHARS = (
    '<?xml version="1.0"?>\n<html><body>\n<page width="612" height="792">\n'
    '<word xMin="58.5" yMin="123.0" xMax="70.3" yMax="140.9">\x07In</word>\n'
    '<word xMin="80.0" yMin="123.0" xMax="95.0" yMax="140.9">April</word>\n'
    "</page>\n</body></html>\n"
)


def test_parse_survives_xml_illegal_control_characters():
    words = bbox.words_by_page(WITH_CONTROL_CHARS)[1]
    assert [w["text"] for w in words] == ["In", "April"]


def test_the_word_carrying_the_control_char_is_kept_not_dropped():
    """The BEL is noise in the text layer, not a word boundary. Stripping the
    character must not strip the word it was attached to -- losing 'In' would
    silently shift every downstream anchor."""
    first = bbox.words_by_page(WITH_CONTROL_CHARS)[1][0]
    assert first["left"] == 58.5 and first["bottom"] == 140.9


def test_page_sizes_are_read_from_the_page_element():
    assert bbox.page_sizes(WITH_CONTROL_CHARS) == {1: (612.0, 792.0)}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_bbox.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'bbox'`.

- [ ] **Step 3: Write `bbox.py`**

```python
"""Shared `pdftotext -bbox` reading for every SAT corpus.

Plan 1 read the question-bank exports with ElementTree directly and that was
fine, because those exports happen to be clean. The practice-test scoring
guides are not: they carry XML-illegal control characters in the text layer
(11 BEL bytes in test 4's guide alone), and ElementTree rejects the *entire
document* over one of them -- not the offending word, the whole file.
Sanitising here means both corpora go through one reader with one decode
policy, instead of the question-bank path quietly being the only one that
works.
"""
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import poppler

# XML 1.0 forbids the C0 controls except tab, newline and carriage return.
# They carry no textual meaning here -- they are artefacts of the PDF's text
# layer -- so they are dropped and the word they were attached to is kept.
_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_XMLNS = re.compile(r'\sxmlns="[^"]+"')


def bbox_xml(pdf: Path) -> str:
    """`pdftotext -bbox` output for `pdf`, decoded strict UTF-8.

    `encoding="utf-8"` is required, not optional: `text=True` alone decodes
    with `locale.getpreferredencoding()` (cp1252 on this machine), which
    raises on real pages (byte 0x9d on math export page 255) and silently
    mangles others. Same policy as plan 1.
    """
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "b.xml"
        subprocess.run(
            [poppler.tool("pdftotext"), "-bbox", str(pdf), str(out)],
            check=True, capture_output=True, encoding="utf-8",
        )
        return out.read_text(encoding="utf-8")


def parse(xml_text: str) -> ET.Element:
    """Root element, control characters removed and the XHTML namespace
    stripped. `iter("page")` silently matches nothing against a namespaced
    document -- every tag is `{http://www.w3.org/1999/xhtml}page` -- so the
    namespace must go before any traversal.
    """
    return ET.fromstring(_XMLNS.sub("", _ILLEGAL.sub("", xml_text), count=1))


def words_by_page(xml_text: str) -> dict[int, list[dict]]:
    pages: dict[int, list[dict]] = {}
    for pageno, page in enumerate(parse(xml_text).iter("page"), start=1):
        pages[pageno] = [
            {
                "text": (w.text or "").strip(),
                "left": float(w.get("xMin")), "top": float(w.get("yMin")),
                "right": float(w.get("xMax")), "bottom": float(w.get("yMax")),
            }
            for w in page.iter("word")
        ]
    return pages


def page_sizes(xml_text: str) -> dict[int, tuple[float, float]]:
    return {
        pageno: (float(p.get("width")), float(p.get("height")))
        for pageno, p in enumerate(parse(xml_text).iter("page"), start=1)
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_bbox.py -q
```

Expected: 3 passed.

- [ ] **Step 5: Prove it against the real scoring guide**

This is the point of the task. A unit test on a synthetic fixture does not prove the real file parses.

```bash
cd scripts/exam-lab/ingest-sat
python -c "import sys; sys.path.insert(0,'.'); import bbox; from pathlib import Path; p=Path('raw/practice-tests/extracted/full-length-sat-paper-practice-test_-bundle-4/scoring-sat-practice-test-4-digital.pdf'); pages=bbox.words_by_page(bbox.bbox_xml(p)); print('pages:', len(pages))"
```

Expected: `pages: 5`. Before this task the identical call raised `ParseError`.

- [ ] **Step 6: Point `crop_qbank.py` at the shared reader**

Delete `crop_qbank`'s own `bbox_xml`, `_strip_namespace` and `_words`, and re-export the shared ones so no caller changes:

```python
from bbox import bbox_xml, page_sizes, words_by_page  # noqa: F401  (re-exported)
```

Rewrite `anchors()` to build its per-page word lists from `words_by_page(xml_text)` rather than walking the tree itself. Every key of the returned dict must survive unchanged: `ids`, `diffs`, `answers`, `rationales`, `questions`, `pages`, `page_size`.

- [ ] **Step 7: Run the whole suite — nothing may regress**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/ -q
```

Expected: 109 passed (106 existing + 3 new).

- [ ] **Step 8: Re-verify the question-bank crops are byte-identical**

Refactoring the reader must not move a single crop.

```bash
cd scripts/exam-lab/ingest-sat
cp out/rows.json out/rows.before.json
python extract_sat.py --dry-run > /dev/null
python -c "import json; a=json.load(open('out/rows.before.json',encoding='utf-8')); b=json.load(open('out/rows.json',encoding='utf-8')); print('identical:', a==b, len(a), len(b))"
rm out/rows.before.json
```

Expected: `identical: True 3730 3730`.

- [ ] **Step 9: Write `manifest.json`**

```json
{
  "practice_tests": [
    { "test_no": 4,  "dir": "full-length-sat-paper-practice-test_-bundle-4" },
    { "test_no": 5,  "dir": "full-length-sat-paper-practice-test_-bundle-5" },
    { "test_no": 6,  "dir": "full-length-sat-paper-practice-test_-bundle-6" },
    { "test_no": 7,  "dir": "full-length-sat-paper-practice-test_-bundle-7" },
    { "test_no": 8,  "dir": "full-length-sat-paper-practice-test_-bundle-8" },
    { "test_no": 9,  "dir": "full-length-sat-paper-practice-test_-bundle-9" },
    { "test_no": 10, "dir": "full-length-sat-paper-practice-test_-bundle-10" },
    { "test_no": 11, "dir": "full-length-sat-paper-practice-test_-bundle-11" }
  ],
  "module_structure": [
    { "section": "rw",   "module": 1, "questions": 33 },
    { "section": "rw",   "module": 2, "questions": 33 },
    { "section": "math", "module": 1, "questions": 27 },
    { "section": "math", "module": 2, "questions": 27 }
  ],
  "file_pattern": {
    "test":    "sat-practice-test-{n}-digital.pdf",
    "answers": "sat-practice-test-{n}-answers-digital.pdf",
    "scoring": "scoring-sat-practice-test-{n}-digital.pdf"
  },
  "note": "Tests 1-3 are not published in paper form and are absent. Adding them later is a manifest edit, not a code change."
}
```

- [ ] **Step 10: Write `manifest.py`**

```python
"""The source material, and proof that it is actually on disk."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / "practice-tests" / "extracted"
MANIFEST = HERE / "manifest.json"


def load() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def bundle_paths(entry: dict, spec: dict) -> dict[str, Path]:
    """The three PDFs for one manifest entry, keyed by role."""
    base = RAW / entry["dir"]
    return {
        role: base / pattern.format(n=entry["test_no"])
        for role, pattern in spec["file_pattern"].items()
    }


def missing() -> list[str]:
    """Every manifest-declared file that is not on disk.

    Empty is the expected state. A non-empty list must fail a run rather
    than let it quietly ingest fewer tests than the manifest promises --
    silently shipping 7 of 8 tests is the failure mode this exists to stop.
    """
    spec = load()
    gaps: list[str] = []
    for entry in spec["practice_tests"]:
        for role, path in bundle_paths(entry, spec).items():
            if not path.exists():
                gaps.append(f"test {entry['test_no']} {role}: {path}")
    return gaps
```

- [ ] **Step 11: Test the manifest against the real disk**

```python
# scripts/exam-lab/ingest-sat/tests/test_manifest.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import manifest


def test_every_manifest_file_is_on_disk():
    assert manifest.missing() == []


def test_manifest_covers_the_eight_published_tests():
    nums = [e["test_no"] for e in manifest.load()["practice_tests"]]
    assert nums == [4, 5, 6, 7, 8, 9, 10, 11]


def test_module_structure_totals_the_printed_120_questions():
    total = sum(m["questions"] for m in manifest.load()["module_structure"])
    assert total == 120
```

- [ ] **Step 12: Run and commit**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/ -q
git add scripts/exam-lab/ingest-sat/
git commit -m "feat(sat-ingest): shared bbox reader that survives control chars, plus manifest"
```

Expected: 112 passed.

---

### Task 2: Parse the official answer key out of the explanations PDF

**Files:**
- Create: `scripts/exam-lab/ingest-sat/parse_answers.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_parse_answers.py`

**Interfaces:**
- Consumes: `manifest.load`, `manifest.bundle_paths`, and `parse_qbank._CHOICE_CORRECT`, `_IN_RATIONALE`, `_ENTRY_NOTE` (reused, not re-written — the question bank already solved SPR recovery).
- Produces: `parse_answers.parse_answers(text: str) -> tuple[dict, list[dict]]` returning `({(section, module, qnum): answer}, rejected)` where `answer` matches the `SATAnswer` shape plus a `source` field, and `rejected` entries are `{"section","module","qnum","reason"}`; `parse_answers.text_of(pdf: Path) -> str`.

**Measured shape.** Running headers repeat on every page as `SAT ANSWER EXPLANATIONS n READING AND WRITING: MODULE 1` (the `n` is a bullet glyph pdftotext renders as the letter n). Each item begins with a line `QUESTION <n>`, numbered from 1 within its own module. Test 4 has exactly 120 of them: 33 + 33 + 27 + 27. Answers are phrased three ways — `Choice X is the best answer` (R&W, 66 in test 4), `Choice X is correct` (Math MCQ, 40), `The correct answer is <value>` (SPR, 14). The distractor phrasing `Choice X is incorrect` must never match; it does not, because the literal `is correct` differs from `is incorrect`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_parse_answers.py
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_parse_answers.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'parse_answers'`.

- [ ] **Step 3: Write `parse_answers.py`**

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_parse_answers.py -q
```

Expected: 7 passed.

- [ ] **Step 5: Run it over all 8 real tests**

A synthetic fixture proves the regexes; only the real corpus proves the structure.

```bash
cd scripts/exam-lab/ingest-sat
python -c "
import sys; sys.path.insert(0,'.')
import manifest, parse_answers, collections
spec = manifest.load()
for entry in spec['practice_tests']:
    paths = manifest.bundle_paths(entry, spec)
    answers, rejected = parse_answers.parse_answers(parse_answers.text_of(paths['answers']))
    problems = parse_answers.check_structure(answers, rejected, spec['module_structure'])
    kinds = collections.Counter(a['kind'] for a in answers.values())
    print(f\"test {entry['test_no']:2d}: {len(answers):3d} answers {dict(kinds)} rejected={len(rejected)} problems={problems}\")
"
```

Expected for every test: `120 answers`, `rejected=0`, `problems=[]`, and `{'mcq': 106, 'spr': 14}`.

**This has already been run.** All 8 tests produce exactly that, once `parse_qbank`'s `_EITHER` and line-break-tolerant `_ENTRY_NOTE` are in place (commit `1534bc4`). If a test reports problems, the regression is in this task's own code, not in the material.

**If any test does report problems, stop and report it** — do not adjust the expected counts to match the parse. Spec section 10.4 says a test that does not match its printed structure is dropped, and that decision is the user's.

- [ ] **Step 6: Commit**

```bash
git add scripts/exam-lab/ingest-sat/parse_answers.py scripts/exam-lab/ingest-sat/tests/test_parse_answers.py
git commit -m "feat(sat-ingest): official answer key parser for the practice tests"
```

---

### Task 3: Parse the raw-to-scaled conversion tables

**Files:**
- Create: `scripts/exam-lab/ingest-sat/parse_scoring.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_parse_scoring.py`

**Interfaces:**
- Consumes: `bbox.bbox_xml`, `bbox.words_by_page`, `manifest`.
- Produces: `parse_scoring.parse_tables(pages: dict[int, list[dict]]) -> dict[str, dict[int, tuple[int, int]]]` keyed `"rw"`/`"math"`, mapping section raw score to `(lower, upper)`; `parse_scoring.check_tables(tables) -> list[str]`.

**Measured shape.** The conversion table is a grid of numbers: a raw-score column and `LOWER`/`UPPER` columns, with the R&W table (raw 0–66) and the Math table (raw 0–54) side by side. **The plain-text stream is column-major and unusable** — `pdftotext` emits the whole raw-score column, then the whole LOWER column, and so on, so reading it linearly pairs the wrong numbers. Parse in `-bbox` space instead, exactly as plan 1 does for the question header.

Do not hard-code x positions. Cluster the numeric words into columns by gaps, then identify the raw-score column by its values forming a `0..N` run; `LOWER` and `UPPER` are the two columns to its right.

- [ ] **Step 1: Write the failing test**

```python
# scripts/exam-lab/ingest-sat/tests/test_parse_scoring.py
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import parse_scoring


def _w(text, left, top):
    return {"text": text, "left": left, "top": top, "right": left + 12, "bottom": top + 9}


def _grid(x0, rows):
    """One table: raw score, lower, upper -- three columns from x0."""
    out = []
    for i, (raw, lo, hi) in enumerate(rows):
        y = 100.0 + i * 12
        out += [_w(str(raw), x0, y), _w(str(lo), x0 + 60, y), _w(str(hi), x0 + 120, y)]
    return out


RW = [(0, 200, 200), (1, 200, 200), (2, 220, 230), (3, 250, 280)]
MATH = [(0, 200, 200), (1, 200, 210), (2, 230, 260), (3, 260, 300)]
PAGE = _grid(60.0, RW) + _grid(340.0, MATH)


def test_pairs_each_raw_score_with_its_own_lower_and_upper():
    """The failure this guards: the text stream is column-major, so reading
    it linearly pairs raw score 0 with raw score 1's lower bound and shifts
    the entire table by one row."""
    tables = parse_scoring.parse_tables({1: PAGE})
    assert tables["rw"][2] == (220, 230)
    assert tables["rw"][3] == (250, 280)


def test_keeps_the_two_side_by_side_tables_apart():
    tables = parse_scoring.parse_tables({1: PAGE})
    assert tables["rw"][1] == (200, 200)
    assert tables["math"][1] == (200, 210)


def test_check_rejects_a_lower_bound_above_its_upper():
    bad = {"rw": {0: (400, 300)}, "math": {}}
    assert any("lower" in p for p in parse_scoring.check_tables(bad))


def test_check_rejects_a_score_outside_the_published_200_800_range():
    bad = {"rw": {0: (100, 300)}, "math": {}}
    assert any("200-800" in p for p in parse_scoring.check_tables(bad))


def test_check_rejects_a_non_monotonic_curve():
    """More correct answers can never be worth a lower scaled score."""
    bad = {"rw": {0: (300, 320), 1: (280, 300)}, "math": {}}
    assert any("monotonic" in p for p in parse_scoring.check_tables(bad))
```

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_parse_scoring.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'parse_scoring'`.

- [ ] **Step 3: Write `parse_scoring.py`**

```python
"""Read a practice test's raw-to-scaled conversion tables.

These tables are the *only* thing that makes a score official (spec section
10.5). A score that did not come from one of them is labelled an estimate,
so a mis-parsed table is worse than no table: it would put College Board's
name on a number College Board never published.

The tables cannot be read from the plain text stream. pdftotext emits them
column-major -- the entire raw-score column, then the entire LOWER column,
then UPPER -- so reading linearly pairs raw score 0 with raw score 1's
bound and shifts the whole curve by a row. Everything here works in -bbox
coordinate space instead, the same discipline crop_qbank applies to the
question header.

Nothing hard-codes an x position: columns are found by clustering the
numbers' own left edges, and the raw-score column is identified by its
values forming a 0..N run. A different page layout in a future test shifts
the numbers but not that structure.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bbox

_INT = re.compile(r"^\d{1,4}$")
# Two numbers belong to the same column when their left edges are closer
# than this. Real columns in these guides are ~60pt apart and a column's own
# numbers share a left edge within a point or two, so 20pt sits clear of
# both. Right-aligned digits of differing width are what the tolerance is
# for; it is not a guess at the column spacing.
COLUMN_TOLERANCE = 20.0
ROW_TOLERANCE = 3.0
SCORE_MIN, SCORE_MAX = 200, 800
# Section raw-score ceilings, from the printed worksheet: Reading and
# Writing is 33 + 33, Math is 27 + 27.
RAW_MAX = {"rw": 66, "math": 54}


def _columns(words: list[dict]) -> list[list[dict]]:
    """Numeric words grouped into columns by their left edge, left to right."""
    nums = sorted((w for w in words if _INT.match(w["text"])), key=lambda w: w["left"])
    cols: list[list[dict]] = []
    for w in nums:
        if cols and w["left"] - cols[-1][-1]["left"] <= COLUMN_TOLERANCE:
            cols[-1].append(w)
        else:
            cols.append([w])
    return cols


def _is_raw_column(col: list[dict]) -> bool:
    """A raw-score column is a 0..N run read top to bottom. Scaled-score
    columns repeat values (200 appears many times) and never start at 0."""
    vals = [int(w["text"]) for w in sorted(col, key=lambda w: w["top"])]
    return len(vals) >= 4 and vals[0] == 0 and vals == list(range(len(vals)))


def _read_row(col: list[dict], top: float) -> int | None:
    for w in col:
        if abs(w["top"] - top) <= ROW_TOLERANCE:
            return int(w["text"])
    return None


def parse_tables(pages: dict[int, list[dict]]) -> dict[str, dict[int, tuple[int, int]]]:
    """{"rw": {raw: (lower, upper)}, "math": {...}}.

    Each raw-score column found anywhere in the guide contributes its rows;
    a table split across pages or page-columns therefore assembles itself.
    Which table is which is decided at the end by raw-score ceiling, not by
    position: Reading and Writing reaches 66, Math reaches 54.
    """
    found: list[dict[int, tuple[int, int]]] = []
    for words in pages.values():
        cols = _columns(words)
        for i, col in enumerate(cols):
            if not _is_raw_column(col) or i + 2 >= len(cols):
                continue
            lower_col, upper_col = cols[i + 1], cols[i + 2]
            table: dict[int, tuple[int, int]] = {}
            for w in col:
                lo = _read_row(lower_col, w["top"])
                hi = _read_row(upper_col, w["top"])
                if lo is not None and hi is not None:
                    table[int(w["text"])] = (lo, hi)
            if table:
                found.append(table)

    merged: dict[str, dict[int, tuple[int, int]]] = {"rw": {}, "math": {}}
    for table in found:
        ceiling = max(table)
        section = "rw" if ceiling > RAW_MAX["math"] else "math"
        merged[section].update(table)
    return merged


def check_tables(tables: dict[str, dict[int, tuple[int, int]]]) -> list[str]:
    """Every way a mis-parsed table can be caught without a second source.

    A table that passes all of these is not *proven* right, but every
    failure mode seen while developing this -- a shifted row, a column read
    as its neighbour, a page half-read -- breaks at least one of them.
    """
    problems: list[str] = []
    for section, table in tables.items():
        if not table:
            problems.append(f"{section}: no conversion table found")
            continue
        expected = set(range(0, RAW_MAX[section] + 1))
        if set(table) != expected:
            gaps = sorted(expected - set(table))
            problems.append(
                f"{section}: expected raw scores 0-{RAW_MAX[section]}, "
                f"{len(gaps)} missing ({gaps[:5]})"
            )
        for raw, (lo, hi) in sorted(table.items()):
            if lo > hi:
                problems.append(f"{section} raw {raw}: lower {lo} above upper {hi}")
            if not (SCORE_MIN <= lo <= SCORE_MAX and SCORE_MIN <= hi <= SCORE_MAX):
                problems.append(f"{section} raw {raw}: ({lo}, {hi}) outside 200-800")
        ordered = [table[r] for r in sorted(table)]
        for (lo, hi), (nlo, nhi) in zip(ordered, ordered[1:]):
            if nlo < lo or nhi < hi:
                problems.append(f"{section}: curve is not monotonic at ({lo}, {hi}) -> ({nlo}, {nhi})")
                break
    return problems


def tables_for(pdf: Path) -> dict[str, dict[int, tuple[int, int]]]:
    return parse_tables(bbox.words_by_page(bbox.bbox_xml(pdf)))
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_parse_scoring.py -q
```

Expected: 5 passed.

- [ ] **Step 5: Run it over all 8 real scoring guides**

```bash
cd scripts/exam-lab/ingest-sat
python -c "
import sys; sys.path.insert(0,'.')
import manifest, parse_scoring
spec = manifest.load()
for entry in spec['practice_tests']:
    paths = manifest.bundle_paths(entry, spec)
    t = parse_scoring.tables_for(paths['scoring'])
    problems = parse_scoring.check_tables(t)
    print(f\"test {entry['test_no']:2d}: rw={len(t['rw'])} rows math={len(t['math'])} rows \"
          f\"rw_max={t['rw'].get(66)} math_max={t['math'].get(54)} problems={problems[:2]}\")
"
```

Expected: `rw=67 rows`, `math=55 rows`, `problems=[]` for all 8, and both `*_max` values at or near `(800, 800)`.

**If the column clustering does not find the tables**, print the numeric columns for one page and adjust `COLUMN_TOLERANCE` to the measured spacing — do not switch to hard-coded x positions:

```bash
python -c "
import sys; sys.path.insert(0,'.')
import bbox, parse_scoring, manifest
spec = manifest.load()
p = manifest.bundle_paths(spec['practice_tests'][0], spec)['scoring']
for pno, words in bbox.words_by_page(bbox.bbox_xml(p)).items():
    cols = parse_scoring._columns(words)
    print(pno, [(round(c[0]['left']), len(c)) for c in cols])
"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/exam-lab/ingest-sat/parse_scoring.py scripts/exam-lab/ingest-sat/tests/test_parse_scoring.py
git commit -m "feat(sat-ingest): raw-to-scaled conversion table parser"
```

---

### Task 4: Two-column crop geometry for the test pages

**This is the highest-risk task in the plan, as spec section 12 predicted.** Two anchor rules were designed and measured against the real corpus while writing this plan, and **both failed**. Their results are recorded below so the same ground is not covered twice. Treat the anchor rule as something to *derive from the material and prove*, not something this plan already knows.

**Files:**
- Create: `scripts/exam-lab/ingest-sat/crop_tests.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_crop_tests.py`

**Interfaces:**
- Consumes: `bbox.words_by_page`, `bbox.page_sizes`, `poppler.tool`.
- Produces: `crop_tests.module_at(words) -> tuple[str, int] | None`; `crop_tests.columns(words, page_width) -> list[tuple[float, float]]`; `crop_tests.question_anchors(words, cols) -> list[dict]` with `{"qnum", "col", "top"}`; `crop_tests.regions(anchors, i, cols, page_bottom) -> list[dict]`; `crop_tests.render_regions(pdf, regions, dest, dpi=150) -> None`.

#### What was measured

All of this is from the real PDFs, not inferred.

| Fact | Evidence |
| --- | --- |
| Pages are two-column | Test 4 page 5: question 3's number at x=60.3, question 4's at x=338.7, both at y=117.5 |
| Question numbers are **outdented** ~11pt | Q3 at x=60.3 against its column's body text at x=71.8; Q4 at 338.7 against 350.2 |
| Font size is **not** a signal | Q3's bbox height is 9.83pt — identical to the body text beside it. Only the running header differs (15.6 / 23.2) |
| A dotted leader marks the gutter | A single word of dots at x≈294 and x≈312 whose bbox height reaches 605pt, i.e. the full column height |
| …but **not on every page or every test** | Present on 39–41 of 56 pages for tests 4–10; **entirely absent from test 11** |
| **Test 11 is a different generation** | 52 pages, not 56; no dotted leader anywhere; its headings are letter-spaced, so `33 QUESTIONS` tokenises as `'33','Q','U','E','S','T','I','O','N','S'` and the word `QUESTIONS` never appears |
| Test 11's running header repeats digits | Page 5 begins `'1','1','Module','1','3','5',…` |

#### Two rules that were tried and failed

**Attempt 1 — outdent alone.** Accept any 1–2 digit integer sitting at least 5pt left of its column's median text start. Measured against all 8 tests, expecting 33/33/27/27:

```
test  4: {('math',1): 97, ('math',2): 69, ('rw',1): 32, ('rw',2): 37}
test  7: {('math',1): 262}
test 11: {}
```

It over-counts catastrophically on Math — equations, figure labels and stray numerals all sit in the hanging indent — and finds nothing at all on test 11, whose module headers never match.

**Attempt 2 — outdent plus letter-space normalisation plus sequence-aware acceptance** (join single-character word runs, then accept a candidate only when it equals the next expected question number):

```
test  4: {('math',1): 6, ('math',2): 5, ('rw',1): 2}
test  8: {('math',1): 3, ('math',2): 6}
```

Worse. Module detection misfires onto content pages, which resets the expected counter constantly. **Sequence-aware acceptance cannot work until module boundaries are correct**, so module detection has to be solved first and solved separately.

#### Acceptance gate

Non-negotiable, and it comes before any rendering:

```
every test in 4..11 yields exactly {('rw',1): 33, ('rw',2): 33, ('math',1): 27, ('math',2): 27}
```

Spec section 10.4 drops a whole test that misses this, so a rule that works on seven tests is a rule that ships seven tests — the user decides whether that is acceptable, not the implementer.

- [ ] **Step 1: Solve module detection on its own, first**

It is a prerequisite for everything else and it is currently the larger of the two failures. Write `module_at(words)` and check it in isolation — a test has exactly four module starts, in the order R&W 1, R&W 2, Math 1, Math 2.

```bash
cd scripts/exam-lab/ingest-sat
python -c "
import sys; sys.path.insert(0,'.')
import bbox, crop_tests, manifest
spec = manifest.load()
for entry in spec['practice_tests']:
    p = manifest.bundle_paths(entry, spec)['test']
    pages = bbox.words_by_page(bbox.bbox_xml(p))
    starts = [(pno, crop_tests.module_at(w)) for pno, w in sorted(pages.items()) if crop_tests.module_at(w)]
    print(entry['test_no'], starts)
"
```

Expected: exactly four entries per test, in that order. Useful signals, in rough order of promise:

- The **answer-explanations PDF already gives the module order and sizes** and parses cleanly (Task 2, 120 questions, 33/33/27/27 on all 8 tests). The test PDF only has to be segmented consistently with it, so module detection can be driven by the known structure rather than discovered from scratch.
- Normalise letter-spacing before matching any heading (join runs of single-character words sharing a line), or match on a character-stripped form of the page text so `Q U E S T I O N S` and `QUESTIONS` compare equal.
- `DIRECTIONS` is a strong marker but test 11 carries a `GENERAL DIRECTIONS` page at the end — exclude it, it is not a module start.

- [ ] **Step 2: Solve the column split, with the dotted leader where it exists**

```python
_LEADER = re.compile(r"^\.{5,}$")
```

A leader word whose bbox height exceeds most of the page is an explicit gutter marker: split the page at its x. Where no leader exists (all of test 11, and ~15 pages of every other test), fall back to the widest vertical band no text crosses — sort words by left, track the running maximum right edge, and split at the largest gap.

Verify on every page of every test that the split yields two plausible columns, and that the leader-based and gap-based splits agree wherever both are available. **If they disagree anywhere, that page is the one to look at.**

- [ ] **Step 3: Derive the question-number rule, and prove it before rendering**

Outdent is necessary but nowhere near sufficient (attempt 1). Combine it with constraints that are cheap to check and hard to satisfy by accident:

- the candidate begins a line — nothing else sits on its row to its left within the column;
- the text that follows it begins at the column's body left edge, one line down;
- once module boundaries are right (Step 1), the accepted numbers must form exactly `1..K` in reading order, which is a strong filter rather than a cosmetic check;
- reading order within a page is left column fully, then right column.

Re-run the acceptance gate after every change:

```bash
python -c "
import sys; sys.path.insert(0,'.')
import bbox, crop_tests, manifest, collections
spec = manifest.load(); EXPECT = {('rw',1):33,('rw',2):33,('math',1):27,('math',2):27}
for entry in spec['practice_tests']:
    p = manifest.bundle_paths(entry, spec)['test']
    xml = bbox.bbox_xml(p); pages, sizes = bbox.words_by_page(xml), bbox.page_sizes(xml)
    counts, cur = collections.Counter(), None
    for pno in sorted(pages):
        found = crop_tests.module_at(pages[pno])
        if found: cur = found; continue
        if cur is None: continue
        counts[cur] += len(crop_tests.question_anchors(pages[pno], crop_tests.columns(pages[pno], sizes[pno][0])))
    got = dict(sorted(counts.items()))
    print(entry['test_no'], got, 'OK' if got == EXPECT else '<-- MISMATCH')
"
```

**Do not soften the expectation to match the parse.** If a test cannot be made to yield its printed structure, report it — spec section 10.4 makes dropping it the correct outcome, and that is the user's call.

- [ ] **Step 4: Write the regression tests**

Once the rule is derived, lock it in. These fixtures are the shapes that actually broke the two failed attempts, so they are worth keeping regardless of which rule finally wins.

```python
# scripts/exam-lab/ingest-sat/tests/test_crop_tests.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import crop_tests

PAGE_WIDTH, PAGE_BOTTOM = 612.0, 720.0


def _w(text, left, top, height=9.83):
    return {"text": text, "left": left, "top": top,
            "right": left + 10, "bottom": top + height}


# Test 4 page 5, reduced to its structure.
TWO_COLUMN_PAGE = [
    _w("Module", 294.7, 29.2, 15.56), _w("1", 310.9, 41.2, 23.17),
    _w("." * 30, 312.6, 115.7, 604.67),          # the dotted gutter leader
    _w("3", 60.3, 117.5), _w("Handedness,", 71.8, 135.5), _w("a", 128.4, 135.5),
    _w("A)", 71.8, 200.0), _w("left", 90.0, 200.0),
    _w("4", 338.7, 117.5), _w("It", 350.2, 135.4), _w("is", 359.4, 135.4),
    _w("A)", 350.2, 200.0), _w("right", 368.0, 200.0),
]

# Test 11's shape: letter-spaced heading, no leader, doubled running header.
LETTER_SPACED_HEADER_PAGE = [
    _w("1", 40.0, 29.0), _w("1", 48.0, 29.0),
    _w("Module", 276.7, 29.0, 15.56), _w("1", 293.1, 41.9, 23.17),
    _w("Reading", 124.3, 113.3), _w("and", 216.7, 113.3), _w("Writing", 262.1, 113.3),
    _w("33", 123.7, 142.7),
    *[_w(ch, 150.0 + i * 9, 142.7) for i, ch in enumerate("QUESTIONS")],
    _w("DIRECTIONS", 126.0, 196.9),
]


def test_finds_two_columns_on_a_test_page():
    cols = crop_tests.columns(TWO_COLUMN_PAGE, PAGE_WIDTH)
    assert len(cols) == 2 and cols[0][0] < 100 < cols[1][0]


def test_module_start_is_found_despite_letter_spaced_headings():
    """Test 11 letter-spaces its headings, so the word QUESTIONS never
    appears in the word stream. Matching it literally finds zero modules in
    that entire test -- measured."""
    assert crop_tests.module_at(LETTER_SPACED_HEADER_PAGE) == ("rw", 1)


def test_a_content_page_is_not_a_module_start():
    """Misfiring here resets the question counter mid-module, which is what
    made the second attempted rule return 6 questions instead of 27."""
    assert crop_tests.module_at(TWO_COLUMN_PAGE) is None


def test_question_numbers_are_found_and_the_running_header_is_not():
    cols = crop_tests.columns(TWO_COLUMN_PAGE, PAGE_WIDTH)
    anchors = crop_tests.question_anchors(TWO_COLUMN_PAGE, cols)
    assert [(a["qnum"], a["col"]) for a in anchors] == [(3, 0), (4, 1)]


def test_a_question_ends_where_the_next_one_in_its_column_begins():
    anchors = [{"qnum": 3, "col": 0, "top": 117.5, "page": 5},
               {"qnum": 5, "col": 0, "top": 400.0, "page": 5}]
    cols = [(55.0, 300.0), (333.0, 580.0)]
    regions = crop_tests.regions(anchors, 0, cols, PAGE_BOTTOM)
    assert len(regions) == 1 and regions[0]["bottom"] < 400.0


def test_a_question_running_past_its_column_stitches_into_the_next_one():
    """Spec 10.4 drops the whole test if a question is missing, so an
    overflowing question must be stitched, never skipped."""
    anchors = [{"qnum": 3, "col": 0, "top": 600.0, "page": 5},
               {"qnum": 4, "col": 1, "top": 300.0, "page": 5}]
    cols = [(55.0, 300.0), (333.0, 580.0)]
    regions = crop_tests.regions(anchors, 0, cols, PAGE_BOTTOM)
    assert len(regions) == 2
    assert regions[0]["bottom"] == PAGE_BOTTOM
    assert regions[1]["left"] == 333.0 and regions[1]["bottom"] < 300.0
```

- [ ] **Step 5: Write the settled half of `crop_tests.py`**

`regions` and `render_regions` do not depend on how anchors are found, so they can be written now exactly as below. Only `module_at`, `columns` and `question_anchors` are open.

```python
"""Locate and cut one question out of a two-column practice-test page.

The question bank put one question per header block down a single column.
The practice tests do not: each page carries two columns side by side, and a
question is one column-shaped region, not a full-width band.

Unlike the question bank, a question that will not crop cannot simply be
skipped: spec section 10.4 drops the entire test if its count does not match
the printed 33/33/27/27, so a question overflowing its column is stitched
into the next column instead. `ingest-5054/crop5054.py`'s `crop_question` is
the prior art for that paste-onto-one-canvas shape.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import poppler

PAD = 6.0
# The running header and the page-number footer sit outside the question
# body on every page, so no crop should ever reach them.
HEADER_TRIM = 95.0
FOOTER_TRIM = 60.0


def regions(anchors: list[dict], i: int, cols: list[tuple[float, float]],
            page_bottom: float) -> list[dict]:
    """The one or two rectangles making up question `anchors[i]`.

    One region when the next question starts in the same column. Two when it
    starts in the next column -- the question ran past the bottom of its own
    column and continues at the top of the next, and both halves are needed.
    """
    a = anchors[i]
    nxt = anchors[i + 1] if i + 1 < len(anchors) else None
    left, right = cols[a["col"]]
    top = a["top"] - PAD

    if nxt is not None and nxt["col"] == a["col"]:
        return [{"page": a["page"], "left": left, "right": right,
                 "top": top, "bottom": nxt["top"] - PAD}]

    first = {"page": a["page"], "left": left, "right": right,
             "top": top, "bottom": page_bottom}
    if nxt is None or nxt["col"] >= len(cols):
        return [first]
    nleft, nright = cols[nxt["col"]]
    return [first, {"page": a["page"], "left": nleft, "right": nright,
                    "top": HEADER_TRIM, "bottom": nxt["top"] - PAD}]


def render_regions(pdf: Path, regions: list[dict], dest: Path, dpi: int = 150) -> None:
    """Render and stitch `regions` into one image at `dest`, written
    atomically so an interrupted run leaves no half-file that a resume would
    mistake for a finished crop (plan 1's render_span rule).
    """
    scale = dpi / 72.0
    with tempfile.TemporaryDirectory() as tmp:
        slices = []
        for r in regions:
            stem = Path(tmp) / f"p{r['page']}"
            page_png = stem.with_suffix(".png")
            if not page_png.exists():
                subprocess.run(
                    [poppler.tool("pdftoppm"), "-png", "-r", str(dpi),
                     "-f", str(r["page"]), "-l", str(r["page"]),
                     "-singlefile", str(pdf), str(stem)],
                    check=True, capture_output=True,
                )
            img = Image.open(page_png).convert("RGB")
            slices.append(img.crop((
                int(r["left"] * scale), int(r["top"] * scale),
                min(img.width, int(r["right"] * scale)),
                min(img.height, int(r["bottom"] * scale)),
            )))
        width = max(s.width for s in slices)
        canvas = Image.new("RGB", (width, sum(s.height for s in slices)), "white")
        y = 0
        for s in slices:
            canvas.paste(s, (0, y))
            y += s.height
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = dest.with_name(f"{dest.name}.tmp")
        canvas.save(staging, "JPEG", quality=88)
        staging.replace(dest)
```

- [ ] **Step 6: Run the tests**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_crop_tests.py -q
```

Expected: 6 passed.

- [ ] **Step 7: Render samples and look at them**

Only after the acceptance gate in Step 3 is green. Plan 1's lesson stands: a text-layer rule cannot prove what an image shows, and the difficulty-glyph leak passed every text-layer check that existed at the time. Render a spread across both sections, both modules, a stitched question and an SPR item, and confirm each is one whole question — number, passage or stem, and all four choices — with nothing of its neighbour and nothing cut off.

- [ ] **Step 8: Commit**

```bash
git add scripts/exam-lab/ingest-sat/crop_tests.py scripts/exam-lab/ingest-sat/tests/test_crop_tests.py
git commit -m "feat(sat-ingest): two-column crop geometry with column stitching"
```

---

### Task 5: Orchestrate the practice-test ingest

**Files:**
- Create: `scripts/exam-lab/ingest-sat/extract_tests.py`
- Modify: `scripts/exam-lab/ingest-sat/upload.py` (add `test_bucket_path`)
- Test: `scripts/exam-lab/ingest-sat/tests/test_extract_tests.py`

**Interfaces:**
- Consumes: `manifest`, `bbox`, `crop_tests`, `parse_answers`, `parse_scoring`, `upload.upload_file`, `upload.preflight_credentials`, `upload.guard_prefix`.
- Produces: `upload.test_bucket_path(test_no, section, module, qnum) -> str`; `extract_tests.main(argv) -> int`; artifacts `out/tests/rows.json`, `skipped.json`, `uploaded.json`, `mode.json`, `scoring.json`.

- [ ] **Step 1: Add the bucket path for test images**

In `upload.py`, beside `bucket_path`:

```python
def test_bucket_path(test_no: int, section: str, module: int, qnum: int) -> str:
    """Canonical object key for one practice-test question's crop.

    Practice-test items have no College Board Question ID, so they are keyed
    by their position in the published form. Same prefix discipline as
    `bucket_path`: this does no sanitisation of its own and its output must
    go through `upload_file`, which calls `guard_prefix`.
    """
    return f"{PREFIX}practice/{test_no}/{section}-m{module}-q{qnum}.jpg"
```

- [ ] **Step 2: Write the failing tests**

```python
# scripts/exam-lab/ingest-sat/tests/test_extract_tests.py
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_tests
import upload


def test_test_bucket_path_stays_under_the_sat_prefix():
    p = upload.test_bucket_path(4, "rw", 1, 12)
    assert p == "sat/practice/4/rw-m1-q12.jpg"
    assert upload.guard_prefix(p) == p


def test_a_test_missing_questions_is_dropped_whole_not_shipped_short():
    """Spec 10.4. Shipping 32 of 33 questions would put a broken form in
    front of a student and score it against a 33-question conversion table."""
    rows = [{"test_no": 4, "section": "rw", "module": 1, "qnum": n} for n in range(1, 33)]
    structure = [{"section": "rw", "module": 1, "questions": 33}]
    complaints = extract_tests.check_test_complete(4, rows, structure)
    assert complaints and "33" in complaints[0]


def test_a_complete_test_passes_the_structure_gate():
    rows = [{"test_no": 4, "section": "rw", "module": 1, "qnum": n} for n in range(1, 34)]
    structure = [{"section": "rw", "module": 1, "questions": 33}]
    assert extract_tests.check_test_complete(4, rows, structure) == []


def test_a_row_is_never_emitted_without_a_resolved_answer():
    """Integrity rule 1: an unanswerable question is reported, not guessed."""
    with pytest.raises(KeyError):
        extract_tests.build_row(
            test_no=4, section="rw", module=1, qnum=1,
            answers={}, img="sat/practice/4/rw-m1-q1.jpg",
        )
```

- [ ] **Step 3: Run and watch them fail**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_extract_tests.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'extract_tests'`.

- [ ] **Step 4: Write `extract_tests.py`**

Mirror `extract_sat.py` exactly for everything it already solved — atomic writes, `uploaded.json` resume, `_upload_with_retry`, persist-in-`finally`, `mode.json` — and import those helpers rather than re-implementing them:

```python
"""Crop, upload and emit metadata for all 8 official practice tests.

Structurally the same run as extract_sat.py, and it reuses that module's
resumability and upload machinery wholesale. The difference is the failure
policy. The question bank ships whatever it can verify and reports the rest,
because a bank is a pool. A practice test is a *form*: shipping 32 of its 33
Reading and Writing questions would put a broken test in front of a student
and then score it against a conversion table built for 33. So spec section
10.4 applies here -- a test that does not come out whole is dropped whole,
and the run says so.

Emits, next to --out:
  rows.json      one row per question of every complete test
  skipped.json   every dropped test and every unresolved question, with why
  scoring.json   the conversion tables, keyed by test number
  uploaded.json  ids confirmed uploaded (resume)
  mode.json      {"dry_run": bool} -- the provenance gate reads this
"""
import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bbox
import crop_tests
import manifest
import parse_answers
import parse_scoring
import poppler
from extract_sat import _atomic_write_text, _load_uploaded, _record_uploaded, _upload_with_retry
from upload import preflight_credentials, test_bucket_path

HERE = Path(__file__).resolve().parent
CROPS = HERE / "out" / "test-crops"


def build_row(*, test_no: int, section: str, module: int, qnum: int,
              answers: dict, img: str) -> dict:
    """One shippable row. Raises KeyError when no official answer exists --
    integrity rule 1 means a question without one is never emitted."""
    answer = answers[(section, module, qnum)]
    return {
        "test_no": test_no, "section": section, "module": module, "qnum": qnum,
        "answer": answer,
        "img": img,
        "ref": f"SAT Practice Test {test_no} {section.upper()} Module {module} Q{qnum}",
        "source": "practice-test",
    }


def check_test_complete(test_no: int, rows: list[dict], structure: list[dict]) -> list[str]:
    """Spec 10.4 in one function: every module must be present in full."""
    problems = []
    for mod in structure:
        got = {r["qnum"] for r in rows
               if r["section"] == mod["section"] and r["module"] == mod["module"]}
        want = set(range(1, mod["questions"] + 1))
        if got != want:
            problems.append(
                f"test {test_no} {mod['section']} module {mod['module']}: "
                f"expected {mod['questions']} questions, got {len(got)} "
                f"(missing {sorted(want - got)[:5]})"
            )
    return problems


def ingest_test(entry: dict, spec: dict, *, dry_run: bool, uploaded: set[str],
                uploaded_path: Path) -> tuple[list[dict], list[dict], dict]:
    """(rows, skipped, tables) for one test. Rows are returned only if the
    test is complete; an incomplete test returns no rows and one skip entry
    naming every gap."""
    paths = manifest.bundle_paths(entry, spec)
    test_no = entry["test_no"]

    answers, rejected = parse_answers.parse_answers(parse_answers.text_of(paths["answers"]))
    tables = parse_scoring.tables_for(paths["scoring"])

    skipped = [{"test_no": test_no, "stage": "answers", **r} for r in rejected]
    for problem in parse_scoring.check_tables(tables):
        skipped.append({"test_no": test_no, "stage": "scoring", "reason": problem})

    xml = bbox.bbox_xml(paths["test"])
    pages, sizes = bbox.words_by_page(xml), bbox.page_sizes(xml)
    rows: list[dict] = []
    current: tuple[str, int] | None = None
    for pno in sorted(pages):
        found = crop_tests.module_at(pages[pno])
        if found:
            current = found
            continue
        if current is None:
            continue
        section, module = current
        width, height = sizes[pno]
        cols = crop_tests.columns(pages[pno], width)
        anchors = [{**a, "page": pno} for a in crop_tests.question_anchors(pages[pno], cols)]
        for i, a in enumerate(anchors):
            key = (section, module, a["qnum"])
            if key not in answers:
                skipped.append({"test_no": test_no, "stage": "answer-missing",
                                "section": section, "module": module,
                                "qnum": a["qnum"], "reason": "no-answer"})
                continue
            img = test_bucket_path(test_no, section, module, a["qnum"])
            dest = CROPS / str(test_no) / f"{section}-m{module}-q{a['qnum']}.jpg"
            if not dest.exists():
                crop_tests.render_regions(
                    paths["test"],
                    crop_tests.regions(anchors, i, cols, height - crop_tests.FOOTER_TRIM),
                    dest,
                )
            if not dry_run and img not in uploaded:
                img = _upload_with_retry(dest, img)
                _record_uploaded(uploaded_path, img, uploaded)
            rows.append(build_row(test_no=test_no, section=section, module=module,
                                  qnum=a["qnum"], answers=answers, img=img))

    problems = check_test_complete(test_no, rows, spec["module_structure"])
    if problems:
        skipped.append({"test_no": test_no, "stage": "structure",
                        "reason": "; ".join(problems)})
        return [], skipped, {}
    return rows, skipped, tables


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="crop only, do not upload")
    ap.add_argument("--only", type=int, default=0, help="ingest just this test number")
    ap.add_argument("--out", default=str(HERE / "out" / "tests" / "rows.json"))
    args = ap.parse_args(argv)

    poppler.preflight()
    if not args.dry_run:
        preflight_credentials()
    gaps = manifest.missing()
    if gaps:
        print("ERROR: manifest names files that are not on disk:", file=sys.stderr)
        for g in gaps:
            print(f"  {g}", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    uploaded_path = out_path.with_name("uploaded.json")
    uploaded = _load_uploaded(uploaded_path)
    spec = manifest.load()

    rows: list[dict] = []
    skipped: list[dict] = []
    scoring: dict[str, dict] = {}
    try:
        for entry in spec["practice_tests"]:
            if args.only and entry["test_no"] != args.only:
                continue
            got, lost, tables = ingest_test(entry, spec, dry_run=args.dry_run,
                                            uploaded=uploaded, uploaded_path=uploaded_path)
            rows += got
            skipped += lost
            if got:
                scoring[str(entry["test_no"])] = tables
            print(f"test {entry['test_no']}: {len(got)} rows, {len(lost)} issues")
    finally:
        _atomic_write_text(out_path, json.dumps(rows, indent=1))
        _atomic_write_text(out_path.with_name("skipped.json"), json.dumps(skipped, indent=1))
        _atomic_write_text(out_path.with_name("scoring.json"), json.dumps(scoring, indent=1))
        _atomic_write_text(out_path.with_name("mode.json"), json.dumps({"dry_run": args.dry_run}, indent=1))

    print(f"\n  {len(rows)} rows -> {out_path}")
    print(f"  {len(scoring)} complete tests")
    if skipped:
        hist = collections.Counter(s["stage"] for s in skipped)
        print("  issues:", dict(hist))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_extract_tests.py -q
```

Expected: 4 passed.

- [ ] **Step 6: Dry-run one test end to end, then all 8**

```bash
cd scripts/exam-lab/ingest-sat
python extract_tests.py --dry-run --only 4
python extract_tests.py --dry-run
```

Expected: `120 rows` per test, `960 rows` in total, `8 complete tests`, and no `structure` issues.

- [ ] **Step 7: Look at the crops — the automated count proves nothing about the image**

Open a spread of `out/test-crops/4/` covering both sections, both modules, a stitched question and an SPR item. Each must be one whole question with all its choices and nothing from its neighbour.

- [ ] **Step 8: Commit**

```bash
git add scripts/exam-lab/ingest-sat/extract_tests.py scripts/exam-lab/ingest-sat/upload.py scripts/exam-lab/ingest-sat/tests/test_extract_tests.py
git commit -m "feat(sat-ingest): practice-test orchestration, dropping any incomplete test whole"
```

---

### Task 6: Emit `practice-tests.json` behind the provenance gate

**Files:**
- Create: `scripts/exam-lab/ingest-sat/build_sat_tests.py`
- Test: `scripts/exam-lab/ingest-sat/tests/test_build_sat_tests.py`

**Interfaces:**
- Consumes: `build_sat_bank.check_provenance` (reused — the dry-run/live gate is already solved and must behave identically here).
- Produces: `src/lib/sat/practice-tests.json`, shaped `{"tests": [{"testNo", "questions": [...], "conversion": {"rw": {...}, "math": {...}}}]}`.

- [ ] **Step 1: Write the failing tests**

```python
# scripts/exam-lab/ingest-sat/tests/test_build_sat_tests.py
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_sat_tests

ROW = {
    "test_no": 4, "section": "rw", "module": 1, "qnum": 1,
    "answer": {"kind": "mcq", "correct": 1, "source": "best-answer"},
    "img": "sat/practice/4/rw-m1-q1.jpg",
    "ref": "SAT Practice Test 4 RW Module 1 Q1", "source": "practice-test",
}


def test_validate_accepts_a_good_row():
    build_sat_tests.validate([ROW], {"4": {"rw": {0: (200, 200)}, "math": {0: (200, 200)}}})


def test_validate_rejects_an_image_outside_the_sat_prefix():
    bad = {**ROW, "img": "o-level/4/x.jpg"}
    with pytest.raises(ValueError, match="sat/"):
        build_sat_tests.validate([bad], {"4": {"rw": {}, "math": {}}})


def test_validate_rejects_a_test_with_no_conversion_table():
    """Spec 10.5: without an ingested table there is no official score, and
    a practice test that cannot be scored officially is not shippable as
    one."""
    with pytest.raises(ValueError, match="conversion"):
        build_sat_tests.validate([ROW], {})


def test_validate_rejects_a_duplicate_question_slot():
    with pytest.raises(ValueError, match="duplicate"):
        build_sat_tests.validate([ROW, ROW], {"4": {"rw": {}, "math": {}}})


def test_build_refuses_a_dry_run_rows_file(tmp_path):
    """Same gate as the question bank: a dry run's images do not exist."""
    rows = tmp_path / "rows.json"
    rows.write_text(json.dumps([ROW]), encoding="utf-8")
    (tmp_path / "mode.json").write_text(json.dumps({"dry_run": True}), encoding="utf-8")
    with pytest.raises(ValueError, match="dry-run"):
        build_sat_tests.check_provenance([ROW], rows, allow_dry_run=False)
```

- [ ] **Step 2: Run and watch them fail**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_build_sat_tests.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'build_sat_tests'`.

- [ ] **Step 3: Write `build_sat_tests.py`**

```python
"""Emit src/lib/sat/practice-tests.json, refusing anything unverifiable.

The last gate for the practice tests, and deliberately the same shape as
build_sat_bank.py: re-validate every row independently of the code that
produced it, and refuse to build from a rows.json whose images were never
uploaded. `check_provenance` is imported from build_sat_bank rather than
copied -- one dry-run/live gate, one behaviour, one place to fix it.

The extra rule here is spec section 10.5: a practice test ships only with
its own ingested conversion table. Without one there is no official score,
and an official practice test that cannot be scored officially is not the
product this module promises.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sat_bank import check_provenance  # noqa: F401  (re-exported for tests)

REPO = Path(__file__).resolve().parents[3]
DEST = REPO / "src" / "lib" / "sat" / "practice-tests.json"
REQUIRED = ("test_no", "section", "module", "qnum", "answer", "img", "ref", "source")
SECTIONS = {"rw", "math"}
MODULES = {1, 2}


def validate(rows: list[dict], scoring: dict) -> None:
    seen: set[tuple] = set()
    for row in rows:
        for field in REQUIRED:
            if field not in row:
                raise ValueError(f"{row.get('ref', '?')}: missing field {field}")
        slot = (row["test_no"], row["section"], row["module"], row["qnum"])
        if slot in seen:
            raise ValueError(f"duplicate question slot {slot}")
        seen.add(slot)
        if row["section"] not in SECTIONS:
            raise ValueError(f"{slot}: unknown section {row['section']!r}")
        if row["module"] not in MODULES:
            raise ValueError(f"{slot}: unknown module {row['module']!r}")
        if not str(row["img"]).startswith("sat/"):
            raise ValueError(f"{slot}: image outside the sat/ prefix")
        answer = row["answer"]
        if not isinstance(answer, dict) or answer.get("kind") not in ("mcq", "spr"):
            raise ValueError(f"{slot}: unknown answer kind")
        if answer["kind"] == "mcq" and not isinstance(answer.get("correct"), int):
            raise ValueError(f"{slot}: mcq answer has no index")
        if answer["kind"] == "spr" and not answer.get("accepted"):
            raise ValueError(f"{slot}: spr answer has no accepted values")
        if str(row["test_no"]) not in scoring:
            raise ValueError(
                f"test {row['test_no']}: no conversion table -- an official "
                "practice test cannot ship without the table that makes its "
                "score official (spec 10.5)"
            )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", help="rows.json produced by extract_tests.py")
    ap.add_argument("--out", default=str(DEST))
    ap.add_argument("--allow-dry-run", action="store_true")
    args = ap.parse_args()

    rows_path = Path(args.rows)
    rows = json.loads(rows_path.read_text(encoding="utf-8"))
    scoring = json.loads(rows_path.with_name("scoring.json").read_text(encoding="utf-8"))
    check_provenance(rows, rows_path, allow_dry_run=args.allow_dry_run)
    validate(rows, scoring)

    by_test: dict[int, list[dict]] = {}
    for row in rows:
        by_test.setdefault(row["test_no"], []).append(row)
    payload = {
        "tests": [
            {
                "testNo": test_no,
                "questions": sorted(items, key=lambda r: (r["section"], r["module"], r["qnum"])),
                "conversion": scoring[str(test_no)],
            }
            for test_no, items in sorted(by_test.items())
        ]
    }
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"wrote {dest} ({len(by_test)} tests, {len(rows)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests and the gate itself**

```bash
python -m pytest scripts/exam-lab/ingest-sat/tests/test_build_sat_tests.py -q
cd scripts/exam-lab/ingest-sat
python build_sat_tests.py out/tests/rows.json --out out/tests/bank-check.json
```

Expected: 5 passed, then the build **refused** with the dry-run message. Then:

```bash
python build_sat_tests.py out/tests/rows.json --out out/tests/bank-check.json --allow-dry-run
```

Expected: a warning, then `wrote ... (8 tests, 960 questions)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/exam-lab/ingest-sat/build_sat_tests.py scripts/exam-lab/ingest-sat/tests/test_build_sat_tests.py
git commit -m "feat(sat-ingest): practice-test bank builder behind the provenance gate"
```

---

## Part B — the TypeScript core

**Testing convention.** This repo has no test framework. The house pattern is a plain Node script using `node:assert/strict` that imports `.ts` directly, registered in `package.json` — see `scripts/test-access-control.mjs` and the `test:access` script. Every task below follows it. Do **not** introduce vitest or jest.

Each new suite is added to `package.json` and to a `test:sat` aggregate:

```json
"test:sat": "node --no-warnings --experimental-strip-types scripts/test-sat-bank.mjs && node --no-warnings --experimental-strip-types scripts/test-sat-forms.mjs && node --no-warnings --experimental-strip-types scripts/test-sat-scoring.mjs && node --no-warnings --experimental-strip-types scripts/test-sat-access.mjs"
```

---

### Task 7: The data model

**Files:**
- Create: `src/lib/sat/types.ts`

**Interfaces:**
- Produces: every type below. Later tasks import from here and nowhere else.

- [ ] **Step 1: Write `types.ts`**

Spec section 5.2 verbatim, plus the practice-test and form shapes the later tasks need. No logic in this file.

```ts
// src/lib/sat/types.ts
//
// The SAT data model. A parallel module to src/lib/exam-lab/, not an
// extension of it: ELQuestion is physics-shaped (paper P1/P2/P4, LOT/HOT,
// Cambridge command words, marks, a marking scheme) and bending it to also
// mean "section/module/domain/skill/E-M-H/SPR" would make every SAT field
// optional noise in a working, revenue-carrying code path (spec 5.1).

export type SATSection = "rw" | "math";
export type SATDifficulty = "E" | "M" | "H";

export type SATDomain =
  | "information-ideas" | "craft-structure"
  | "expression-ideas"  | "standard-english"
  | "algebra" | "advanced-math" | "psda" | "geometry-trig";

/** How an answer was established. Kept on the shipped data so "how many
 *  answers rest on rationale prose alone" stays a one-line query. */
export type SATAnswerSource =
  | "answer-line" | "rationale" | "entry-note" | "rationale-stated" | "best-answer";

export type SATAnswer =
  | { kind: "mcq"; correct: 0 | 1 | 2 | 3; source?: SATAnswerSource }
  | { kind: "spr"; accepted: string[]; source?: SATAnswerSource };

/** A question-bank item: the pool adaptive mocks and drills are drawn from. */
export type SATQuestion = {
  id: string;            // College Board Question ID — the dedupe key
  section: SATSection;
  domain: SATDomain;
  skill: string;
  difficulty: SATDifficulty;
  answer: SATAnswer;
  rationale: string;
  img: string;           // bucket path, sat/ prefix
  ref: string;
  source: "question-bank";
};

/** A practice-test item. It has no College Board Question ID, so its
 *  identity is its position in the published form. It also carries no
 *  domain/skill/difficulty: College Board does not label the papers, and
 *  inventing labels would breach integrity rule 2. */
export type SATTestQuestion = {
  testNo: number;
  section: SATSection;
  module: 1 | 2;
  qnum: number;
  answer: SATAnswer;
  img: string;
  ref: string;
  source: "practice-test";
};

/** raw section score -> [lower, upper] scaled bound, from an ingested
 *  official conversion table. The only thing that makes a score official. */
export type SATConversionTable = Record<number, [number, number]>;

export type SATPracticeTest = {
  testNo: number;
  questions: SATTestQuestion[];
  conversion: Record<SATSection, SATConversionTable>;
};

/** The six question sets of an adaptive form (spec 7). */
export type SATFormKey =
  | "rw.m1" | "rw.m2.lower" | "rw.m2.upper"
  | "math.m1" | "math.m2.lower" | "math.m2.upper";

export type SATForm = {
  id: string;
  kind: "adaptive";
  sets: Record<SATFormKey, SATQuestion[]>;
};

/** A score, and how much authority it carries. Nothing in the UI may show a
 *  number without also showing which of these it is (spec 10.5). */
export type SATScore =
  | { authority: "official"; lower: number; upper: number; testNo: number }
  | { authority: "estimated"; lower: number; upper: number; basis: string };
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sat/types.ts
git commit -m "feat(sat): data model types"
```

---

### Task 8: Bank loaders and drill filters

**Files:**
- Create: `src/lib/sat/bank.ts`
- Create: `scripts/test-sat-bank.mjs`
- Modify: `package.json` (add `test:sat`)

**Interfaces:**
- Consumes: `./types`, `src/lib/sat/question-bank.json`, `src/lib/sat/practice-tests.json`.
- Produces: `loadQuestionBank(): SATQuestion[]`; `loadPracticeTests(): SATPracticeTest[]`; `practiceTest(testNo): SATPracticeTest | null`; `filterQuestions(bank, {section?, domain?, difficulty?, skill?}): SATQuestion[]`; `byDomain(bank, section): Record<SATDomain, SATQuestion[]>`; `domainProportions(bank, section): Record<SATDomain, number>`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-sat-bank.mjs
import assert from "node:assert/strict";
import { filterQuestions, byDomain, domainProportions } from "../src/lib/sat/bank.ts";

const q = (id, section, domain, difficulty) => ({
  id, section, domain, difficulty, skill: "s",
  answer: { kind: "mcq", correct: 0 }, rationale: "r",
  img: `sat/${section}/${id}.jpg`, ref: id, source: "question-bank",
});

const bank = [
  q("a", "math", "algebra", "E"), q("b", "math", "algebra", "H"),
  q("c", "math", "psda", "M"), q("d", "rw", "craft-structure", "E"),
];

assert.deepEqual(filterQuestions(bank, { section: "math" }).map((x) => x.id), ["a", "b", "c"]);
assert.deepEqual(filterQuestions(bank, { difficulty: "H" }).map((x) => x.id), ["b"]);
assert.deepEqual(filterQuestions(bank, { section: "math", domain: "psda" }).map((x) => x.id), ["c"]);
// An empty filter is not a filter -- it must not silently return nothing.
assert.equal(filterQuestions(bank, {}).length, 4);

assert.deepEqual(Object.keys(byDomain(bank, "math")).sort(), ["algebra", "psda"]);

const props = domainProportions(bank, "math");
assert.ok(Math.abs(props.algebra - 2 / 3) < 1e-9);
assert.ok(Math.abs(props.psda - 1 / 3) < 1e-9);
// Proportions over a section must sum to 1, or form assembly silently
// under-fills a module.
assert.ok(Math.abs(Object.values(props).reduce((a, b) => a + b, 0) - 1) < 1e-9);

console.log("sat-bank tests passed");
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-bank.mjs
```

Expected: FAIL — cannot resolve `../src/lib/sat/bank.ts`.

- [ ] **Step 3: Write `bank.ts`**

```ts
// src/lib/sat/bank.ts
//
// Loading and indexing for both generated banks. The JSON is emitted by
// scripts/exam-lab/ingest-sat/build_sat_bank.py and build_sat_tests.py and
// is imported directly, exactly as src/lib/exam-lab/ does with its own
// generated banks -- it is build-time data, not a runtime fetch.
import questionBank from "./question-bank.json";
import practiceTests from "./practice-tests.json";
import type {
  SATDomain, SATDifficulty, SATPracticeTest, SATQuestion, SATSection,
} from "./types";

export function loadQuestionBank(): SATQuestion[] {
  return questionBank as SATQuestion[];
}

export function loadPracticeTests(): SATPracticeTest[] {
  return (practiceTests as { tests: SATPracticeTest[] }).tests;
}

export function practiceTest(testNo: number): SATPracticeTest | null {
  return loadPracticeTests().find((t) => t.testNo === testNo) ?? null;
}

export type SATFilter = {
  section?: SATSection;
  domain?: SATDomain;
  difficulty?: SATDifficulty;
  skill?: string;
};

/** Drill filtering. An absent key means "no constraint", so `{}` returns the
 *  whole bank rather than nothing. */
export function filterQuestions(bank: SATQuestion[], f: SATFilter): SATQuestion[] {
  return bank.filter((q) =>
    (f.section === undefined || q.section === f.section) &&
    (f.domain === undefined || q.domain === f.domain) &&
    (f.difficulty === undefined || q.difficulty === f.difficulty) &&
    (f.skill === undefined || q.skill === f.skill));
}

export function byDomain(
  bank: SATQuestion[], section: SATSection,
): Record<string, SATQuestion[]> {
  const out: Record<string, SATQuestion[]> = {};
  for (const q of bank) {
    if (q.section !== section) continue;
    (out[q.domain] ||= []).push(q);
  }
  return out;
}

/**
 * Each domain's share of a section, measured from the bank itself.
 *
 * College Board publishes blueprint percentages, but nothing on disk states
 * them, and integrity rule 2 says ship only what the material supports. So
 * the target mix for assembled forms is derived from the labelled corpus --
 * a fact this repo can verify -- and the UI calls it that. It is not
 * presented as College Board's blueprint.
 */
export function domainProportions(
  bank: SATQuestion[], section: SATSection,
): Record<string, number> {
  const groups = byDomain(bank, section);
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  const out: Record<string, number> = {};
  for (const [domain, items] of Object.entries(groups)) {
    out[domain] = total === 0 ? 0 : items.length / total;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes, then wire up the script**

Add to `package.json` scripts, then:

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-bank.mjs
npm run typecheck
```

Expected: `sat-bank tests passed`, clean typecheck.

**Note:** until the ingest has produced `src/lib/sat/practice-tests.json`, `bank.ts` will not resolve that import. Generate a placeholder with the real shape and zero tests — `{"tests": []}` — so the module compiles; the real file overwrites it when Task 6 runs live.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sat/bank.ts scripts/test-sat-bank.mjs package.json
git commit -m "feat(sat): bank loaders and drill filters"
```

---

### Task 9: Adaptive form assembly

**Files:**
- Create: `src/lib/sat/forms.ts`
- Create: `scripts/test-sat-forms.mjs`

**Interfaces:**
- Consumes: `./types`, `./bank` (`byDomain`, `domainProportions`).
- Produces: `BLUEPRINT`; `assembleForm(bank, rng): SATForm`; `allocateByDomain(total, proportions): Record<string, number>`; `pickWeighted(pool, n, weights, rng): SATQuestion[]`.

**Blueprint (spec 7).** R&W 27 questions per module at 32 minutes; Math 22 per module at 35 minutes; a 10-minute break between sections. Module 1 is mixed difficulty; Module 2 lower is weighted toward E/M and upper toward M/H. This is the **real digital** shape — 98 questions — not the 120-question paper shape.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-sat-forms.mjs
import assert from "node:assert/strict";
import { BLUEPRINT, allocateByDomain, assembleForm } from "../src/lib/sat/forms.ts";

// Deterministic RNG so a form is reproducible and a failure is debuggable.
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const q = (id, section, domain, difficulty) => ({
  id, section, domain, difficulty, skill: "s",
  answer: { kind: "mcq", correct: 0 }, rationale: "r",
  img: `sat/${section}/${id}.jpg`, ref: id, source: "question-bank",
});

// A pool deep enough that assembly is never forced.
const bank = [];
for (const [section, domains] of [
  ["rw", ["information-ideas", "craft-structure", "expression-ideas", "standard-english"]],
  ["math", ["algebra", "advanced-math", "psda", "geometry-trig"]],
]) {
  for (const d of domains) {
    for (const diff of ["E", "M", "H"]) {
      for (let i = 0; i < 40; i++) bank.push(q(`${section}-${d}-${diff}-${i}`, section, d, diff));
    }
  }
}

assert.equal(BLUEPRINT.rw.perModule, 27);
assert.equal(BLUEPRINT.math.perModule, 22);
assert.equal(BLUEPRINT.rw.minutes, 32);
assert.equal(BLUEPRINT.math.minutes, 35);
assert.equal(BLUEPRINT.breakMinutes, 10);

// Largest-remainder allocation must total exactly, never 26 or 28.
const alloc = allocateByDomain(27, { a: 0.3, b: 0.3, c: 0.2, d: 0.2 });
assert.equal(Object.values(alloc).reduce((x, y) => x + y, 0), 27);

const form = assembleForm(bank, seeded(7));
for (const key of ["rw.m1", "rw.m2.lower", "rw.m2.upper"]) {
  assert.equal(form.sets[key].length, 27, `${key} must hold 27 questions`);
}
for (const key of ["math.m1", "math.m2.lower", "math.m2.upper"]) {
  assert.equal(form.sets[key].length, 22, `${key} must hold 22 questions`);
}

// A student must never meet the same question twice in one sitting: the two
// Module 2 variants are alternatives, but Module 1 is always sat.
const m1 = new Set(form.sets["rw.m1"].map((x) => x.id));
for (const key of ["rw.m2.lower", "rw.m2.upper"]) {
  for (const item of form.sets[key]) {
    assert.ok(!m1.has(item.id), `${item.id} appears in both rw.m1 and ${key}`);
  }
}

// Module 2 lower leans easy, upper leans hard. Compared against each other,
// not against an absolute threshold, which is what the weighting claims.
const hard = (key) => form.sets[key].filter((x) => x.difficulty === "H").length;
assert.ok(hard("rw.m2.upper") > hard("rw.m2.lower"), "upper module must be harder");
assert.ok(hard("math.m2.upper") > hard("math.m2.lower"), "upper module must be harder");

// Reproducible: the same seed yields the same form.
assert.deepEqual(
  assembleForm(bank, seeded(7)).sets["rw.m1"].map((x) => x.id),
  form.sets["rw.m1"].map((x) => x.id),
);

console.log("sat-forms tests passed");
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-forms.mjs
```

Expected: FAIL — cannot resolve `../src/lib/sat/forms.ts`.

- [ ] **Step 3: Write `forms.ts`**

```ts
// src/lib/sat/forms.ts
//
// Assemble an adaptive mock to the real digital blueprint (spec 7).
//
// The official papers cannot do this job: they are linear, 33/33/27/27, with
// exactly one Module 2 per section, so there is no upper/lower pair to route
// between. Splitting them into invented variants would fabricate forms
// College Board never published. Adaptive mocks are therefore drawn from the
// question bank, using College Board's own E/M/H labels, and are scored as
// *estimated* (spec 8) precisely because no published curve exists for them.
import { byDomain, domainProportions } from "./bank";
import type { SATForm, SATFormKey, SATQuestion, SATSection } from "./types";

export const BLUEPRINT = {
  rw: { perModule: 27, minutes: 32 },
  math: { perModule: 22, minutes: 35 },
  breakMinutes: 10,
} as const;

/** Difficulty mix per module set. Module 1 is mixed; Module 2 splits into an
 *  easier and a harder variant. These weights are this module's own
 *  calibration, not a College Board published mix, and the UI says so. */
const DIFFICULTY_WEIGHTS = {
  m1:    { E: 0.34, M: 0.33, H: 0.33 },
  lower: { E: 0.50, M: 0.35, H: 0.15 },
  upper: { E: 0.15, M: 0.35, H: 0.50 },
} as const;

export type Rng = () => number;

/**
 * Split `total` across domains by proportion, using largest remainder.
 *
 * Plain rounding does not work: four domains rounded independently can total
 * 26 or 28 against a 27-question module, and a module that is one question
 * short is a broken form, not a rounding detail.
 */
export function allocateByDomain(
  total: number, proportions: Record<string, number>,
): Record<string, number> {
  const domains = Object.keys(proportions);
  const exact = domains.map((d) => ({ d, want: total * proportions[d] }));
  const out: Record<string, number> = {};
  let used = 0;
  for (const { d, want } of exact) {
    out[d] = Math.floor(want);
    used += out[d];
  }
  const order = [...exact].sort(
    (a, b) => (b.want - Math.floor(b.want)) - (a.want - Math.floor(a.want)),
  );
  for (let i = 0; used < total; i++, used++) out[order[i % order.length].d]++;
  return out;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw `n` questions from `pool` to a difficulty mix.
 *
 * Falls back across difficulties rather than returning short: a form that
 * cannot be filled is useless, and the bank is deep enough in every cell
 * (the thinnest is ~348 items) that a shortfall means a filter bug, not a
 * genuinely empty pool.
 */
export function pickWeighted(
  pool: SATQuestion[], n: number,
  weights: Record<string, number>, rng: Rng,
): SATQuestion[] {
  const buckets: Record<string, SATQuestion[]> = { E: [], M: [], H: [] };
  for (const q of pool) buckets[q.difficulty]?.push(q);
  for (const k of Object.keys(buckets)) buckets[k] = shuffle(buckets[k], rng);

  const want = allocateByDomain(n, weights);
  const picked: SATQuestion[] = [];
  for (const [difficulty, count] of Object.entries(want)) {
    picked.push(...buckets[difficulty].splice(0, count));
  }
  const spare = shuffle([...buckets.E, ...buckets.M, ...buckets.H], rng);
  while (picked.length < n && spare.length) picked.push(spare.shift()!);
  return picked;
}

function buildSet(
  bank: SATQuestion[], section: SATSection, weights: Record<string, number>,
  used: Set<string>, rng: Rng,
): SATQuestion[] {
  const groups = byDomain(bank, section);
  const allocation = allocateByDomain(BLUEPRINT[section].perModule, domainProportions(bank, section));
  const out: SATQuestion[] = [];
  for (const [domain, count] of Object.entries(allocation)) {
    const available = (groups[domain] ?? []).filter((q) => !used.has(q.id));
    const chosen = pickWeighted(available, count, weights, rng);
    for (const q of chosen) used.add(q.id);
    out.push(...chosen);
  }
  return shuffle(out, rng);
}

/**
 * A full adaptive form: six question sets.
 *
 * Module 1 and both Module 2 variants are disjoint, because a student sits
 * Module 1 and then exactly one Module 2 — meeting the same question twice
 * in one sitting would invalidate the score. The two Module 2 variants may
 * overlap each other: no student ever sees both.
 */
export function assembleForm(bank: SATQuestion[], rng: Rng): SATForm {
  const sets = {} as Record<SATFormKey, SATQuestion[]>;
  for (const section of ["rw", "math"] as const) {
    const used = new Set<string>();
    sets[`${section}.m1`] = buildSet(bank, section, DIFFICULTY_WEIGHTS.m1, used, rng);
    // A fresh `used` per Module 2 variant, seeded with Module 1's ids: the
    // two variants are alternatives, so they may share questions with each
    // other but never with Module 1.
    const afterM1 = new Set(used);
    sets[`${section}.m2.lower`] = buildSet(bank, section, DIFFICULTY_WEIGHTS.lower, new Set(afterM1), rng);
    sets[`${section}.m2.upper`] = buildSet(bank, section, DIFFICULTY_WEIGHTS.upper, new Set(afterM1), rng);
  }
  return { id: `form-${Date.now().toString(36)}`, kind: "adaptive", sets };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-forms.mjs
npm run typecheck
```

Expected: `sat-forms tests passed`.

- [ ] **Step 5: Assemble a form from the real bank**

```bash
node --no-warnings --experimental-strip-types -e "
import('./src/lib/sat/bank.ts').then(async (b) => {
  const { assembleForm } = await import('./src/lib/sat/forms.ts');
  const form = assembleForm(b.loadQuestionBank(), Math.random);
  for (const [k, v] of Object.entries(form.sets)) console.log(k, v.length);
});
"
```

Expected: 27/27/27 and 22/22/22.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sat/forms.ts scripts/test-sat-forms.mjs package.json
git commit -m "feat(sat): adaptive form assembly to the digital blueprint"
```

---

### Task 10: Module 2 routing

**Files:**
- Create: `src/lib/sat/adaptive.ts`
- Test: extend `scripts/test-sat-forms.mjs`

**Interfaces:**
- Consumes: `./types`, `./forms` (`BLUEPRINT`).
- Produces: `ROUTING`; `routeModule2(section, rawCorrect): "lower" | "upper"`; `ROUTING_DISCLOSURE` (the exact sentence the UI must show).

- [ ] **Step 1: Write the failing test (append to `scripts/test-sat-forms.mjs`)**

```js
import { ROUTING, routeModule2, ROUTING_DISCLOSURE } from "../src/lib/sat/adaptive.ts";

assert.equal(routeModule2("rw", 27), "upper");
assert.equal(routeModule2("rw", 0), "lower");
assert.equal(routeModule2("rw", ROUTING.rw.threshold), "upper");
assert.equal(routeModule2("rw", ROUTING.rw.threshold - 1), "lower");
assert.equal(routeModule2("math", 22), "upper");
assert.equal(routeModule2("math", 0), "lower");

// Spec 10.6: the threshold is an approximation and must say so wherever it
// is surfaced. A blank disclosure would let the UI imply it is official.
assert.ok(ROUTING_DISCLOSURE.length > 40);
assert.ok(/approximation|not.*official|does not publish/i.test(ROUTING_DISCLOSURE));

console.log("sat-adaptive tests passed");
```

- [ ] **Step 2: Run and watch it fail**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-forms.mjs
```

Expected: FAIL — cannot resolve `../src/lib/sat/adaptive.ts`.

- [ ] **Step 3: Write `adaptive.ts`**

```ts
// src/lib/sat/adaptive.ts
//
// Routing from Module 1 to Module 2.
//
// College Board does not publish the real routing algorithm or its cut
// score. This threshold is therefore a documented, configurable
// approximation, and spec 10.6 requires it to be described as one
// *everywhere it is surfaced* -- hence ROUTING_DISCLOSURE living here, next
// to the number it describes, rather than being retyped in each component
// that happens to show a score.
import { BLUEPRINT } from "./forms";
import type { SATSection } from "./types";

/** Share of Module 1 a student must answer correctly to route upward. 60% is
 *  this module's calibration, chosen to put roughly the upper half of
 *  test-takers into the harder module. It is not College Board's value; no
 *  published value exists. */
const UPPER_SHARE = 0.6;

export const ROUTING: Record<SATSection, { threshold: number; outOf: number }> = {
  rw: {
    threshold: Math.ceil(BLUEPRINT.rw.perModule * UPPER_SHARE),
    outOf: BLUEPRINT.rw.perModule,
  },
  math: {
    threshold: Math.ceil(BLUEPRINT.math.perModule * UPPER_SHARE),
    outOf: BLUEPRINT.math.perModule,
  },
};

export const ROUTING_DISCLOSURE =
  "College Board does not publish the routing rule or cut score the real " +
  "digital SAT uses. This practice form routes on the number of Module 1 " +
  "questions answered correctly, against a threshold this site chose as an " +
  "approximation. It is not the official algorithm.";

/** Which Module 2 a student sits, given their Module 1 raw correct. */
export function routeModule2(section: SATSection, rawCorrect: number): "lower" | "upper" {
  return rawCorrect >= ROUTING[section].threshold ? "upper" : "lower";
}
```

- [ ] **Step 4: Run, typecheck, commit**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-forms.mjs
npm run typecheck
git add src/lib/sat/adaptive.ts scripts/test-sat-forms.mjs
git commit -m "feat(sat): Module 2 routing with its approximation disclosed"
```

---

### Task 11: Scoring

**Files:**
- Create: `src/lib/sat/scoring.ts`
- Create: `scripts/test-sat-scoring.mjs`

**Interfaces:**
- Consumes: `./types`, `./bank` (`practiceTest`), `./forms` (`BLUEPRINT`).
- Produces: `scoreOfficial(testNo, rawByS): SATScore | null`; `scoreEstimated(rawByS): SATScore`; `totalRange(rw, math): [number, number]`.

**Rule (spec 8, 10.5).** A practice test scores through its own ingested conversion table and is called **official**, as a range. An assembled adaptive mock has no published curve, so it is scored against the average of the ingested official curves and labelled **estimated** — never dressed up as official.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-sat-scoring.mjs
import assert from "node:assert/strict";
import { totalRange, scoreEstimated, scoreFromTable } from "../src/lib/sat/scoring.ts";

const table = { 0: [200, 200], 10: [300, 330], 20: [420, 460], 66: [790, 800] };

assert.deepEqual(scoreFromTable(table, 10), [300, 330]);
// A raw score with no exact row must interpolate between neighbours, not
// silently return 200 or throw mid-exam.
const [lo, hi] = scoreFromTable(table, 15);
assert.ok(lo > 300 && lo < 420, `interpolated lower ${lo} out of range`);
assert.ok(hi > 330 && hi < 460);

assert.deepEqual(totalRange([200, 220], [200, 210]), [400, 430]);
// The published total is 400-1600; no arithmetic may leave that range.
assert.deepEqual(totalRange([790, 800], [790, 800]), [1580, 1600]);

const est = scoreEstimated({ rw: 27, math: 22 });
assert.equal(est.authority, "estimated");
assert.ok(est.basis.length > 10, "an estimate must say what it is based on");
assert.ok(est.lower <= est.upper);
assert.ok(est.lower >= 400 && est.upper <= 1600);

console.log("sat-scoring tests passed");
```

- [ ] **Step 2: Run and watch it fail**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-scoring.mjs
```

Expected: FAIL — cannot resolve `../src/lib/sat/scoring.ts`.

- [ ] **Step 3: Write `scoring.ts`**

```ts
// src/lib/sat/scoring.ts
//
// Official scores come from an ingested conversion table and nowhere else
// (spec 10.5). Everything else is an estimate and is labelled one.
//
// College Board scores a linear paper to a RANGE, not a point: the guides
// map a section raw score to a lower and an upper bound and instruct the
// student to add the bounds separately. This module does the same rather
// than inventing a precision College Board does not claim.
import { loadPracticeTests, practiceTest } from "./bank";
import { BLUEPRINT } from "./forms";
import type { SATConversionTable, SATScore, SATSection } from "./types";

const TOTAL_MIN = 400;
const TOTAL_MAX = 1600;

/**
 * [lower, upper] for a raw score, interpolating between rows when the exact
 * raw score is absent.
 *
 * A complete ingested table has every row, so interpolation should never
 * fire on real data. It exists so that a partially-parsed table degrades to
 * a slightly-off score rather than throwing at the moment a student submits.
 */
export function scoreFromTable(table: SATConversionTable, raw: number): [number, number] {
  const exact = table[raw];
  if (exact) return [exact[0], exact[1]];
  const rows = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!rows.length) return [200, 200];
  if (raw <= rows[0]) return table[rows[0]];
  if (raw >= rows[rows.length - 1]) return table[rows[rows.length - 1]];
  const above = rows.findIndex((r) => r > raw);
  const [lo, hi] = [rows[above - 1], rows[above]];
  const t = (raw - lo) / (hi - lo);
  const at = (i: 0 | 1) => Math.round(table[lo][i] + t * (table[hi][i] - table[lo][i]));
  return [at(0), at(1)];
}

/** Add the two section ranges, bounds separately, as the guides instruct. */
export function totalRange(rw: [number, number], math: [number, number]): [number, number] {
  return [
    Math.max(TOTAL_MIN, rw[0] + math[0]),
    Math.min(TOTAL_MAX, rw[1] + math[1]),
  ];
}

/** An official score for a practice test, or null if that test has no
 *  ingested table — in which case nothing may claim officiality. */
export function scoreOfficial(
  testNo: number, raw: Record<SATSection, number>,
): SATScore | null {
  const test = practiceTest(testNo);
  if (!test?.conversion?.rw || !test?.conversion?.math) return null;
  const [lower, upper] = totalRange(
    scoreFromTable(test.conversion.rw, raw.rw),
    scoreFromTable(test.conversion.math, raw.math),
  );
  return { authority: "official", lower, upper, testNo };
}

/**
 * An estimated score for an assembled adaptive form.
 *
 * There is no published curve for a form College Board never published, so
 * this averages the ingested official curves and maps the adaptive raw
 * score onto the paper scale by proportion — an adaptive section is out of
 * 54 (R&W) or 44 (Math) where the paper is out of 66 or 54. That mapping is
 * an approximation on top of an average, which is exactly why the result is
 * labelled "estimated" and carries its basis in the value itself.
 */
export function scoreEstimated(raw: Record<SATSection, number>): SATScore {
  const tests = loadPracticeTests();
  const paperMax: Record<SATSection, number> = { rw: 66, math: 54 };
  const adaptiveMax: Record<SATSection, number> = {
    rw: BLUEPRINT.rw.perModule * 2,
    math: BLUEPRINT.math.perModule * 2,
  };

  const sectionRange = (section: SATSection): [number, number] => {
    const scaled = Math.round((raw[section] / adaptiveMax[section]) * paperMax[section]);
    const curves = tests
      .map((t) => t.conversion?.[section])
      .filter((c): c is SATConversionTable => Boolean(c && Object.keys(c).length));
    if (!curves.length) return [200, 200];
    const bounds = curves.map((c) => scoreFromTable(c, scaled));
    const mean = (i: 0 | 1) =>
      Math.round(bounds.reduce((n, b) => n + b[i], 0) / bounds.length);
    return [mean(0), mean(1)];
  };

  const [lower, upper] = totalRange(sectionRange("rw"), sectionRange("math"));
  return {
    authority: "estimated",
    lower,
    upper,
    basis:
      `Estimated from the average of ${tests.length} official conversion ` +
      "tables. No published curve exists for an assembled adaptive form, so " +
      "this is not an official SAT score.",
  };
}
```

- [ ] **Step 4: Run, typecheck, commit**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-scoring.mjs
npm run typecheck
git add src/lib/sat/scoring.ts scripts/test-sat-scoring.mjs package.json
git commit -m "feat(sat): official range scoring and labelled estimates"
```

---

### Task 12: The `sat-001` migration

**Files:**
- Create: `supabase/migrations/sat-001-sat-lab.sql`

**Interfaces:**
- Mirrors `supabase/migrations/el-001-exam-lab.sql` in structure, naming and RLS. Depends on the `edu_is_staff()` helper from `edu-001`.

- [ ] **Step 1: Read the migration being mirrored**

```bash
cat supabase/migrations/el-001-exam-lab.sql
```

Note its conventions: additive and idempotent (`create table if not exists`), a comment header stating the dependency, RLS enabled on every table, and owner-or-staff read / owner insert / staff manage policies.

- [ ] **Step 2: Write the migration**

```sql
-- ============================================================================
-- SAT Lab (sat_) — question bank, adaptive forms, attempts, module results
-- Additive & idempotent. Safe to run multiple times.
-- Depends on edu-001 helper edu_is_staff() (present in this project).
-- Mirrors el-001-exam-lab.sql: reads/writes happen through server route
-- handlers using the service-role client; RLS below is defense-in-depth for
-- any direct anon/authenticated use.
-- ============================================================================

-- ---------- question bank -----------------------------------------------------
-- Mirrors the generated src/lib/sat/question-bank.json so the bank can be
-- queried as well as bundled. `cb_id` is College Board's own Question ID and
-- is the dedupe key (integrity rule 3), so it is unique rather than merely
-- indexed.
create table if not exists sat_questions (
  id           uuid primary key default gen_random_uuid(),
  cb_id        text unique not null,
  section      text not null check (section in ('rw','math')),
  domain       text not null,
  skill        text not null,
  difficulty   text not null check (difficulty in ('E','M','H')),
  answer       jsonb not null,           -- {kind:'mcq',correct:0..3} | {kind:'spr',accepted:[]}
  rationale    text not null,
  img          text not null,            -- bucket path, sat/ prefix
  source_ref   text not null,
  source       text not null default 'question-bank'
                 check (source in ('question-bank','practice-test')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists sat_questions_filter_idx
  on sat_questions (section, domain, difficulty, is_active);

-- ---------- assembled forms ---------------------------------------------------
-- `sets` holds the six question-id lists of an adaptive form (spec 7).
-- `routing_threshold` is stored per form, not read from code at scoring time:
-- a form scored months later must be scored against the threshold it was
-- actually sat under, even if the site's default has since changed.
create table if not exists sat_forms (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'adaptive'
                      check (kind in ('adaptive','practice-test')),
  test_no           int,                 -- set for practice-test forms only
  sets              jsonb not null default '{}'::jsonb,
  routing_threshold jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ---------- attempts ----------------------------------------------------------
-- `score_authority` is stored, not derived at read time. Spec 10.5 says a
-- score is official only when it came from an ingested conversion table; if
-- that provenance were recomputed later it could silently change, so the
-- claim is frozen with the attempt that earned it.
create table if not exists sat_attempts (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid references sat_forms(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  score_authority  text check (score_authority in ('official','estimated')),
  score_lower      int,
  score_upper      int,
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz
);
create index if not exists sat_attempts_user_idx
  on sat_attempts (user_id, submitted_at desc);

-- ---------- per-module results ------------------------------------------------
-- One row per module sat. `routed_to` records which Module 2 the student was
-- actually given, so a score report can show the path taken.
create table if not exists sat_module_results (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid references sat_attempts(id) on delete cascade,
  section      text not null check (section in ('rw','math')),
  module       int  not null check (module in (1,2)),
  routed_to    text check (routed_to in ('lower','upper')),
  answers      jsonb not null default '{}'::jsonb,
  raw_correct  int  not null default 0,
  raw_total    int  not null default 0,
  submitted_at timestamptz not null default now()
);
create index if not exists sat_module_results_attempt_idx
  on sat_module_results (attempt_id);

-- ---------- RLS ---------------------------------------------------------------
alter table sat_questions      enable row level security;
alter table sat_forms          enable row level security;
alter table sat_attempts       enable row level security;
alter table sat_module_results enable row level security;

-- questions: real College Board items are portal-only and auth-gated, the same
-- copyright posture as the Cambridge past papers (spec 9). There is
-- deliberately NO public-read policy here, unlike el_questions.
drop policy if exists sat_q_portal_read on sat_questions;
create policy sat_q_portal_read on sat_questions for select to authenticated
  using (is_active);

drop policy if exists sat_q_staff_manage on sat_questions;
create policy sat_q_staff_manage on sat_questions for all to authenticated
  using (edu_is_staff()) with check (edu_is_staff());

-- forms: owner or staff may read; owner may create their own.
drop policy if exists sat_f_owner_read on sat_forms;
create policy sat_f_owner_read on sat_forms for select to authenticated
  using (created_by = auth.uid() or edu_is_staff());

drop policy if exists sat_f_owner_insert on sat_forms;
create policy sat_f_owner_insert on sat_forms for insert to authenticated
  with check (created_by = auth.uid());

-- attempts: owner or staff may read; owner may insert and update their own
-- (an attempt is updated on submit, unlike el_attempts which is insert-only).
drop policy if exists sat_a_owner_read on sat_attempts;
create policy sat_a_owner_read on sat_attempts for select to authenticated
  using (user_id = auth.uid() or edu_is_staff());

drop policy if exists sat_a_owner_write on sat_attempts;
create policy sat_a_owner_write on sat_attempts for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists sat_a_owner_update on sat_attempts;
create policy sat_a_owner_update on sat_attempts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- module results: reachable only through an attempt the user owns.
drop policy if exists sat_mr_owner_read on sat_module_results;
create policy sat_mr_owner_read on sat_module_results for select to authenticated
  using (exists (
    select 1 from sat_attempts a
    where a.id = attempt_id and (a.user_id = auth.uid() or edu_is_staff())
  ));

drop policy if exists sat_mr_owner_write on sat_module_results;
create policy sat_mr_owner_write on sat_module_results for insert to authenticated
  with check (exists (
    select 1 from sat_attempts a where a.id = attempt_id and a.user_id = auth.uid()
  ));

-- minimal grants (RLS still governs row visibility)
grant select on sat_questions, sat_forms, sat_attempts, sat_module_results to authenticated;
grant insert on sat_forms, sat_attempts, sat_module_results to authenticated;
grant update on sat_attempts to authenticated;
```

- [ ] **Step 3: Check it parses and is idempotent**

Apply it twice against the project — the second run must be a no-op, not an error. Use the Supabase SQL editor or CLI; **do not** apply to production without the user saying so.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/sat-001-sat-lab.sql
git commit -m "feat(sat): sat-001 migration with RLS mirroring el-001"
```

---

### Task 13: Course gating

**Files:**
- Modify: `src/lib/portal/course-access.ts`
- Modify: `src/app/api/exam-lab/asset/route.ts`
- Create: `scripts/test-sat-access.mjs`

**Interfaces:**
- Produces: `Course` gains `"SAT"`; `studentCourses(uid): Promise<Course[]>`; `COURSE_LABEL.SAT`.

**A deliberate behaviour change, flagged.** Today `studentCourse` returns exactly one course and `resolveCourseAccess` gives a student `allowed: [thatOne]`. An SAT student is frequently *also* a physics student, so collapsing to one course would lock them out of the platform they already pay for. This task widens `allowed` to every enrolled course while leaving `primary` on the existing precedence. For a single-course student nothing changes. For the rare student enrolled in both 9702 and 5054, `allowed` becomes both where it used to be 5054 only — more correct, and asserted in the new test so it is a decision on the record rather than a side effect.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-sat-access.mjs
import assert from "node:assert/strict";
import { courseFromYear, COURSE_LABEL } from "../src/lib/portal/course-access.ts";

// SAT classes are recognised by their year label, so enrolling a student in
// an SAT class is what grants access -- no new data model (spec 9).
assert.equal(courseFromYear("SAT"), "SAT");
assert.equal(courseFromYear("SAT Prep 2026"), "SAT");
assert.equal(courseFromYear("sat digital"), "SAT");

// The existing mappings must not regress.
assert.equal(courseFromYear("O Level"), "5054");
assert.equal(courseFromYear("A Level"), "9702");
assert.equal(courseFromYear("AS"), "9702");
assert.equal(courseFromYear("Year 1"), "9702");
assert.equal(courseFromYear("Nursery"), null);

// "Saturday" contains "sat" but names no course. Substring matching on a
// three-letter token is exactly how a class label gets mis-routed.
assert.equal(courseFromYear("Saturday Batch"), null);

assert.ok(COURSE_LABEL.SAT.length > 0);

console.log("sat-access tests passed");
```

- [ ] **Step 2: Run and watch it fail**

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-access.mjs
```

Expected: FAIL on the first SAT assertion (`courseFromYear("SAT")` returns `null`).

- [ ] **Step 3: Extend `course-access.ts`**

```ts
export type Course = "9702" | "5054" | "SAT";
```

In `courseFromYear`, add the SAT branch **before** the A-Level branch and match on a word boundary, so `Saturday Batch` does not become an SAT class:

```ts
  // Word-boundary match: a bare substring test would route "Saturday Batch"
  // to the SAT platform.
  if (/\bSAT\b/.test(y) || y.includes("DIGITAL SAT")) return "SAT";
```

Add the label:

```ts
export const COURSE_LABEL: Record<Course, string> = {
  "9702": "Cambridge A Level Physics · 9702",
  "5054": "Cambridge O Level Physics · 5054",
  "SAT": "Digital SAT",
};
```

Add `studentCourses` beside `studentCourse`, returning every enrolled course, and keep `studentCourse` as the precedence-based primary so nothing that calls it changes:

```ts
/** Every awarding-body course this student is enrolled into.
 *
 * An SAT student is very often also a physics student, so course access can
 * no longer collapse to one value without locking them out of a platform
 * they are enrolled in. `studentCourse` keeps returning the single primary
 * for callers that want one.
 */
export async function studentCourses(uid: string): Promise<Course[]> {
  // ...same lookup as studentCourse, but returns [...courses] unreduced,
  // still defaulting to ["9702"] when an enrolment names no course.
}
```

Then in `resolveCourseAccess`:

```ts
  if (isExamLabStaff(user.roles)) {
    return { allowed: ["9702", "5054", "SAT"], primary: "9702", locked: false, isStaff: true };
  }
  if (user.roles.includes("student")) {
    const courses = await studentCourses(user.id);
    const primary = await studentCourse(user.id);
    return { allowed: courses, primary, locked: courses.length <= 1, isStaff: false };
  }
```

- [ ] **Step 4: Gate the `sat/` asset prefix**

In `src/app/api/exam-lab/asset/route.ts`, extend `courseOf` — it currently maps everything that is not `o-level/` to `9702`, which would hand SAT images to any physics student:

```ts
  const courseOf = (p: string): Course => {
    if (p.startsWith("o-level/")) return "5054";
    if (p.startsWith("sat/")) return "SAT";
    return "9702";
  };
```

- [ ] **Step 5: Run every access test, not just the new one**

`test:access` covers the existing guardrail and must not regress:

```bash
node --no-warnings --experimental-strip-types scripts/test-sat-access.mjs
npm run test:access
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal/course-access.ts src/app/api/exam-lab/asset/route.ts scripts/test-sat-access.mjs package.json
git commit -m "feat(sat): SAT course gating and sat/ asset prefix"
```

---

## Self-Review

**Spec coverage.** Spec phase 2 (practice-test ingestion) is Tasks 1–6; phase 3 (core module) is Tasks 7–11; phase 4 (database and access) is Tasks 12–13. Phases 5–7 — portal SAT Lab, the public `/sat` vertical and integration — are deliberately out of scope and belong to plan 3. Integrity rules 1–6 each have a task and a test that fails when the rule is broken: rule 1 in Tasks 2 and 5, rule 2 in Task 8's `domainProportions` comment and the absence of invented labels on `SATTestQuestion`, rule 3 in the `cb_id unique` constraint, rule 4 in `check_test_complete`, rule 5 in `validate` and `scoreOfficial` returning null, rule 6 in `ROUTING_DISCLOSURE`.

**Known gap carried forward.** Spec section 4 promises drills "each with its official rationale", but Math rationales extract as gutted prose ("in this equation yields , or to both sides") because the text layer drops mathematics. Nothing here crops the rationale region. The anchors already locate it — plan 1's question crop stops exactly at `Correct Answer:`/`Rationale` — so this is a second crop pass, and it is **not in this plan**. Math drills must not claim to show an official rationale until it exists.

**Open question for the user, not a blocker.** `DIFFICULTY_WEIGHTS` and `UPPER_SHARE` are this module's calibration, not College Board values. They are disclosed rather than hidden, but the exact numbers are a judgement call worth a second opinion once real students sit a form.

**Risks.**
- **Task 4 is the risk in this plan, and it is unsolved.** Two anchor rules were designed and measured against the real corpus while writing this plan and both failed — the numbers are in the task. It is written as a derive-and-prove task with a hard acceptance gate (33/33/27/27 on all 8 tests) rather than a rule to implement, because handing over a third unverified rule would repeat the mistake. Budget real time for it, and expect test 11 to need separate handling.
- Tasks 5 and 6 depend on Task 4's anchors. Nothing downstream can be trusted until its acceptance gate is green.
- Task 13 changes `allowed` from one course to many. The existing `test:access` suite is the guard; run it.
- `bank.ts` imports `practice-tests.json`, which does not exist until Task 6 runs. Task 8 Step 4 says to commit a `{"tests": []}` placeholder so the module compiles before the ingest lands — the same "develop against a fixture until the full ingest arrives" approach spec section 11 describes.

**Execution note.** Per the agreed review policy in `docs/superpowers/SAT-HANDOFF.md`: review Tasks 2, 3, 4, 5 and 6 (data correctness, and anything touching the production bucket), and Tasks 11 and 13 (scoring maths, access control). Tasks 7, 8, 10 and 12 are type definitions, thin loaders and schema — skip review unless something looks wrong.
