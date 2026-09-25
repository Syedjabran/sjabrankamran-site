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
 * existing entry with that id is left UNTOUCHED -- not rewritten, even if
 * `a`'s fields differ from the stored copy. A retried POST reuses the same
 * idempotencyKey only for the SAME payload (the Assign panel rotates the
 * key the moment anything about the assignment changes), so a same-id
 * re-POST is always a retry of an identical assignment, and this way it can
 * never clobber a status/sessionId the ASSIGNMENT HOOKs have since written
 * (e.g. the student already started it in the few seconds before staff
 * retried the request). A new id is prepended.
 */
export function mergeAssignment(items: SATAssignment[], a: SATAssignment): SATAssignment[] {
  if (items.some((x) => x.id === a.id)) return items;
  return [a, ...items];
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
