import assert from "node:assert/strict";
import { SUBJECTS, subjectOf, coursesFromGrants, DIRECT_SUBJECTS, directSubjectOf, DIRECT_SUBJECT_ONLY } from "../src/lib/portal/subjects.ts";
import { coursesForEnrolment } from "../src/lib/portal/course-labels.ts";

// --- the registry ------------------------------------------------------------
assert.deepEqual(SUBJECTS.map((s) => s.id), ["physics", "sat"]);
assert.equal(subjectOf("physics").grant, "class", "physics comes from class enrolment");
assert.equal(subjectOf("sat").grant, "direct", "SAT is granted directly by an admin");
assert.equal(subjectOf("sat").label, "Digital SAT");
assert.equal(subjectOf("sat").setupPath, "/portal/sat-lab/setup");
assert.equal(subjectOf("nope"), null);
assert.equal(subjectOf("toString"), null, "an inherited property name is not a subject");
// What an admin can switch on per student: direct-grant subjects only.
assert.deepEqual(DIRECT_SUBJECTS.map((s) => s.id), ["sat"]);
assert.equal(directSubjectOf("sat")?.id, "sat");
assert.equal(directSubjectOf("physics"), null, "physics is never granted directly");
assert.equal(directSubjectOf("nope"), null);
assert.equal(directSubjectOf(42), null);
assert.equal(DIRECT_SUBJECT_ONLY, "Only Digital SAT can be added directly; Physics comes from class enrolment.");

// --- direct grants -> courses ------------------------------------------------
assert.deepEqual(coursesFromGrants({ sat: { by: "a", at: "t" } }), ["SAT"]);
assert.deepEqual(coursesFromGrants({}), []);
// A class-granted subject never turns into a course from a grant record.
assert.deepEqual(coursesFromGrants({ physics: { by: "a", at: "t" } }), []);
assert.deepEqual(coursesFromGrants({ sat: undefined }), [], "an absent grant grants nothing");

// --- class enrolments + direct grants (coursesForEnrolment) ------------------
// coursesForEnrolment takes the enrolled class ids and the registry classes;
// "no classes" below means no enrolment the registry recognises as a course.
const CLASSES = [
  { id: "as", year: "AS" }, { id: "sat", year: "SAT 2026" }, { id: "u", year: "Nursery" },
];
const sorted = (s) => [...s].sort();
// SAT granted directly, no classes -> SAT only (no physics default)...
assert.deepEqual(sorted(coursesForEnrolment(new Set(), CLASSES, { directCourses: ["SAT"] })), ["SAT"]);
// ...even when the student sits in a class the registry can't place.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["u"]), CLASSES, { directCourses: ["SAT"] })), ["SAT"]);
assert.deepEqual(sorted(coursesForEnrolment(new Set(["u"]), [], { directCourses: ["SAT"] })), ["SAT"], "nor for a class missing from the registry");
// No recognised course, no grants -> the legacy physics default is kept.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["u"]), CLASSES, { directCourses: [] })), ["9702"]);
assert.deepEqual(sorted(coursesForEnrolment(new Set(["u"]), CLASSES)), ["9702"], "no options = no grants");
// Physics class + SAT grant -> both.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["as"]), CLASSES, { directCourses: ["SAT"] })), ["9702", "SAT"]);
// SAT-year class, no grant -> SAT only (existing F10 behaviour unchanged).
assert.deepEqual(sorted(coursesForEnrolment(new Set(["sat"]), CLASSES, { directCourses: [] })), ["SAT"]);
// SAT class + unrecognised class, no grant -> the F10 rule still keeps 9702.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["sat", "u"]), CLASSES, { directCourses: [] })), ["9702", "SAT"]);
// SAT class and SAT grant -> one SAT, not two.
assert.deepEqual([...coursesForEnrolment(new Set(["sat"]), CLASSES, { directCourses: ["SAT"] })], ["SAT"]);
// No enrolment and no grant -> nothing.
assert.deepEqual([...coursesForEnrolment(new Set(), CLASSES, { directCourses: [] })], []);

console.log("subjects tests passed");
