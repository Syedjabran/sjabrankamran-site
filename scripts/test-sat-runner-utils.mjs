import assert from "node:assert/strict";
import {
  answersChangedFor, flaggedChangedFor, isTimeoutError, looksLikeSessionState, mergeAnswers, mergeFlagged, pickAnswers, pickFlagged,
} from "../src/components/sat/sat-runner-utils.ts";

// --- pickAnswers / pickFlagged: a save/submit body carries only the module
// on screen, never the whole sitting's map. ---
assert.deepEqual(pickAnswers({ a: "1", b: "2", c: "3" }, ["a", "c"]), { a: "1", c: "3" });
assert.deepEqual(pickAnswers({ a: "1" }, ["z"]), {}, "ids outside the module are dropped entirely");
assert.deepEqual(pickFlagged(["a", "b", "c"], ["b", "c", "d"]), ["b", "c"]);
assert.deepEqual(pickFlagged([], ["a"]), []);

// --- mergeAnswers: local wins ONLY for ids the student actually touched;
// an untouched id keeps the server's copy even if local carries a
// (merely inherited) different value for it; every id outside the module
// passes through from the server untouched regardless of touched. ---
const server = { "old-1": "A", "new-1": "B", "new-2": "C", "new-3": "D" };
const local = { "old-1": "Z", "new-1": "X", "new-2": "Q", "new-3": "Y" };
assert.deepEqual(
  mergeAnswers(server, local, ["new-1", "new-2", "new-3"], ["new-1", "new-3"]),
  { "old-1": "A", "new-1": "X", "new-2": "C", "new-3": "Y" },
  "touched ids (new-1, new-3) take the local value; the untouched new-2 keeps the server's, even though local disagrees",
);

// A locally-cleared answer ("") for a TOUCHED id must not be resurrected from the server.
assert.deepEqual(
  mergeAnswers({ "new-1": "B" }, { "new-1": "" }, ["new-1"], ["new-1"]),
  {},
  "a touched, locally-cleared answer is dropped, not resurrected from the server",
);

// An UNTOUCHED local value -- even an empty one -- never overrides the server's.
assert.deepEqual(
  mergeAnswers({ "new-1": "B" }, { "new-1": "" }, ["new-1"], []),
  { "new-1": "B" },
  "an untouched id keeps the server's answer; local was never actually edited by the student",
);

// No local answer at all for the new module: the server's copy is kept as-is.
assert.deepEqual(mergeAnswers({ "new-1": "B" }, {}, ["new-1"], []), { "new-1": "B" });

// A local answer for an id outside the merge's module is ignored even if touched.
assert.deepEqual(mergeAnswers({ "new-1": "B" }, { "other-1": "Q" }, ["new-1"], ["other-1"]), { "new-1": "B" });

// --- mergeFlagged: the bug this fix addresses -- a module the student has
// never visited has touched none of its ids, so the server's flags for it
// must survive a switch untouched, not be wiped just because local (which
// never held any info for that module) "wins" by default. ---
assert.deepEqual(
  mergeFlagged(["new-1", "new-2"], [], ["new-1", "new-2"], []),
  ["new-1", "new-2"],
  "the server's flags for a module the student never touched survive the switch",
);
assert.deepEqual(
  mergeFlagged(["old-1"], [], ["new-1"], []),
  ["old-1"],
  "an id outside the module passes through from the server regardless of touched",
);

// A touched id's local flag state wins outright, whether adding a flag...
assert.deepEqual(
  mergeFlagged(["new-1"], ["new-2"], ["new-1", "new-2"], ["new-2"]),
  ["new-1", "new-2"],
  "new-1 is untouched and keeps the server's flag; new-2 is touched and takes local's flag",
);
// ...or removing one (touched, but absent from local -- an explicit local unflag).
assert.deepEqual(
  mergeFlagged(["new-1"], [], ["new-1"], ["new-1"]),
  [],
  "a touched id the student explicitly unflagged locally wins over the server's flag",
);

// --- answersChangedFor / flaggedChangedFor: a stage-switch merge should
// only be marked dirty (and resent) when it actually differs from the
// server's own copy for that module. ---
{
  const srv = { "new-1": "B" };
  const mergedUntouched = mergeAnswers(srv, {}, ["new-1"], []);
  assert.equal(answersChangedFor(srv, mergedUntouched, ["new-1"]), false, "an untouched merge is not dirty");

  const mergedTouched = mergeAnswers(srv, { "new-1": "X" }, ["new-1"], ["new-1"]);
  assert.equal(answersChangedFor(srv, mergedTouched, ["new-1"]), true, "a touched id that actually wins is dirty");
}
{
  const srv = ["new-1"];
  const mergedUntouched = mergeFlagged(srv, [], ["new-1"], []);
  assert.equal(flaggedChangedFor(srv, mergedUntouched, ["new-1"]), false, "an untouched flagged merge is not dirty");

  const mergedTouched = mergeFlagged(srv, [], ["new-1"], ["new-1"]);
  assert.equal(flaggedChangedFor(srv, mergedTouched, ["new-1"]), true, "a touched unflag that actually wins is dirty");
}

// --- isTimeoutError: distinguishes an AbortSignal.timeout()/manual abort
// from a genuine network failure, so callers can show a friendly message
// instead of the raw DOMException text. ---
{
  const timeoutErr = new Error("The operation was aborted due to timeout");
  timeoutErr.name = "TimeoutError";
  assert.equal(isTimeoutError(timeoutErr), true);

  const abortErr = new Error("This operation was aborted");
  abortErr.name = "AbortError";
  assert.equal(isTimeoutError(abortErr), true);

  assert.equal(isTimeoutError(new Error("network down")), false, "an ordinary network error is not a timeout");
  assert.equal(isTimeoutError("not an error object"), false);
  assert.equal(isTimeoutError(null), false);
}

// --- looksLikeSessionState: a 2xx body must actually be shaped like a
// session state before it's trusted -- an empty object (e.g. from
// `.catch(() => ({}))` on unparseable JSON) must not be applied as one. ---
{
  const validRunning = { serverNow: 1000, status: "running", answers: {}, flagged: [], stage: { key: "rw.m1", deadline: 2000, questions: [] } };
  assert.equal(looksLikeSessionState(validRunning), true);

  const validBreak = { serverNow: 1000, status: "break", answers: {}, flagged: [], stage: null };
  assert.equal(looksLikeSessionState(validBreak), true);

  assert.equal(looksLikeSessionState({}), false, "an empty/malformed body is rejected");
  assert.equal(looksLikeSessionState(null), false);
  assert.equal(looksLikeSessionState("oops"), false);
  assert.equal(
    looksLikeSessionState({ serverNow: 1000, status: "running", answers: {}, flagged: [], stage: { key: "rw.m1", deadline: 2000 } }),
    false,
    "a stage missing `questions` is rejected",
  );
  assert.equal(
    looksLikeSessionState({ serverNow: Number.NaN, status: "running", answers: {}, flagged: [], stage: null }),
    false,
    "a non-finite clock is rejected",
  );
  assert.equal(
    looksLikeSessionState({ serverNow: 1000, status: "running", answers: [], flagged: [], stage: null }),
    false,
    "answers must be a map, not an array",
  );
}

console.log("sat-runner-utils tests passed");
