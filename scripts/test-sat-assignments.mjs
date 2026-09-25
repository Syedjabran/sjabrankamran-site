import assert from "node:assert/strict";
import { z } from "zod";
// assignment-rules.ts has no `@/` aliases (unlike assignments.ts, which pulls
// in storage-fresh.ts's admin-client alias and so cannot be imported by
// plain node) -- the same split as course-labels.ts/course-access.ts.
import { mergeAssignment, resolveStart } from "../src/lib/sat/assignment-rules.ts";
// zod-issue-message.ts has no `@/` aliases and no framework import (unlike
// zod-messages.ts, which pulls in next/server and so cannot be imported by
// plain node) -- the same split as assignment-rules.ts/assignments.ts.
import { zodIssueMessage } from "../src/lib/sat/zod-issue-message.ts";

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

// --- zodIssueMessage: fix round 2 finding 3 -- only a hand-authored
// (`code: "custom"`) issue's message ever reaches the user; every other zod
// issue (a bad shape, an out-of-range number, a malformed uuid...) collapses
// to one generic sentence instead of leaking zod's own internal wording. ---
{
  const customSchema = z.object({ domain: z.string() }).superRefine((_v, ctx) => {
    ctx.addIssue({ code: "custom", message: "That domain isn't part of the selected section.", path: ["domain"] });
  });
  const result = customSchema.safeParse({ domain: "algebra" });
  assert.equal(result.success, false);
  assert.equal(zodIssueMessage(result.error), "That domain isn't part of the selected section.", "a custom issue's own message is surfaced verbatim");
}

{
  // A plain shape failure (here, a malformed uuid, exactly like the
  // assignments route's `idempotencyKey: z.string().uuid()`) carries zod's
  // own generated wording -- never shown to the user.
  const builtinSchema = z.object({ idempotencyKey: z.string().uuid() });
  const result = builtinSchema.safeParse({ idempotencyKey: "not-a-uuid" });
  assert.equal(result.success, false);
  assert.notEqual(result.error.issues[0].message, "Invalid request.", "sanity check: zod's own message really is something else");
  assert.equal(zodIssueMessage(result.error), "Invalid request.", "a built-in zod issue never reaches the user verbatim -- it collapses to the generic sentence");
}

{
  // A totally malformed body (wrong type for a required field) is likewise
  // never shown verbatim.
  const schema = z.object({ count: z.number().int().min(5).max(30) });
  const result = schema.safeParse({ count: "ten" });
  assert.equal(result.success, false);
  assert.equal(zodIssueMessage(result.error), "Invalid request.", "a wrong-type issue collapses to the generic sentence too");
}

console.log("sat-assignments tests passed");
