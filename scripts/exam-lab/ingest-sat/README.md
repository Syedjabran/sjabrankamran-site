# SAT Question Bank ingestion

Turns College Board's SAT Suite Question Bank PDF exports into the exact
question images and metadata the Exam Lab's SAT track serves. It is the SAT
counterpart of the 5054 and 9702 pipelines and shares their overall shape --
locate each question with `pdftotext -bbox` anchors, rasterise the page with
`pdftoppm`, crop the exact region, and upload the result to the private
Supabase `exam-assets` bucket -- but the anchor problem is different: the
question bank's PDF header is a flattened Domain/Skill/Difficulty table
whose wrapped rows interleave in reading order, so cropping and text parsing
each solve that problem independently (geometrically in `crop_qbank.py`,
textually in `parse_qbank.py`) rather than sharing one heuristic.

Everything SAT lands under the **`sat/` prefix** of that bucket, structurally
enforced by `upload.py`'s `guard_prefix`. The pipeline can never touch the
existing 9702 or `o-level/` assets.

This README covers the question-bank half of the pipeline only (`raw/question-bank/`).
Practice-test ingestion (`raw/practice-tests/`) is a separate, not-yet-built
plan; the directory exists but nothing here reads it.

## Files

| file | role |
| --- | --- |
| `poppler.py` | resolves `pdftotext`/`pdftoppm`/`pdfinfo` to an absolute path and preflights that the binary is actually poppler, not the Xpdf build also on PATH. |
| `parse_qbank.py` | parses the exported text into verified records: id, section, domain, skill, difficulty, answer, rationale. Rejects anything it can't verify rather than guessing. |
| `report_qbank.py` | runs the parser over both raw PDFs and prints a coverage report (counts by domain/difficulty/answer kind/source, every rejected id and why). Run this first. |
| `crop_qbank.py` | locates each question's crop region in `-bbox` coordinate space (below the full metadata header *table*, above the answer/rationale) and rasterises + crops it. The lower bound is the body's `Question` label, not the header's lowest text row: the difficulty rating is also drawn as a textless vector bar glyph, which has no word box to crop below. |
| `upload.py` | uploads one crop to the `exam-assets` bucket, prefix-guarded to `sat/`. |
| `extract_sat.py` | orchestrates parse + crop + upload for the whole corpus, resumable, and emits `rows.json` / `skipped.json` / `uploaded.json` / `mode.json`. |
| `build_sat_bank.py` | the last gate: re-validates every row against a hard-coded closed vocabulary (independent of `parse_qbank`'s), refuses rows it can't confirm were actually uploaded, and writes `src/lib/sat/question-bank.json`. |
| `tests/` | 106 tests covering all of the above, all network calls mocked. |

## Run

```bash
cd scripts/exam-lab/ingest-sat

# 1. parse both PDFs and see coverage -- no crop, no network, no credentials
python report_qbank.py

# 2. crop and emit rows without uploading; --limit for a quick check,
#    omit it for the full corpus (~13m25s cold, ~24-32s on a warm rerun
#    since crops and uploaded ids are cached -- see "Known gaps" below)
python extract_sat.py --dry-run --limit 20 --out /tmp/rows.json

# 3. crop, upload, and emit rows for real (needs the Supabase service-role key)
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
python extract_sat.py --out out/rows.json

# 4. validate and write the site's question bank
python build_sat_bank.py out/rows.json
```

(Use whichever of `python`/`python3` actually resolves to a real Python 3 on
your machine -- on Windows, a `python3` shadowed by the Microsoft Store's
App Execution Alias will silently no-op instead of running anything.)

Requires `poppler-utils` (`pdftotext`, `pdftoppm`) and Pillow. Steps 1 and 2
run with no credentials and make no network request; step 3 is the only one
that does. **The live upload (step 3) has not yet been run** and is pending
authorisation -- everything shipped so far is from `--dry-run` passes.

A full `--dry-run` cold run over the current corpus produces **3,730 rows,
40 skipped** out of 3,770 source questions (1,925 Math, 1,845 Reading and
Writing). Skips break down as 36 cross-page, 2 answer-source-conflict, 2
no-answer -- see "Integrity rules" below for what each means.

## Integrity rules the code enforces

* **Poppler is resolved by absolute path and preflighted**, not found via
  `PATH`. An Xpdf 4.00 build on this machine's `PATH` also answers to
  `pdftotext`, but emits a different `-bbox` XML layout that would produce
  crops looking almost right -- wrong in a way that is hard to notice by
  eye. `poppler.preflight()` checks the tool's own version banner and
  refuses to run against anything that doesn't identify as poppler; it
  keys on "Poppler Developers" rather than the absence of "Xpdf", because
  poppler's own banner still contains "Glyph & Cog" (it forked from Xpdf).
* **Answers ship only from the official `Correct Answer:` line or the
  official rationale text.** There is no `reviewed.json` for this
  pipeline -- unlike 5054, College Board's own export carries the answer,
  so nothing here is hand-verified against a separate key. An item with
  neither is rejected as `no-answer`, never guessed. When the `Correct
  Answer:` line and the rationale's "Choice X is correct" **disagree**,
  the item is rejected as `answer-source-conflict` rather than trusting
  either -- College Board's own export is internally inconsistent for 2
  items in the current corpus (`bf5f80c6`, `1e11190a`); that is a
  recorded fact about the source data, not a parser bug to chase.
* **Every shipped answer carries a `source` field** recording which of
  four paths resolved it: `answer-line` (the normal case, 3,651 of 3,730
  rows), `rationale` ("Choice X is correct" stated in the MCQ rationale
  with no answer line, 11 rows), `entry-note` (a grid-in's accepted
  values read off "Note that ... are examples of ways to enter a correct
  answer", 16 rows), or `rationale-stated` (a grid-in value read off "The
  correct answer is ...", 52 rows). The last three -- 79 rows total --
  have no official answer line to cross-check, so this field is what
  makes them auditable. To list them: `python -c "import json; rows =
  json.load(open('out/rows.json')); print([r['id'] for r in rows if
  r['answer']['source'] != 'answer-line'])"`.
* **Domain, skill and difficulty ship only as College Board labelled
  them.** Domain is an 8-value closed vocabulary and skill a 30-value one
  (neither is guessed or inferred); when a wrapped header bleeds body text
  into the skill fragment, the skill is recovered by longest-prefix match
  against the known vocabulary, never accepted as free text.
* **Question crops deliberately exclude the metadata header**, so a
  student is never shown the difficulty rating, domain, or skill on the
  question they're answering. About 52% of items have a header that wraps
  onto a second line, so the crop can't just anchor on the difficulty
  token's own bottom edge -- it extends through any table row that
  continues tightly below it and stops at the first looser gap, which
  marks the real start of the question body.
* **All bucket writes are confined to the `sat/` prefix**, checked by
  `upload.py`'s `guard_prefix` before any network call. The existing 9702
  and `o-level/` assets cannot be reached by this pipeline, by
  construction rather than by convention.
* **`build_sat_bank.py` re-validates every row against its own hard-coded
  closed vocabularies**, deliberately not imported from `parse_qbank.py`.
  That keeps it a real second check: a typo in the parser's own constants
  would otherwise pass both sides of the gate silently.

## Known gaps and operational gotchas

* **`uploaded.json` and the crop cache can desync.** Crops render to a
  fixed path (`out/crops`) while `uploaded.json` follows wherever `--out`
  points. If `out/crops` is cleared without also clearing `uploaded.json`
  (or vice versa), a rerun re-renders the crop -- because it's missing on
  disk -- but skips the upload -- because the id is still marked uploaded
  -- leaving a stale image in the bucket. `extract_sat.py` warns loudly to
  stderr the moment this happens. If you see that warning, remove the
  affected id from `uploaded.json` to force a re-upload; don't ignore it.
* **Cross-page questions are not yet stitched.** 36 questions have their
  answer/rationale anchor on the following PDF page and are skipped with a
  `cross-page` reason rather than cropped wrong. `ingest-5054/crop5054.py`
  already implements page-stitching if this is picked up later.
* **Upload retries** back off 1s/2s/4s/8s over up to 5 attempts on
  HTTP 429, 5xx, or a connection/timeout error, and fail immediately on
  any other 4xx (bad credentials retrying cannot succeed). Worst case adds
  roughly 15s per question if the endpoint is fully down for a sustained
  period.
* Raw material (`raw/`) is gitignored -- it's copyrighted and 366MB. So
  are `out/` (cached extractions, crops, and the resumability bookkeeping)
  and `__pycache__/`. Never commit any of them.

## Adding new material

1. Export a fresh "With correct answers and explanations" PDF from the SAT
   Suite Question Bank and drop it in `raw/question-bank/`.
2. `python report_qbank.py` to see parse coverage and every rejected id
   before spending time on crops.
3. `python extract_sat.py --dry-run --limit 20 --out /tmp/rows.json` to
   sanity-check crops on a handful of questions, then a full `--dry-run`
   pass to see the real skip histogram.
4. Once satisfied, run the live upload (step 3 above) and
   `python build_sat_bank.py out/rows.json` to ship.
