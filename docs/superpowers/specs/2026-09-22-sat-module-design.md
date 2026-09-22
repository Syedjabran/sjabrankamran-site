# SAT Prep Module — Design Spec

Date: 2026-09-22
Branch: `design/revamp-2026`
Status: awaiting review

## 1. Goal

Add a thorough SAT preparation module to the platform, built to the same standard
as the existing Cambridge Physics provision: real official material, verified
metadata, exam-faithful sitting conditions, and no invented answers.

Scope confirmed with the site owner:

- **Both sections** — Reading and Writing, and Math.
- **Full adaptive replica** — module-adaptive mock exams with scaled scoring.
- **New `/sat` vertical** — its own public pages and its own portal track,
  not a third tab inside the physics Exam Lab.

## 2. Verified material inventory

All material is present on disk and has been inspected, not assumed.

### 2.1 Official practice tests

`scripts/exam-lab/ingest-sat/raw/practice-tests/` — 8 complete bundles,
practice tests 4 through 11. Each bundle contains three PDFs:

| file | role |
| --- | --- |
| `sat-practice-test-N-digital.pdf` | the test itself |
| `sat-practice-test-N-answers-digital.pdf` | answer key and explanations |
| `scoring-sat-practice-test-N-digital.pdf` | raw-to-scaled conversion tables |

Tests 1-3 are absent. The pipeline is manifest-driven, so they can be added
later without code changes.

### 2.2 Official question bank

`scripts/exam-lab/ingest-sat/raw/question-bank/` — two SAT Suite Question Bank
exports taken with "With correct answers and explanations":

| export | questions |
| --- | --- |
| Math | 1,925 |
| Reading and Writing | 1,845 |
| **Total** | **3,770** |

Distribution, counted from the exports:

| Math domain | n | R&W domain | n |
| --- | --- | --- | --- |
| Algebra | 616 | Information and Ideas | 555 |
| Advanced Math | 540 | Craft and Structure | 471 |
| Problem-Solving and Data Analysis | 421 | Standard English Conventions | 421 |
| Geometry and Trigonometry | 348 | Expression of Ideas | 398 |

Difficulty is near-evenly split in both sections (Math 685/631/609
Easy/Medium/Hard; R&W 611/625/609). Every domain and difficulty cell is
populated well beyond what form assembly requires.

