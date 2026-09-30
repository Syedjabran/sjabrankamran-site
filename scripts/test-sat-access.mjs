import assert from "node:assert/strict";
// course-access.ts pulls in `@/lib/...` aliases that only the Next.js build
// resolves, so this imports the alias-free course-labels.ts module directly
// (course-access.ts re-exports the same courseFromYear/COURSE_LABEL from it).
import { courseFromYear, COURSE_LABEL } from "../src/lib/portal/course-labels.ts";

// SAT classes are recognised by their year label, so enrolling a student in
// an SAT class is what grants access -- no new data model (spec 9).
assert.equal(courseFromYear("SAT"), "SAT");
assert.equal(courseFromYear("SAT Prep 2026"), "SAT");
assert.equal(courseFromYear("sat digital"), "SAT");

// The existing mappings must not regress.
assert.equal(courseFromYear("O Level"), "5054");
assert.equal(courseFromYear("A Level"), "9702");
assert.equal(courseFromYear("AS"), "9702");
assert.equal(courseFromYear("Year 1"), "9702");
assert.equal(courseFromYear("Nursery"), null);

// "Saturday" contains "sat" but names no course. Substring matching on a
// three-letter token is exactly how a class label gets mis-routed.
assert.equal(courseFromYear("Saturday Batch"), null);

assert.ok(COURSE_LABEL.SAT.length > 0);

console.log("sat-access tests passed");
