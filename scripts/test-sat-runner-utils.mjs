import assert from "node:assert/strict";
import { mergeAnswers, mergeFlagged, pickAnswers, pickFlagged } from "../src/components/sat/sat-runner-utils.ts";

// --- pickAnswers / pickFlagged: a save/submit body carries only the module
// on screen, never the whole sitting's map. ---
assert.deepEqual(pickAnswers({ a: "1", b: "2", c: "3" }, ["a", "c"]), { a: "1", c: "3" });
assert.deepEqual(pickAnswers({ a: "1" }, ["z"]), {}, "ids outside the module are dropped entirely");
assert.deepEqual(pickFlagged(["a", "b", "c"], ["b", "c", "d"]), ["b", "c"]);
assert.deepEqual(pickFlagged([], ["a"]), []);

// --- mergeAnswers: local wins for the NEW module's ids; every other
// module's answers pass through from the server untouched. ---
const server = { "old-1": "A", "new-1": "B", "new-2": "C" };
const local = { "old-1": "Z", "new-1": "X", "new-3": "Y" };
assert.deepEqual(
  mergeAnswers(server, local, ["new-1", "new-2", "new-3"]),
  { "old-1": "A", "new-1": "X", "new-2": "C", "new-3": "Y" },
  "local wins for the new module's ids; other modules keep the server's copy",
);

// A locally-cleared answer ("") must not be resurrected from the server.
assert.deepEqual(
  mergeAnswers({ "new-1": "B" }, { "new-1": "" }, ["new-1"]),
  {},
  "a locally-cleared answer is dropped, not resurrected from the server",
);

// No local answer for the new module: the server's copy is kept as-is.
assert.deepEqual(mergeAnswers({ "new-1": "B" }, {}, ["new-1"]), { "new-1": "B" });

// A local answer for an id outside the merge's module is ignored.
assert.deepEqual(mergeAnswers({ "new-1": "B" }, { "other-1": "Q" }, ["new-1"]), { "new-1": "B" });

// --- mergeFlagged: local flag state wins outright for the new module's
// ids; other modules' flags pass through from the server. ---
assert.deepEqual(
  mergeFlagged(["old-1", "new-1"], ["new-2"], ["new-1", "new-2"]),
  ["old-1", "new-2"],
  "server's flag on new-1 is dropped (local didn't flag it); new-2 comes from local",
);
assert.deepEqual(
  mergeFlagged(["old-1"], [], ["new-1"]),
  ["old-1"],
  "no local flags for the new module: nothing added, other modules kept",
);

console.log("sat-runner-utils tests passed");
