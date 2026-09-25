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

This README covers the question-bank half of the pipeline (`raw/question-bank/`).
The 8 official practice tests (`raw/practice-tests/`) go through
`extract_tests.py` / `crop_tests.py` / `build_sat_tests.py`, which reuse the
same poppler, upload and provenance machinery; their module docstrings are
their documentation.

**Status (2026-09-25):** the question-bank upload (3,731 question crops)
and the practice-test upload both ran **live** on 2026-09-25, into the
production `exam-assets` bucket under the `sat/` prefix, and the committed
`src/lib/sat/question-bank.json` is built from that live run. The
**rationale upload is pending the owner's go-ahead**: it is step 3 below run
again, which now skips every question already in `uploaded.json` and
uploads only the rationale crops. Until it runs, the bank carries no
`rationaleImg` and drills show the text rationale.

## Files

| file | role |
| --- | --- |
| `poppler.py` | resolves `pdftotext`/`pdftoppm`/`pdfinfo` to an absolute path and preflights that the binary is actually poppler, not the Xpdf build also on PATH. |
| `parse_qbank.py` | parses the exported text into verified records: id, section, domain, skill, difficulty, answer, rationale. Rejects anything it can't verify rather than guessing. |
| `report_qbank.py` | runs the parser over both raw PDFs and prints a coverage report (counts by domain/difficulty/answer kind/source, every rejected id and why). Run this first. |
| `crop_qbank.py` | locates each question's crop region in `-bbox` coordinate space (below the full metadata header *table*, above the answer/rationale) and rasterises + crops it. The lower bound is the body's `Question` label, not the header's lowest text row: the difficulty rating is also drawn as a textless vector bar glyph, which has no word box to crop below. |
| `crop_rationale.py` | locates each item's official rationale (below its `Rationale` label, above the next record's header, stitched across a page break) and renders it as an image. The text layer drops every math symbol, so the rationale ships as a picture, like the question. |
| `upload.py` | names each crop's bucket key and uploads it to the `exam-assets` bucket, prefix-guarded to `sat/`. A rationale's key is a hash of its bytes, never its question id (see "Integrity rules"). |
| `extract_sat.py` | orchestrates parse + crop + upload for the whole corpus, resumable, and emits `rows.json` / `skipped.json` / `uploaded.json` / `mode.json`, plus `uploaded-rationales.json` / `skipped-rationales.json` for the rationale crops (and `out/crops/rationale-crops.json`, the key of each rationale crop on disk). |
| `build_sat_bank.py` | the last gate: re-validates every row against a hard-coded closed vocabulary (independent of `parse_qbank`'s), refuses rows it can't confirm were actually uploaded, and writes `src/lib/sat/question-bank.json`. A row's `rationaleImg` ships only if `uploaded-rationales.json` records that exact key as uploaded for its id; otherwise the row ships with the text rationale. |
| `tests/` | 272 tests covering all of the above (and the practice-test pipeline), all network calls mocked. |

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
that does. See "Status" above for which live uploads have run.

A full run over the current corpus produces **3,731 rows, 39 skipped** out
of 3,770 source questions (1,925 Math, 1,845 Reading and Writing). Skips
break down as 36 cross-page, 2 answer-source-conflict, 1 no-answer -- see
"Integrity rules" below for what each means. Every one of the 3,731 rows
also carries a rationale crop (`skipped-rationales.json` is empty).

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
  official rationale text** -- plus, for the practice tests only,
  `reviewed.json`'s hand-verified `answer_overrides`, which ship over the
  parse and each cite the render they were checked against (its
  `conversion_exceptions` excuse one scoring-table sanity check for the
  exact printed cells they name and never change a value). The question
  bank has no overrides. An item with no answer is rejected as
  `no-answer`, never guessed. When the `Correct Answer:` line and the
  rationale's "Choice X is correct" **disagree**, the item is rejected as
  `answer-source-conflict` rather than trusting either -- College Board's
  own export is internally inconsistent for 2 items in the current corpus
  (`bf5f80c6`, `1e11190a`); that is a recorded fact about the source
  data, not a parser bug to chase.
* **A grid-in answer line can list several forms** (".1764, .1765, 3/17",
  91 rows): all of them ship, split on commas (with or without a space)
  and "and"/"or". A comma followed by exactly three digits is a thousands
  separator ("3,540" is 3540). Every form must be a plain entry --
  integer, decimal or fraction, optionally negative, an en dash or U+2212
  read as the minus -- or the line is rejected as `unreadable-answer-line`.
* **Grid-in prose fails closed.** With no answer line, a block carrying
  the entry note ("Note that 3/2 and 1.5 are examples of ways to enter a
  correct answer") resolves from that note or not at all: the note is read
  across line breaks and past the stacked-fraction digits pdftotext drops
  between its lines, its forms must agree numerically (a decimal within
  one unit of its last place of a fraction), several distinct values are
  accepted only when the rationale says "either" or states several, and a
  stated value must match one of the note's forms (or be the text layer's
  numerator/denominator rendering of its fraction). Anything else is
  `unreadable-entry-note` or `answer-source-conflict` -- never the stated
  fallback, which for a stacked fraction is only its numerator.
* **Every shipped answer carries a `source` field** recording which path
  resolved it: `answer-line` (the normal case, 3,651 of 3,731 rows),
  `rationale` ("Choice X is correct" stated in the MCQ rationale with no
  answer line, 11 rows), `entry-note` (the note above, 18 rows),
  `rationale-either` ("The correct answer is either 8 or 9", 1 row) or
  `rationale-stated` (a grid-in value read off "The correct answer is
  ...", 50 rows). The last four -- 80 rows total -- have no official
  answer line to cross-check, so this field is what makes them auditable.
  To list them: `python -c "import json; rows =
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
* **Rationale crops never show part of the next question.** Every record
  in both exports opens its own page, so a rationale runs from just below
  its `Rationale` label to the page bottom and, for 182 records, onto one
  more page. The region stops above the next record's `Question ID:` row,
  is refused if its text holds another header, answer line or header
  table, and any cut that isn't a page edge must fall on blank paper. The
  blank remainder of each page is trimmed in the raster, not from the text
  layer, because the math and figures have no word boxes. A rationale that
  fails any of this ships as text only and is listed, with its reason, in
  `skipped-rationales.json`.
* **A rationale's key can't be derived from its question id.** The
  rationale gives the answer away; the browser holds the question's own
  key (`sat/<section>/<id>.jpg`) while the student is still answering; and
  `/api/exam-lab/asset` signs any `sat/` path for an enrolled student. So a
  rationale is stored under a hash of its own bytes,
  `sat/<section>/r/<first 20 hex digits of sha256>.jpg`, mirrored locally at
  `out/crops/<section>/r/...` (where the dev-only local-image route looks),
  and the only way to learn it is the server-only bank, which hands it out
  after the student has answered. No secret is involved. `build_sat_bank.py`
  refuses any `rationale_img` that isn't that shape. Rationale uploads are
  recorded per id *with their key* in `uploaded-rationales.json`, apart
  from `uploaded.json`, so a question uploaded before rationales existed
  still gets its rationale.
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
* **A re-rendered rationale whose bytes differ is a new object.** Keys are
  content hashes, so a rationale crop never goes stale in the bucket the way
  a question crop can (above): if a code change makes a re-render come out
  different, it gets a new key, is uploaded under it, and replaces the old
  key in `uploaded-rationales.json` and the bank. The old object stays in
  the bucket, orphaned -- nothing points at it, but it still uses storage.
  To clean up, delete the `sat/*/r/` objects whose keys no longer appear in
  `uploaded-rationales.json`. An unchanged re-render is byte-identical
  (pdftoppm and Pillow's encoder are deterministic), so it keeps its key
  and is not re-uploaded. To force a re-render, delete
  `out/crops/rationale-crops.json`.
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
