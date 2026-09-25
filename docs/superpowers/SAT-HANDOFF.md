# SAT Module — Handoff / Resume Point

Originally paused 2026-09-22 on branch `design/revamp-2026`. Updated 2026-09-26: the
module is now built end-to-end on branch `feat/sat-module`, live assets are uploaded, and
the owner's own testing guide exists — see the top of this file's "Status" section below
before reading the rest, which is kept as the historical record of how the pipeline was
built and verified.

Read this first, then the spec. Everything below was established by inspecting the real
College Board material, not assumed.

## Documents

| What | Where |
| --- | --- |
| **Owner's testing guide (read this to test the module)** | `docs/SAT-TESTING.md` |
| Design spec (the authority) | `docs/superpowers/specs/2026-09-22-sat-module-design.md` |
| Plan 1 — question-bank ingestion (executed) | `docs/superpowers/plans/2026-09-22-sat-ingestion-pipeline.md` |
| Plan 2 — practice tests + TypeScript core (executed) | `docs/superpowers/plans/2026-09-23-sat-practice-tests-and-core.md` |
| Plan 3 — SAT Lab surfaces (executed) | `docs/superpowers/plans/2026-09-25-sat-lab-surfaces.md` |
| Execution ledger, every ruling | `.superpowers/sdd/2026-09-22-sat-ingestion-pipeline/progress.md` (gitignored, local) |
| Pipeline README | `scripts/exam-lab/ingest-sat/README.md` |

The ledger is the detailed record: every decision, every finding, every ruling with its cost
if wrong. It is local and gitignored — read it before re-litigating anything.

## Status

**Plan 1 — question-bank ingestion: complete and verified.** 23 commits through `6bdf729`.
**Plan 2 — practice tests + TypeScript core: executed.** **Plan 3 — SAT Lab surfaces:
executed.** The whole module is built on branch `feat/sat-module`; nothing is pushed or
merged yet.

**The live upload blocker is resolved.** On 2026-09-25 the owner signed off the sample
crops and the live upload ran: the question-bank crops (3,731) and the 8 official practice
tests (Tests 4–11, 960 crops) are uploaded to the production Supabase bucket
`exam-assets`, under the `sat/` prefix. `src/lib/sat/question-bank.json` and
`src/lib/sat/practice-tests.json` are built from that live data, not a dry run. The
worked-answer (rationale) images are being prepared and uploaded now as compressed PNGs.
Production storage under `sat/` is roughly 1.55 GB — over the Supabase Free plan's 1 GB
limit, so the owner needs to check their plan (see `docs/SAT-TESTING.md` §6).

### The crop sign-off found a real defect — fixed 2026-09-23, `ebf6d68`

Read this before trusting any earlier statement that the crops were clean.

College Board prints the difficulty **twice**: as the word `Easy`/`Medium`/`Hard`, and as a
vector bar glyph (one, two or three filled bars) in the header table's last cell. The glyph
carries no text, so it has no `-bbox` word box, so `_header_bottom` — which reasons entirely
over text rows — could never see it. Cropping below the header's lowest *text* row left the
glyph's bottom sliver inside the question image.

Measured over the rendered corpus: **1,788 of 3,730 crops (47.9%) leaked the rating**, and the
leak was a *perfect* classifier — 580 items showed one bar and all 580 were Easy, 642 showed
two and all were Medium, 561 showed three and all were Hard. Not one ambiguous case. The clean
52.1% were exactly the column-wrapped-header items, whose wrapped tail happens to sit below the
glyph; that is luck, not a rule, and it is why the four crops inspected by hand in the previous
session all looked fine.

The fix anchors the crop on the body's `Question` section label — the first element below the
whole table, glyph included, present on all 3,730 questions — rather than on a bigger pad.
`GLYPH_DEPTH` is a measured backstop that does not bind in this corpus. All 3,730 crops were
re-rendered and re-scanned: **zero leaks, with no qualifying ink at all**, not merely under
threshold.

