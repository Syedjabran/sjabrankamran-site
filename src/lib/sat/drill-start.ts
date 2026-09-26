// src/lib/sat/drill-start.ts
//
// SERVER-ONLY. Builds a student's filtered practice drill: the one path the
// drill start in POST /api/sat/sessions (the hub's drill form, "Drill this")
// and the SAT tutor's create_drill action share, so the running-sitting
// exclusion (store.ts inPlayQuestionIds) and the pool rules (drills.ts
// startDrill) are identical for both. The caller validates the filter with
// the shared satFilterSchema first and saves the doc.
import "server-only";
import { randomInt } from "node:crypto";
import { loadQuestionBank, type SATFilter } from "./bank.ts";
import { startDrill, type SATDrill } from "./drills.ts";
import { inPlayQuestionIds } from "./store.ts";

// crypto-backed Rng: which questions a drill holds must not be predictable.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export type DrillBuild = { ok: true; doc: SATDrill } | { ok: false; error: string; status: number };

/** A new (unsaved) drill of `count` questions matching `filter`, never
 *  drawing a question of the student's in-play sittings. Fails closed: a
 *  history that can't be read is a 503, never an unfiltered drill. */
export async function buildFilteredDrill(
  filter: SATFilter, count: number,
  ids: { id: string; uid: string; now: number; assignmentId?: string | null },
): Promise<DrillBuild> {
  const exclude = await inPlayQuestionIds(ids.uid, ids.now);
  if (exclude === null) return { ok: false, error: "Your SAT history couldn't be checked. Please try again.", status: 503 };
  try {
    return { ok: true, doc: startDrill(loadQuestionBank(), filter, count, rng, ids, exclude) };
  } catch (e) {
    return { ok: false, error: (e as Error).message, status: 400 };
  }
}
