// src/lib/sat/coach/plan-moves.ts
//
// Which full exams a student may still move (SAT Coach spec 6.4), for the
// home's Today and Your plan cards alike. Pure and client-safe (no answer
// data, no node: imports); the day rules themselves are planner.ts checkMove.
import type { PlanItem } from "../client-types.ts";
import { MAX_MOCK_MOVES } from "./planner.ts";

/** Moves this full exam has left (0 once moved twice). */
export function movesLeft(item: Pick<PlanItem, "moves">): number {
  return Math.max(0, MAX_MOCK_MOVES - (item.moves?.length ?? 0));
}

/** A scheduled, unstarted full exam with a move left -- whatever its day,
 *  today included; checkMove then decides the target day. */
export function isMovable(item: PlanItem): boolean {
  return item.kind === "mock" && item.status === "scheduled" && !item.sessionId && movesLeft(item) > 0;
}
