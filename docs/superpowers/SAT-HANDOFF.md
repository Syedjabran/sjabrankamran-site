# SAT Module — Handoff / Resume Point

Paused 2026-09-22. Branch `design/revamp-2026`.

Read this first, then the spec. Everything below was established by inspecting the real
College Board material, not assumed.

## Documents

| What | Where |
| --- | --- |
| Design spec (the authority) | `docs/superpowers/specs/2026-09-22-sat-module-design.md` |
| Plan 1 — ingestion (executed) | `docs/superpowers/plans/2026-09-22-sat-ingestion-pipeline.md` |
| Execution ledger, every ruling | `.superpowers/sdd/2026-09-22-sat-ingestion-pipeline/progress.md` (gitignored, local) |
| Pipeline README | `scripts/exam-lab/ingest-SAT/README.md` |

The ledger is the detailed record: every decision, every finding, every ruling with its cost
if wrong. It is local and gitignored — read it before re-litigating anything.

## Status

**Plan 1 — question-bank ingestion: complete and verified.** 19 commits through `4d5832a`.
**Plans 2 and 3: not written.**

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

**98 tests pass.** A warm dry-run rerun on the current code reproduces `rows.json` and
`skipped.json` byte-identically (39s).

```
3,770 questions in the exports
3,730 verified, cropped, ready      40 skipped (36 cross-page, 2 answer-source-conflict, 2 no-answer)
```

## THE TWO THINGS BLOCKING PROGRESS — both need the user

1. **Sign-off on the sample crops.** 12 rendered at `scripts/exam-lab/ingest-SAT/out/samples/`.
   Four were inspected and are clean: `121dc44f`, `13f67ddc`, `6d99b141`, `ca50de52`. The user
   has not yet looked.
2. **Supabase credentials.** The live upload has **never run**. It needs `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` plus the user's explicit authorisation to write to their
   production `exam-assets` bucket. Do not go looking for these; ask.

Until then: `--dry-run` only. Never write to that bucket without being told to.

## What plan 1 built

`scripts/exam-lab/ingest-SAT/` — `poppler.py`, `parse_qbank.py`, `report_qbank.py`,
`crop_qbank.py`, `upload.py`, `extract_sat.py`, `build_sat_bank.py`, `tests/`.

Run order (only the last needs credentials):

```bash
python scripts/exam-lab/ingest-SAT/report_qbank.py          # parse + coverage report
python scripts/exam-lab/ingest-SAT/extract_sat.py --dry-run # crop everything, no upload
python scripts/exam-lab/ingest-SAT/extract_sat.py           # LIVE — needs authorisation
python scripts/exam-lab/ingest-SAT/build_sat_bank.py out/rows.json
```

Use `python`, not `python3` — `python3` is shadowed by a Windows Store alias that prints an
install prompt and exits 0 with no output, so commands appear to succeed while doing nothing.
The sibling `ingest-5054/README.md` still has this bug.

Cold run ~13m25s, warm rerun ~25s (crops cached, resumable).

## Carry forward into plan 2 — real work, not nits

1. **Math rationales are unusable as text.** The spec promises drills "each with its official
   rationale", but extraction yields gutted prose: *"in this equation yields , or to both
   sides"*. Same cause as the questions — the text layer drops mathematics. Nothing crops the
   rationale region yet. Plan 2 needs a second crop pass; the anchors already locate the region
   (the question crop stops exactly at `Correct Answer:` / `Rationale`).
2. **Directory casing.** Spec §6 says `ingest-sat/` and `crop_sat.py`; delivered as
   `ingest-SAT/` and `crop_qbank.py`. A lowercase rename was blocked by a stale Windows file
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

1. Get the user's crop sign-off and credentials; run the live upload; build the real
   `src/lib/sat/question-bank.json`.
2. Write plan 2 — practice-test ingestion (8 linear papers, a different document shape, plus
   raw→scaled conversion tables) and the TypeScript core (types, bank loaders, adaptive form
   assembly, scoring, `sat-001` migration, course gating). Estimate 3–5 h.
3. Write plan 3 — portal SAT Lab, adaptive runner, SPR pad, score report, public `/sat`
   vertical, integration. Estimate 4–6 h.

## Process note

Reviews were run per-task via the subagent-driven skill. The user pushed back on the volume,
correctly: reviews on Tasks 3, 4 and the final whole-branch review caught defects that would
have shipped a broken bank; Tasks 2 and 5 found nothing. **Agreed approach going forward:
review only where a bug would be silent or expensive** — data correctness, anything touching
the production bucket or database, and the adaptive scoring maths. Skip review for UI wiring,
type definitions and documentation.
