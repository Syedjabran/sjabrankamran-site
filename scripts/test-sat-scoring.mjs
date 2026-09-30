import assert from "node:assert/strict";
import {
  totalRange, scoreEstimated, scoreFromTable, scoreOfficial, scoreOfficialFrom,
} from "../src/lib/sat/scoring.ts";

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

// Fix round 1, findings 2 & 3: scoreOfficial must refuse to score anything
// short of a COMPLETE table (a row for every raw score on the paper scale),
// not merely a present one -- an empty or partial table is not "ingested"
// (spec 10.5). Tested through the pure scoreOfficialFrom, and once through
// the real scoreOfficial(testNo, ...) against the current (empty)
// practice-tests.json, so the wiring itself is covered too.
function syntheticTable(maxRaw) {
  const t = {};
  for (let raw = 0; raw <= maxRaw; raw++) {
    const frac = raw / maxRaw;
    t[raw] = [
      Math.round(200 + frac * (790 - 200)),
      Math.round(200 + frac * (800 - 200)),
    ];
  }
  return t;
}
const completeRw = syntheticTable(66);   // R&W paper: 33 + 33 = 66 raw max
const completeMath = syntheticTable(54); // Math paper: 27 + 27 = 54 raw max

// Unknown test -> null.
assert.equal(scoreOfficialFrom(null, { rw: 0, math: 0 }), null);
assert.equal(scoreOfficial(999999, { rw: 0, math: 0 }), null);

// An empty rw or math table -> null, never "official". This is the exact
// bug: `{}` is truthy, so `!test?.conversion?.rw` alone let it through.
assert.equal(
  scoreOfficialFrom(
    { testNo: 1, questions: [], conversion: { rw: {}, math: completeMath } },
    { rw: 0, math: 0 },
  ),
  null,
);
assert.equal(
  scoreOfficialFrom(
    { testNo: 1, questions: [], conversion: { rw: completeRw, math: {} } },
    { rw: 0, math: 0 },
  ),
  null,
);

// A table missing even one raw score -> null, not a silently-interpolated
// "official" score.
const incompleteRw = { ...completeRw };
delete incompleteRw[10];
assert.equal(
  scoreOfficialFrom(
    { testNo: 1, questions: [], conversion: { rw: incompleteRw, math: completeMath } },
    { rw: 20, math: 20 },
  ),
  null,
);

// Complete synthetic tables -> a real official score: right authority,
// right testNo, bounds added separately, and clamped to 400-1600.
const completeTest = { testNo: 7, questions: [], conversion: { rw: completeRw, math: completeMath } };

const officialFloor = scoreOfficialFrom(completeTest, { rw: 0, math: 0 });
assert.equal(officialFloor.authority, "official");
assert.equal(officialFloor.testNo, 7);
assert.deepEqual([officialFloor.lower, officialFloor.upper], [400, 400]);

const officialCeiling = scoreOfficialFrom(completeTest, { rw: 66, math: 54 });
assert.equal(officialCeiling.authority, "official");
assert.deepEqual([officialCeiling.lower, officialCeiling.upper], [1580, 1600]);

console.log("sat-scoring-official tests passed");
