// src/lib/sat/assignments.ts
//
// SERVER-ONLY. Teacher-assigned SAT work (Task 9): one JSON document per
// student holding everything they have ever been assigned. Modeled on
// src/lib/sat/store.ts -- reads fail closed (storage-fresh.ts): a failed
// read is never treated as "no assignments" and is never followed by a
// write, so a storage blip can never wipe out a student's list.
//
// The pure merge/status-transition logic lives in assignment-rules.ts (no
// `@/` aliases, unit-tested directly by scripts/test-sat-assignments.mjs);
// re-exported here so every caller (the assignments route, the sessions
// ASSIGNMENT HOOKs, the hub) still imports from this single module.
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { mergeAssignment, resolveStart, type SATAssignment, type StartOutcome } from "./assignment-rules.ts";

export type { SATAssignment, SATAssignmentKind, SATAssignmentStatus, StartOutcome } from "./assignment-rules.ts";
export { mergeAssignment, resolveStart };

const BUCKET = "portal-data";
const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const path = (uid: string) => `sat/assigned/${uid}.json`;

type AssignmentDoc = { items: SATAssignment[] };

/** The uid's own assignments, or null on a failed read -- never an empty
 *  list standing in for "couldn't check" (fail closed, matches store.ts's
 *  `listSummaries`). */
export async function listAssignments(uid: string): Promise<SATAssignment[] | null> {
  if (!SAFE_ID.test(uid)) return [];
  const r = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
  if (!r.ok) return null;
  return r.data?.items ?? [];
}

/**
 * Fan one assignment out to every recipient: fresh read -> merge (idempotent
 * on `a.id`, see assignment-rules.ts) -> write, one JSON document per
 * student (portal-data/sat/assigned/<uid>.json). Bounded concurrency 8,
 * matching the fan-out pattern in src/app/api/sat/results/route.ts. A
 * failed read or write for one student never blocks another and is counted
 * as `failed` -- fail closed: no write ever follows a failed read for that
 * student.
 *
 * `newUids` -- the subset of `added` uids that did NOT already carry an
 * assignment with this id before this call -- lets the route notify only
 * students who didn't already have it on a retried POST (idempotencyKey
 * ruling), without a second read pass: the check is free, made from the
 * same fresh read the merge itself needs.
 */
export async function addAssignments(
  uids: string[], a: SATAssignment,
): Promise<{ added: number; failed: number; newUids: string[] }> {
  const targets = uids.filter((u) => SAFE_ID.test(u));
  let added = 0;
  let failed = uids.length - targets.length;
  const newUids: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const uid = targets[next++];
      const r = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
      if (!r.ok) { failed++; continue; }
      const items = r.data?.items ?? [];
      const isNew = !items.some((x) => x.id === a.id);
      if (await writeFreshJson(BUCKET, path(uid), { items: mergeAssignment(items, a) })) {
        added++;
        if (isNew) newUids.push(uid);
      } else {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, worker));
  return { added, failed, newUids };
}

/**
 * Patch one assignment's mutable fields (status/sessionId) in the caller's
 * own list -- used by the ASSIGNMENT HOOKs in the sessions routes. Fresh
 * read -> patch -> write; a failed read never causes a write, and an id not
 * in the list is a no-op. Never throws (best-effort for its callers, which
 * must not fail an otherwise-successful session save over a marker write).
 */
export async function markAssignment(
  uid: string, id: string, patch: Partial<Pick<SATAssignment, "status" | "sessionId">>,
): Promise<boolean> {
  if (!SAFE_ID.test(uid) || !SAFE_ID.test(id)) return false;
  const r = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
  if (!r.ok) return false;
  const items = r.data?.items ?? [];
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const next = [...items];
  next[idx] = { ...next[idx], ...patch };
  return writeFreshJson(BUCKET, path(uid), { items: next });
}