Each exported item carries: `Question ID` (stable unique key), Assessment,
Test, Domain, Skill, Difficulty (College Board's own E/M/H rating),
`Correct Answer`, and a full official Rationale.

## 3. Findings that shape the design

These were discovered by inspecting the material and they override the
original assumption that one engine could serve everything.

### 3.1 The official paper tests are linear, not adaptive

Measured from the PDFs:

| Section | Module 1 | Module 2 | Paper total | Real digital SAT |
| --- | --- | --- | --- | --- |
| Reading and Writing | 33 | 33 | 66 | 54 (27+27) |
| Math | 27 | 27 | 54 | 44 (22+22) |

There is exactly one Module 2 per section. The paper form carries 120
questions against the digital form's 98 precisely because it cannot adapt.

Consequence: these papers cannot drive an adaptive engine. Slicing them into
invented "upper" and "lower" Module 2 variants would fabricate forms College
Board never published — the same class of error as inventing an answer key,
which this codebase already refuses to commit (see the 5054 specimen paper
exclusion in `scripts/exam-lab/ingest-5054/README.md`).

### 3.2 Official scoring yields a range, not a point score

The scoring guides map a section raw score to a **lower and an upper bound**
within 200-800, and instruct the student to add the bounds separately to get a
total score range. College Board does not claim point precision for a linear
form, and neither will this module.

### 3.3 Text extraction loses all mathematics

A Hard algebra item extracts as "In the given equation, and are constants"
— every symbol is dropped, because the mathematics lives in the page graphics.
Question images are therefore the primary record, exactly as in the 5054
pipeline. Extracted text is a secondary artifact for search and accessibility
only, never the thing a student sits.

### 3.4 Grid-in answers live in the rationale

81 Math items carry no `Correct Answer:` line. All are student-produced
response (SPR) questions; the answer is stated inside the rationale instead,
as "The correct answer is 2.6", or for fractions as "Note that 3/2 and 1.5
are examples of ways to enter a correct answer". Both forms are recoverable.
Anything still unrecoverable is flagged for manual review, never guessed.

## 4. Products

The material supports three distinct products. Keeping them separate is what
lets each one be honest about its own authority.

1. **Official Practice Tests** — practice tests 4-11 exactly as published,
   linear, 120 questions, scored through their own conversion tables to an
   official score range. Highest authority.
2. **Adaptive Mock Exams** — assembled from the question bank to the true
   digital blueprint, with genuine Module 2 routing. Scores are labelled
   *estimated*, because no published curve exists for an assembled form.
3. **Drills** — practice sets by domain, skill and difficulty, each with its
   official rationale.

## 5. Architecture

### 5.1 Why a parallel module, not an extended ELQuestion

`ELQuestion` in `src/lib/exam-lab/bank.ts` is physics-shaped: `paper` is
`"P1"|"P2"|"P4"`, `lvl` is `"LOT"|"HOT"`, plus Cambridge command words,
`marks`, and `scheme` as a list of marking points. SAT needs section, module,
domain, skill, E/M/H difficulty, SPR answers and scaled scoring. Extending the
physics types would make every SAT field optional noise in a working,
revenue-carrying code path.

A parallel `src/lib/sat/` module mirrors the proven exam-lab patterns while
sharing only genuinely generic infrastructure: asset serving, the exam guard,
the proctor camera and fullscreen handling. Physics types are not touched.

### 5.2 Data model

```ts
// src/lib/sat/types.ts
export type SATSection = "rw" | "math";
export type SATDifficulty = "E" | "M" | "H";

export type SATDomain =
  | "information-ideas" | "craft-structure"
  | "expression-ideas"  | "standard-english"
  | "algebra" | "advanced-math" | "psda" | "geometry-trig";

export type SATAnswer =
  | { kind: "mcq"; correct: 0 | 1 | 2 | 3 }
  | { kind: "spr"; accepted: string[] };   // "3/2", "1.5" both accepted

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
  source: "question-bank" | "practice-test";
};
```

Practice-test questions additionally carry `{ testNo, section, module, qnum }`.

### 5.3 File layout

| Layer | Path |
| --- | --- |
| Types and bank | `src/lib/sat/{types,bank,forms,scoring,adaptive}.ts` |
| Generated bank | `src/lib/sat/question-bank.json`, `practice-tests.json` |
| Public pages | `src/app/sat/page.tsx`, `src/app/sat/[slug]/page.tsx`, `src/app/sat/programs.ts` |
| Portal | `src/app/portal/(app)/sat-lab/` |
| Components | `src/components/sat/{sat-hub,sat-runner,spr-pad,score-report}.tsx` |
| API | `src/app/api/sat/{form,attempt,answer,submit,score}/route.ts` |
| Migration | `supabase/migrations/sat-001-sat-lab.sql` |
| Ingestion | `scripts/exam-lab/ingest-sat/` |

## 6. Ingestion pipeline

Mirrors `ingest-5054` in structure and in discipline.

| script | role |
| --- | --- |
| `manifest.json` | the source material, its refs, totals and durations |
| `crop_sat.py` | anchor detection and exact cropping |
| `parse_qbank.py` | splits question-bank exports on `Question ID:`, reads domain/skill/difficulty, recovers SPR answers |
| `parse_scoring.py` | reads raw-to-scaled conversion tables out of the scoring guides |
| `extract_sat.py` | orchestrates crop, answer resolution and upload; emits metadata rows |
| `build_sat_bank.py` | writes the generated JSON banks into `src/lib/sat/` |
| `reviewed.json` | hand-verified corrections; ships over any parsed value |

Binaries are resolved by **absolute path** to the conda poppler
(`~/miniconda3/Library/bin/`), never through PATH. A preflight check asserts
both `pdftotext` and `pdftoppm` report poppler and not Xpdf before a single
page is processed — the Xpdf build on this machine's PATH emits a different
`-bbox` XML layout and would yield crops that look almost right.

Installed and verified: poppler 25.07.0, Pillow 11.3.0, Python 3.13.

Images upload to the private Supabase `exam-assets` bucket under a **`sat/`
prefix**. The pipeline never reads, lists or writes outside that prefix, so
the existing 9702 and o-level assets cannot be affected.

## 7. Adaptive engine

A **form** is six question sets:

```
rw.m1, rw.m2.lower, rw.m2.upper, math.m1, math.m2.lower, math.m2.upper
```

Built to the real digital blueprint: R&W 27 questions per module at 32 minutes,
Math 22 per module at 35 minutes, with the 10-minute break between sections.
Module 1 is mixed difficulty; the lower and upper Module 2 forms are weighted
toward E/M and M/H respectively, drawn to each domain's published proportions.

Routing after Module 1 is on raw correct against a per-form threshold.
**College Board does not publish the real routing algorithm or its cut score**,
so this threshold is a documented, configurable approximation and is described
as such in the UI. It is not presented as the official algorithm.

Official practice tests bypass the engine entirely and run as published.

## 8. Scoring

| Product | Source | Presented as |
| --- | --- | --- |
| Official practice test | ingested conversion table for that test | official score **range**, 400-1600 |
| Adaptive mock | modelled curve | **estimated** score, clearly labelled |

A scaled score ships from an ingested official table wherever one exists. Where
none exists, the number is labelled an estimate rather than dressed up as
official. This follows the rule the 5054 pipeline already enforces, where a
paper is dropped outright if its extracted marks do not sum to the printed total.

## 9. Access, portal and database

- `Course` in `src/lib/portal/course-access.ts` gains `"SAT"`; class `year`
  labels containing `SAT` map to it, so enrolling a student into an SAT class
  is what grants and limits their access, with no new data model.
- `src/app/api/exam-lab/asset/route.ts` gates bucket reads by path prefix;
  `sat/` resolves to the SAT course.
- `supabase/migrations/sat-001-sat-lab.sql` adds `sat_questions`, `sat_forms`,
  `sat_attempts` and `sat_module_results`, with RLS mirroring `el-001`:
  owner-or-staff read, owner insert, staff manage.
- Real official items are **portal-only and auth-gated**, in a private bucket —
  the identical copyright posture the Cambridge past papers already use.

## 10. Integrity rules the code must enforce

1. Answers ship only from the official key, the official rationale, or
   `reviewed.json`. A question whose answer cannot be resolved is skipped.
2. Domain, skill and difficulty ship only as College Board labelled them.
3. Question IDs are unique; an item exported under two filters ingests once.
4. A practice test whose extracted question count does not match its printed
   module structure (33/33/27/27) is dropped as a parse failure, not shipped short.
5. A scaled score is called official only when it came from an ingested table.
6. The adaptive routing threshold is documented as an approximation everywhere
   it is surfaced.

## 11. Phases

| # | Phase | Output |
| --- | --- | --- |
| 1 | Ingestion — question bank | 3,770 items cropped, keyed, uploaded |
| 2 | Ingestion — practice tests | 8 tests plus conversion tables |
| 3 | Core module | types, bank loaders, scoring, adaptive assembly |
| 4 | Database and access | migration, course gating, asset prefix |
| 5 | Portal SAT Lab | runner, SPR pad, review, score report |
| 6 | Public `/sat` vertical | hub and programme pages, metadata, schema |
| 7 | Integration | study plan, drills, analytics, admin allocation |

Phases 1 and 2 are independent of 3-7 and can run in parallel with them; the
core module is developed against a small fixture set until the full ingest lands.

## 12. Risks and open questions

- **R&W has no physics precedent.** Roughly half the build, and the crop
  anchors differ from a numbered-question paper because passages and questions
  form a single visual unit. Highest-risk phase.
- **Ingest volume.** 3,770 question crops plus 8 full tests is a long upload;
  it needs to be resumable and idempotent, keyed on Question ID.
- **Paper-test timings** must be read off each paper's own front matter, not
  assumed from the digital blueprint — the rule `ingest-5054` already states.
- **Tests 1-3** are not in hand and may not be published in paper form.
- **Desmos calculator and reference sheet.** The real Math section provides
  both. Out of scope for this spec; flagged as a follow-up, since a student
  practising without them is not sitting a faithful Math module.
