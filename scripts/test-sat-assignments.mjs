import assert from "node:assert/strict";
// assignment-rules.ts has no `@/` aliases (unlike assignments.ts, which pulls
// in storage-fresh.ts's admin-client alias and so cannot be imported by
// plain node) -- the same split as course-labels.ts/course-access.ts.
import { mergeAssignment, resolveStart } from "../src/lib/sat/assignment-rules.ts";

const a = (id, status, sessionId = null) => ({
  id, kind: "adaptive", title: "Adaptive mock exam", testNo: null, filter: null, count: null,
  dueAt: null, assignedBy: "staff-1", assignedByName: "Ms. Kamran", assignedAt: "2026-09-25T00:00:00.000Z",
  status, sessionId,
});

// --- mergeAssignment: idempotent on `a.id` ---
assert.deepEqual(mergeAssignment([], a("x1", "assigned")), [a("x1", "assigned")], "a fresh list gets the one assignment");

{
  const list = [a("x1", "assigned")];
  const next = mergeAssignment(list, a("x2", "assigned"));
  assert.deepEqual(next, [a("x2", "assigned"), a("x1", "assigned")], "a new id is prepended, the old one kept");
}

{
  // A retried POST (same idempotencyKey => same a.id) must never duplicate
  // the entry -- the list length is unchanged and the existing entry is
  // left UNTOUCHED, not appended, wherever it already sits (fix round 1,
  // ruling 1: a same-id re-POST must never clobber a status/sessionId an
  // ASSIGNMENT HOOK has since written).
  const list = [a("x1", "assigned"), a("x2", "in_progress", "sess-1")];
  const retried = mergeAssignment(list, a("x1", "assigned"));
  assert.equal(retried.length, 2, "re-merging the same id never grows the list");
  assert.deepEqual(retried, list, "the existing entry is left exactly as it was, the other untouched too");
}

{
  // Even when the incoming object's fields differ from the stored one (e.g.
  // the student has since started or finished it), an existing id is left
  // exactly as stored -- never overwritten with the incoming content.
  const list = [a("x1", "in_progress", "sess-1")];
  const rePosted = mergeAssignment(list, a("x1", "assigned"));
  assert.deepEqual(rePosted, [a("x1", "in_progress", "sess-1")], "the stored entry's own status/sessionId survive a same-id re-merge untouched");
}

// --- resolveStart: status -> what the sessions route ASSIGNMENT HOOK does ---
assert.deepEqual(resolveStart({ status: "assigned", sessionId: null }), { type: "start" }, "not yet started -> start a fresh sitting");
assert.deepEqual(resolveStart({ status: "in_progress", sessionId: "sess-42" }), { type: "resume", sessionId: "sess-42" }, "in progress with a live sessionId -> resume it, never a second sitting");
assert.deepEqual(resolveStart({ status: "in_progress", sessionId: null }), { type: "start" }, "an inconsistent in_progress with no sessionId falls back to starting fresh");
assert.deepEqual(resolveStart({ status: "done", sessionId: null }), { type: "conflict" }, "already completed -> conflict, regardless of sessionId");
assert.deepEqual(resolveStart({ status: "done", sessionId: "sess-42" }), { type: "conflict" }, "done wins over a lingering sessionId");

console.log("sat-assignments tests passed");
