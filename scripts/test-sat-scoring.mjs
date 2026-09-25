import assert from "node:assert/strict";
import { totalRange, scoreEstimated, scoreFromTable } from "../src/lib/sat/scoring.ts";

const table = { 0: [200, 200], 10: [300, 330], 20: [420, 460], 66: [790, 800] };

assert.deepEqual(scoreFromTable(table, 10), [300, 330]);
// A raw score with no exact row must interpolate between neighbours, not
// silently return 200 or throw mid-exam.
const [lo, hi] = scoreFromTable(table, 15);
assert.ok(lo > 300 && lo < 420, `interpolated lower ${lo} out of range`);
assert.ok(hi > 330 && hi < 460);

assert.deepEqual(totalRange([200, 220], [200, 210]), [400, 430]);
// The published total is 400-1600; no arithmetic may leave that range.
assert.deepEqual(totalRange([790, 800], [790, 800]), [1580, 1600]);

const est = scoreEstimated({ rw: 27, math: 22 });
assert.equal(est.authority, "estimated");
assert.ok(est.basis.length > 10, "an estimate must say what it is based on");
assert.ok(est.lower <= est.upper);
assert.ok(est.lower >= 400 && est.upper <= 1600);

console.log("sat-scoring tests passed");