The lesson for plans 2 and 3: **a text-layer anchor cannot see a vector glyph.** The practice
tests will have their own graphics. Verify crops by scanning the rendered images, not by
reasoning about the text layer.

### The final fix wave is verified — checked 2026-09-23

`4d5832a` was a mid-flight snapshot the controller committed so the work would survive the
session ending; *which* findings it had actually landed was unconfirmed. Every one was
checked against the code on 2026-09-23. All are done:

| | Finding | How it is fixed, and how that was confirmed |
| --- | --- | --- |
| **C1** | `build_sat_bank.py` could not tell a dry-run `rows.json` from a live one | `check_provenance()` reads a `mode.json` sidecar (absent = treated as dry-run, not trusted) and cross-checks every row id against `uploaded.json`, so a partial live run builds a smaller valid bank instead of failing. Exercised against the real corpus: refused by default, and under `--allow-dry-run` all 3,730 rows pass the gate. 7 tests. |
| I1 | `urlopen()` had no `timeout=` | `upload.REQUEST_TIMEOUT = 60`, passed at the call site; the retry handler's `TimeoutError` arm is live code again. |
| I2 | The live upload branch had zero test coverage | 5 live-run tests: credentials checked before the first crop, upload → record → append-row ordering, no row appended without a successful upload, canonical key stored, and `mode.json` written for both dry and live runs. |
| I3 | `REQUIRED` listed 9 fields; spec §5.2 has 10 | `rationale` added; missing and empty are both rejected. |
| I4 | Dedupe was per-export, not per-corpus | `corpus_seen` in `extract_sat.main`, skipped as `duplicate-across-exports` *before* anything uploads. The real corpus turns out to have no overlap — 0 such skips — so the row count is unchanged. |
| I5 | Difficulty picked positionally in one place, by vocabulary order in another | Both sides now read the exact index `_header_region` anchored the header boundary on. |

The three cheap ones are done as well: `_upload_with_retry`'s canonical return value is what
lands in the row's `img`, `preflight_credentials()` runs beside `poppler.preflight()` before
any crop is rendered, and `report_qbank.text_of` decodes strict UTF-8 like `crop_qbank`
always did.

**106 tests pass.** The pipeline yields 3,731 rows / 39 skipped.

```
3,770 questions in the exports
3,731 verified, cropped, ready      39 skipped (36 cross-page, 2 answer-source-conflict, 1 no-answer)
```

`364a2d25` was recovered on 2026-09-23 — its answer is phrased "The correct answer is
either 8 or 9", which the parser could not read (`1534bc4`). The same commit corrected
`c362c210`, which accepted only `1.5` where College Board also prints `3/2`. The single
remaining `no-answer`, `fb58c0db`, is genuinely unrecoverable: its answer is a
mathematical expression the text layer drops.

## THE TWO THINGS THAT WERE BLOCKING PROGRESS — both resolved 2026-09-25

1. **Sign-off on the sample crops.** 12 re-rendered at
   `scripts/exam-lab/ingest-sat/out/samples/`, spanning both sections, all three difficulties
   and both answer kinds. All 12 were inspected on 2026-09-23 and are clean — no difficulty
   glyph, no domain/skill, no answer key, figures and data tables intact — and an automated
   scan of all 3,730 crops agrees. **The owner signed off on 2026-09-25.**
2. **Supabase credentials.** The live upload has run, with the owner's authorisation, against
   the production `exam-assets` bucket: the question-bank crops (3,731) and the 8 official
   practice tests (960 crops) are uploaded under the `sat/` prefix. The worked-answer
   (rationale) images are being uploaded now.

What's left is no longer a pipeline question — see `docs/SAT-TESTING.md` §6 for the
remaining pre-launch checklist (storage plan, the unapplied `sat-001` migration, QA test
account cleanup, and rotating the service-role key used for the upload).

## What plan 1 built

