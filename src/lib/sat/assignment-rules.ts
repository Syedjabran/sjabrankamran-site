// src/lib/sat/assignment-rules.ts
//
// Pure logic for teacher-assigned SAT work (Task 9): the assignment shape,
// the idempotent list merge, and the status-transition rule for starting a
// session from an assignment. No storage, no `@/` aliases, so this is
// importable by plain `node --experimental-strip-types`
// (scripts/test-sat-assignments.mjs) -- the same reason course-labels.ts was
// split out of course-access.ts. assignments.ts (the storage-backed module)
// imports and re-exports everything here, so every other caller still
// imports from that one module.
import type { SATFilter } from "./bank.ts";

export type SATAssignmentKind = "adaptive" | "practice" | "drill";
export type SATAssignmentStatus = "assigned" | "in_progress" | "done";

export type SATAssignment = {
  id: string;
  kind: SATAssignmentKind;
  title: string;
  testNo: number | null;
  filter: SATFilter | null;
  count: number | null;
  dueAt: string | null;
  assignedBy: string;
  assignedByName: string;
  assignedAt: string;
  status: SATAssignmentStatus;
  sessionId: string | null;
};

/**
 * Merge one assignment into a student's list, idempotent on `a.id`: an
 * existing entry with that id is replaced in place (never duplicated); a
 * new one is prepended. A retried POST (same idempotencyKey) therefore never
 * grows the list.
 */
export function mergeAssignment(items: SATAssignment[], a: SATAssignment): SATAssignment[] {
  const idx = items.findIndex((x) => x.id === a.id);
  if (idx === -1) return [a, ...items];
  const next = [...items];
  next[idx] = a;
  return next;
}

/**
 * What starting a session from an assignment should do, given its current
 * status -- the ASSIGNMENT HOOK in src/app/api/sat/sessions/route.ts never
 * re-derives this rule inline.
 *  - "done"                                -> conflict (already completed).
 *  - "in_progress" with a live sessionId   -> resume that sitting.
 *  - "assigned", or an inconsistent
 *    "in_progress" with no sessionId       -> start a fresh sitting.
 */
export type StartOutcome =
  | { type: "start" }
  | { type: "resume"; sessionId: string }
  | { type: "conflict" };

export function resolveStart(a: Pick<SATAssignment, "status" | "sessionId">): StartOutcome {
  if (a.status === "done") return { type: "conflict" };
  if (a.status === "in_progress" && a.sessionId) return { type: "resume", sessionId: a.sessionId };
  return { type: "start" };
}
