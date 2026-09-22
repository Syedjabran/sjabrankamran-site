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

**Plan 1 — question-bank ingestion: code complete.** 18 commits through `acf96ee`.
**Plans 2 and 3: not written.**

### ⚠️ Read this before touching the pipeline — there may be uncommitted work

The final whole-branch review produced a fix wave that was still running when this session
was paused. At pause time the working tree had **uncommitted modifications** to
`build_sat_bank.py`, `extract_sat.py`, `parse_qbank.py`, `report_qbank.py`, `upload.py` and
four test files, plus a new `tests/test_report_qbank.py`. The suite was green at **98 tests**
(up from 75 at `acf96ee`), so the work was in a good state, just unlanded.

**First action on resume:** run `git status` and `python -m pytest scripts/exam-lab/ingest-SAT/tests/ -q`.
If those changes are still uncommitted and green, review and commit them. If the tree is
clean and `git log` shows a commit after `acf96ee`, the wave landed and nothing is pending.

The fix wave was addressing these findings from the final review — check which are actually
done rather than assuming:

| | Finding | Why it matters |
| --- | --- | --- |
| **C1** | `build_sat_bank.py` cannot tell a dry-run `rows.json` from a live one | **Critical.** It would write a bank pointing at 3,730 bucket objects that do not exist — broken image links site-wide. Must also handle a partial live run, where `rows.json` holds only successfully-uploaded rows. |
| I1 | `urlopen()` had no `timeout=` | A half-open connection during a 3,730-file upload hangs forever, silently. Also made the `TimeoutError` retry arm dead code. |
| I2 | The live upload branch had zero test coverage | All `main()` tests pass `--dry-run`; upload → record → append-row has never executed. |
| I3 | `REQUIRED` listed 9 fields; spec §5.2 has 10 | A row with no `rationale` passed the gate. |
| I4 | Dedupe was per-export, not per-corpus | Spec rule 3. Fails the whole build *after* a multi-hour upload. |
| I5 | Difficulty picked positionally in one place, by vocabulary order in another | A header with two difficulty words ships the wrong one. |

Plus three cheap ones: store `_upload_with_retry`'s canonical key rather than `bucket_path`'s
raw output; check credentials at startup instead of `KeyError` after the first crop; use one
strict decode policy (`report_qbank.py` was lenient, `crop_qbank.py` strict, and the shipped
`rationale` came through the lenient one).

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
