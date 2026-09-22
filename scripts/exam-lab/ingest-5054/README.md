# Cambridge O Level 5054 Exam Lab ingestion

Turns Cambridge O Level Physics (5054) past-paper PDFs into the exact question
images and metadata the Exam Lab's "O Level · 5054" track serves. It is the
5054 counterpart of the 9702 pipeline and shares its approach: locate each
question with `pdftotext -bbox` anchors, rasterise the pages with `pdftoppm`,
crop the exact region between consecutive anchors (stitching across page
breaks), and upload the result to the private Supabase `exam-assets` bucket.

Everything 5054 lands under the **`o-level/` prefix** of that bucket. The
pipeline never reads, lists or writes anything outside that prefix, so the
existing 9702 assets cannot be affected.

## Files

| file | role |
| --- | --- |
| `papers.json` | the source papers, their refs, totals and durations. Add a session here; nothing else is session-specific. |
| `crop5054.py` | anchor detection and exact cropping, including the 5054-specific rotation/landscape/blank-page corrections (see its docstring). |
| `classify5054.py` | the 5054 topic vocabulary and a keyword classifier that *proposes* a topic/level for a new session. |
| `reviewed.json` | the topic and thinking level actually shipped for every question, checked by hand against the paper. The bank is built from this, never from the classifier. |
| `extract5054.py` | orchestrates crop + marks + answers + upload, emits metadata rows. |
| `build_image_bank_olevel.py` | writes `src/lib/exam-lab/image-bank-olevel.{json,ts}`. |

## Run

```bash
cd scripts/exam-lab/ingest-5054

# 1. crop and classify without uploading; --save-dir lets you eyeball the crops
python3 extract5054.py --dry-run --save-dir /tmp/qa5054 --out /tmp/rows.json

# 2. see where the classifier disagrees with reviewed.json
python3 extract5054.py --review

# 3. upload and emit metadata (needs the Supabase service-role key)
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
python3 extract5054.py --out /tmp/rows.json

# 4. regenerate the TypeScript bank
python3 build_image_bank_olevel.py /tmp/rows.json
```

Requires `poppler-utils` (`pdftotext`, `pdftoppm`) and Pillow.

## Integrity rules the code enforces

* **Marks** come from the question paper's own printed `[n]` brackets, and a
  paper is dropped entirely if the extracted per-question marks do not sum to
  the total the paper prints on its front page.
* **Multiple-choice answers** come only from the published mark scheme. A
  question with no mark-scheme row is skipped, and
  `build_image_bank_olevel.py` refuses to build if any shipped MCQ row lacks an
  A–D answer.
* **Topics and levels** ship only from `reviewed.json`. A question with no
  reviewed entry is skipped rather than guessed.
* A paper whose extracted question count falls outside the plausible range for
  its type is dropped as a parse failure rather than shipped short.

## Adding a session

1. Drop the QP and MS PDFs next to the others in `raw_dir`.
2. Add an entry to `papers.json` (read the totals and duration off the paper —
   do not assume they match another series).
3. `python3 extract5054.py --dry-run --save-dir /tmp/qa --review`, then read
   every question and add its verified topic/level to `reviewed.json`, using the
   printed proposals as a starting point.
4. Upload, rebuild the bank, and run `npx tsc --noEmit && npm run build`.

## Known exclusion

`5054_sp23_qp_1.pdf` (2023 specimen Paper 1) is configured with
`"include": false`. Cambridge publishes no mark scheme for the specimen
multiple-choice paper, so there is no verified answer key for its 40 questions
and it cannot be shipped without inventing answers.
