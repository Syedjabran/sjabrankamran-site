import assert from "node:assert/strict";
import {
  SUBJECTS, subjectOf, coursesFromGrants, DIRECT_SUBJECTS, directSubjectOf, DIRECT_SUBJECT_ONLY,
  directGrantsIn, grantsDocPath, subjectSwitchLabel,
} from "../src/lib/portal/subjects.ts";
import { coursesForEnrolment } from "../src/lib/portal/course-labels.ts";

// --- the registry ------------------------------------------------------------
assert.deepEqual(SUBJECTS.map((s) => s.id), ["physics", "sat", "practical-lab"]);
assert.equal(new Set(SUBJECTS.map((s) => s.id)).size, SUBJECTS.length, "ids are unique");
assert.equal(subjectOf("physics").grant, "class", "physics comes from class enrolment");
assert.equal(subjectOf("sat").grant, "direct", "SAT is granted directly by an admin");
assert.equal(subjectOf("sat").label, "Digital SAT");
assert.equal(subjectOf("sat").setupPath, "/portal/sat-lab/setup");
assert.equal(subjectOf("nope"), null);
assert.equal(subjectOf("toString"), null, "an inherited property name is not a subject");
// Practical Lab: switched on directly, lives inside Physics, opens no course.
const LAB = subjectOf("practical-lab");
assert.equal(LAB.label, "Practical Lab");
assert.equal(LAB.grant, "direct", "Practical Lab is granted directly by an admin, no teacher");
assert.equal(LAB.partOf, "physics", "Practical Lab is shown inside Physics");
assert.deepEqual(LAB.courses, [], "a lab grant opens no course (no Exam Lab, no timetable)");
for (const s of SUBJECTS) if (s.partOf) assert.ok(subjectOf(s.partOf) && !subjectOf(s.partOf).partOf, `${s.id} lives inside a top-level subject`);
assert.equal(subjectSwitchLabel(LAB), "Practical Lab (Physics)");
assert.equal(subjectSwitchLabel(subjectOf("sat")), "Digital SAT");
// What an admin can switch on per student: direct-grant subjects only.
assert.deepEqual(DIRECT_SUBJECTS.map((s) => s.id), ["sat", "practical-lab"]);
assert.equal(directSubjectOf("sat")?.id, "sat");
assert.equal(directSubjectOf("practical-lab")?.id, "practical-lab");
assert.equal(directSubjectOf("physics"), null, "physics is never granted directly");
assert.equal(directSubjectOf("nope"), null);
assert.equal(directSubjectOf(42), null);
assert.equal(DIRECT_SUBJECT_ONLY, "Only Digital SAT and Practical Lab can be added directly; Physics comes from class enrolment.");

// --- direct grants -> courses ------------------------------------------------
assert.deepEqual(coursesFromGrants({ sat: { by: "a", at: "t" } }), ["SAT"]);
assert.deepEqual(coursesFromGrants({}), []);
// A class-granted subject never turns into a course from a grant record.
assert.deepEqual(coursesFromGrants({ physics: { by: "a", at: "t" } }), []);
assert.deepEqual(coursesFromGrants({ sat: undefined }), [], "an absent grant grants nothing");
// Practical Lab never becomes a course, alone or next to SAT.
assert.deepEqual(coursesFromGrants({ "practical-lab": { by: "a", at: "t" } }), []);
assert.deepEqual(coursesFromGrants({ "practical-lab": { by: "a", at: "t" }, sat: { by: "a", at: "t" } }), ["SAT"]);

// --- the stored grants rule (subject-grants.ts and the /lab gate) ------------
const G = { by: "admin-1", at: "2026-09-27T10:00:00.000Z" };
assert.deepEqual(directGrantsIn({ sat: G, "practical-lab": G }), { sat: G, "practical-lab": G });
assert.deepEqual(directGrantsIn({ physics: G, nope: G }), {}, "class and unknown subjects are dropped");
assert.deepEqual(directGrantsIn({ "practical-lab": { by: "a" } }), {}, "a row without `at` is dropped");
assert.deepEqual(directGrantsIn({ "practical-lab": true }), {}, "a bare true is not a grant");
assert.deepEqual(directGrantsIn({ "practical-lab": { ...G, extra: 1 } }), { "practical-lab": G }, "only by/at are kept");
assert.deepEqual(directGrantsIn(null), {});
assert.deepEqual(directGrantsIn([G]), {});
assert.equal(grantsDocPath("u-123456"), "subjects/u-123456.json");

// --- class enrolments + direct grants (coursesForEnrolment) ------------------
// coursesForEnrolment takes the enrolled class ids and the registry classes.
// The physics default stays class-based (spec 4, amended 2026-09-26): every
// enrolled class the registry can't place as a course grants 9702, whatever
// the grants; with no classes, 9702 only when there are no grants either.
// Adding SAT never removes physics.
const CLASSES = [
  { id: "as", year: "AS" }, { id: "sat", year: "SAT 2026" }, { id: "a1", year: "A1" },
  { id: "o", year: "O Level" }, { id: "u", year: "Nursery" },
];
const sorted = (s) => [...s].sort();
// (a) unrecognised class "A1" + SAT grant -> 9702 and SAT.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["a1"]), CLASSES, { directCourses: ["SAT"] })), ["9702", "SAT"]);
assert.deepEqual(sorted(coursesForEnrolment(new Set(["u"]), [], { directCourses: ["SAT"] })), ["9702", "SAT"], "a class missing from the registry too");
// (b) no classes + SAT grant -> SAT only (an SAT-only account gets no physics).
assert.deepEqual(sorted(coursesForEnrolment(new Set(), CLASSES, { directCourses: ["SAT"] })), ["SAT"]);
// (c) no classes, no grants -> 9702.
assert.deepEqual(sorted(coursesForEnrolment(new Set(), CLASSES, { directCourses: [] })), ["9702"]);
assert.deepEqual(sorted(coursesForEnrolment(new Set(), CLASSES)), ["9702"], "no options = no grants");
// (d) SAT-year class only, no grant -> SAT only (existing F10 behaviour unchanged).
assert.deepEqual(sorted(coursesForEnrolment(new Set(["sat"]), CLASSES, { directCourses: [] })), ["SAT"]);
// (e) "AS" class + SAT grant -> 9702 and SAT.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["as"]), CLASSES, { directCourses: ["SAT"] })), ["9702", "SAT"]);
// Unrecognised class, no grants -> the legacy default, unchanged.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["a1"]), CLASSES, { directCourses: [] })), ["9702"]);
// SAT class + unrecognised class, no grant -> the F10 rule still keeps 9702.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["sat", "u"]), CLASSES, { directCourses: [] })), ["9702", "SAT"]);
// A recognised O Level class is never widened to 9702, grant or not.
assert.deepEqual(sorted(coursesForEnrolment(new Set(["o", "u"]), CLASSES, { directCourses: ["SAT"] })), ["5054", "SAT"]);
// SAT class and SAT grant -> one SAT, not two.
assert.deepEqual([...coursesForEnrolment(new Set(["sat"]), CLASSES, { directCourses: ["SAT"] })], ["SAT"]);

console.log("subjects tests passed");