`scripts/exam-lab/ingest-sat/` — `poppler.py`, `parse_qbank.py`, `report_qbank.py`,
`crop_qbank.py`, `upload.py`, `extract_sat.py`, `build_sat_bank.py`, `tests/`.

Run order (only the last needs credentials):

```bash
python scripts/exam-lab/ingest-sat/report_qbank.py          # parse + coverage report
python scripts/exam-lab/ingest-sat/extract_sat.py --dry-run # crop everything, no upload
python scripts/exam-lab/ingest-sat/extract_sat.py           # LIVE — needs authorisation
python scripts/exam-lab/ingest-sat/build_sat_bank.py out/rows.json
```

Use `python`, not `python3` — `python3` is shadowed by a Windows Store alias that prints an
install prompt and exits 0 with no output, so commands appear to succeed while doing nothing.
The sibling `ingest-5054/README.md` still has this bug.

Cold run ~15m20s, warm rerun ~40s (crops cached, resumable).

## Carry forward into plan 2 — real work, not nits

1. **Math rationales are unusable as text.** The spec promises drills "each with its official
   rationale", but extraction yields gutted prose: *"in this equation yields , or to both
   sides"*. Same cause as the questions — the text layer drops mathematics. Nothing crops the
   rationale region yet. Plan 2 needs a second crop pass; the anchors already locate the region
   (the question crop stops exactly at `Correct Answer:` / `Rationale`).
2. **Directory casing.** Spec §6 says `ingest-sat/` and `crop_sat.py`; delivered as
   `ingest-sat/` and `crop_qbank.py`. A lowercase rename was blocked by a stale Windows file
   handle and deferred. **This would break on case-sensitive CI.** Retry the rename when
   nothing holds the directory.
3. **`tests/test_poppler.py` is not hermetic** — two tests need a real conda poppler at
   `POPPLER_BIN` and would fail on a CI box without it.
4. **36 cross-page questions are skipped, not stitched.** `ingest-5054/crop5054.py` has prior
   art for stitching across page breaks if these are worth recovering.
5. **11 answers rest on rationale prose alone.** Every answer carries a `source` field
   (`answer-line` / `rationale` / `entry-note` / `rationale-stated`) so they are auditable.

## Operational trap worth remembering

`uploaded.json` follows `--out` while crops live at a fixed `out/crops`. Clearing crops without
clearing `uploaded.json` re-renders the crop but **skips the upload**, leaving a stale image in
the bucket. The code warns at runtime; do not ignore it.

## Next steps, in order

Plans 1–3 are done and the live upload has run. What's left is not implementation work:

1. The owner tests the module by hand and with the automated checks — follow
   `docs/SAT-TESTING.md` end to end.
2. The owner decides whether to merge `feat/sat-module` into `main`. Nothing is pushed yet.
3. Check the Supabase project's storage plan against the roughly 1.55 GB now used under
   `sat/` (over the Free plan's 1 GB) and upgrade if needed.
4. Apply the `supabase/migrations/sat-001-sat-lab.sql` migration when the owner is ready to
   move sittings out of the `portal-data` storage bucket and into real tables — `store.ts`
   is the single file that switches over (see the "Deferred, with reasons" note in
   `docs/superpowers/plans/2026-09-25-sat-lab-surfaces.md`).
5. After testing, delete the QA test accounts (`qa-student-sat@example.com`,
   `qa-teacher@example.com`) and their classes (`qa-sat`, `qa-a1-physics` in "QA Test
   School"), then rotate the Supabase service-role key used for the live upload.

## Process note

Reviews were run per-task via the subagent-driven skill. The user pushed back on the volume,
correctly: reviews on Tasks 3, 4 and the final whole-branch review caught defects that would
have shipped a broken bank; Tasks 2 and 5 found nothing. **Agreed approach going forward:
review only where a bug would be silent or expensive** — data correctness, anything touching
the production bucket or database, and the adaptive scoring maths. Skip review for UI wiring,
type definitions and documentation.
