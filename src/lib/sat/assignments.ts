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

type UpsertOutcome = "new" | "already" | "failed";

/**
 * One student's fresh-read -> merge (idempotent on `a.id`, see
 * assignment-rules.ts) -> write -> verify, for `addAssignments`. Storage has
 * no conditional write, so a concurrent writer to the SAME per-student doc
 * (two overlapping Assign calls, or this very write racing an ASSIGNMENT
 * HOOK's `markAssignment`) can clobber this write in between it and the
 * verifying re-read -- a lost update. That is retried ONCE (a second full
 * read -> merge -> write -> verify pass); if the entry is still missing
 * after that, the student is counted `failed` rather than silently assumed
 * to have it. This narrows the race; it does not close it.
 *
 * `hadAtStart` is fixed from the FIRST read: a same-id entry seen there is
 * left untouched per `mergeAssignment` and counted "already" (never
 * `notify`-ed again); one that only appears by the retry's read (a
 * concurrent writer won the race after this call started) is still "new"
 * from this call's point of view, since it wasn't there when this call began.
 */
async function upsertAssignment(uid: string, a: SATAssignment): Promise<UpsertOutcome> {
  let hadAtStart: boolean | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
    if (!r.ok) return "failed";
    const items = r.data?.items ?? [];
    const has = items.some((x) => x.id === a.id);
    if (hadAtStart === null) hadAtStart = has;
    if (has) return hadAtStart ? "already" : "new";
    if (await writeFreshJson(BUCKET, path(uid), { items: mergeAssignment(items, a) })) {
      const verify = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
      if (verify.ok && (verify.data?.items ?? []).some((x) => x.id === a.id)) return hadAtStart ? "already" : "new";
    }
    // Write or verify failed/lost -- loop back for the one retry.
  }
  return "failed";
}

/**
 * Fan one assignment out to every recipient, one JSON document per student
 * (portal-data/sat/assigned/<uid>.json). Bounded concurrency 8, matching
 * the fan-out pattern in src/app/api/sat/results/route.ts.
 *
 * `added` counts every uid the entry ends up present for (whether it was
 * already there -- same-id re-POST, left untouched -- or newly written);
 * `failed` counts a read/write failure or a lost update that didn't recover
 * on the one retry. `newUids` -- the subset of `added` that did NOT already
 * carry this id before this call -- lets the route notify only students who
 * didn't already have it (never re-notifying one who did, whether from an
 * earlier POST with the same idempotencyKey or a concurrent one that won a
 * lost-update race first).
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
      const outcome = await upsertAssignment(uid, a);
      if (outcome === "failed") { failed++; continue; }
      added++;
      if (outcome === "new") newUids.push(uid);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, worker));
  return { added, failed, newUids };
}

/** True when every field in `patch` already matches `item` -- nothing to write. */
function patchApplied(item: SATAssignment, patch: Partial<Pick<SATAssignment, "status" | "sessionId">>): boolean {
  return (Object.keys(patch) as (keyof typeof patch)[]).every((k) => item[k] === patch[k]);
}

/**
 * Patch one assignment's mutable fields (status/sessionId) in the caller's
 * own list -- used by the ASSIGNMENT HOOKs in the sessions routes. Fresh
 * read -> patch -> write -> verify, same one-retry lost-update handling as
 * `addAssignments` (storage has no conditional write). An id not in the
 * list is a no-op (`false`); a patch already applied (whether on the first
 * read, or found already applied by a concurrent writer on the retry's
 * read) returns `true` without writing again. Never throws (best-effort for
 * its callers, which must not fail an otherwise-successful session save
 * over a marker write).
 */
export async function markAssignment(
  uid: string, id: string, patch: Partial<Pick<SATAssignment, "status" | "sessionId">>,
): Promise<boolean> {
  if (!SAFE_ID.test(uid) || !SAFE_ID.test(id)) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
    if (!r.ok) return false;
    const items = r.data?.items ?? [];
    const idx = items.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    if (patchApplied(items[idx], patch)) return true;
    const next = [...items];
    next[idx] = { ...items[idx], ...patch };
    if (await writeFreshJson(BUCKET, path(uid), { items: next })) {
      const verify = await readFreshJson<AssignmentDoc>(BUCKET, path(uid));
      const vItem = verify.ok ? (verify.data?.items ?? []).find((x) => x.id === id) : undefined;
      if (vItem && patchApplied(vItem, patch)) return true;
    }
    // Write or verify failed/lost -- loop back for the one retry.
  }
  return false;
}
