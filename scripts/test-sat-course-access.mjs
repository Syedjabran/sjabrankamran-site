import assert from "node:assert/strict";
import { register } from "node:module";

// course-access.ts and sat/access.ts import `@/lib/...` aliases that only the
// Next.js build resolves. This resolve hook maps `@/x` to src/x.ts and swaps
// the Supabase clients, the registry read, the timetable scope and the fresh
// storage reads/writes (behind subject-grants.ts) for stubs driven from
// globalThis, so the real enrolment and grants logic runs under Node.
const SRC = new URL("../src/", import.meta.url).href;
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  // Next resolves "server-only" itself; under plain Node it is a no-op.
  "server-only": stub(""),
  "@/lib/supabase/admin": stub("export const createAdminClient = () => globalThis.__sat.db();"),
  "@/lib/supabase/server": stub("export const createClient = async () => { throw new Error('not used'); };"),
  "@/lib/portal/institutions": stub("export const getRegistry = async () => globalThis.__sat.registry();"),
  "@/lib/portal/timetable": stub("export const visibleClassIdsForUid = async () => [];"),
  "@/lib/portal/notifications": stub("export const notify = async (target, input) => { globalThis.__sat.notices.push({ target, input }); return 1; };"),
  "@/lib/exam-lab/storage-fresh": stub([
    "export const readFreshJson = async (bucket, path) => globalThis.__sat.storage.read(bucket, path);",
    "export const writeFreshJson = async (bucket, path, value) => globalThis.__sat.storage.write(bucket, path, value);",
  ].join("\n")),
};
const hooks = `
const SRC = ${JSON.stringify(SRC)};
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) return next(new URL(specifier.slice(2) + ".ts", SRC).href, context);
  return next(specifier, context);
}`;
register(stub(hooks));

const { resolveCourseAccess } = await import("../src/lib/portal/course-access.ts");
const { satAccess } = await import("../src/lib/sat/access.ts");
const { readGrants, setGrant } = await import("../src/lib/portal/subject-grants.ts");
const { switchSubject } = await import("../src/lib/portal/subject-admin.ts");

const REGISTRY = {
  updated_at: "x", schools: ["S"],
  classes: [{ id: "sat-1", year: "SAT 2026" }, { id: "phy-1", year: "A Level" }, { id: "odd-1", year: "Nursery" }, { id: "a1-1", year: "A1" }, { id: "as-1", year: "AS" }],
};
const EMPTY_REGISTRY = { updated_at: "", schools: [], classes: [] };
const MISSING = { ok: true, data: null };
const FAILED = { ok: false };

/** One scenario: what each read returns, and a log of every read made.
 *  `grants` is the fresh storage read of the student's subjects doc
 *  (missing by default); `grantReads` logs each one as "bucket/path". */
function scenario({ student = { data: { id: "st1" }, error: null }, enrolments = { data: [{ class_id: "sat-1" }], error: null }, registry = REGISTRY, grants = MISSING } = {}) {
  const reads = [];
  const grantReads = [];
  globalThis.__sat = {
    grantReads,
    storage: {
      read: async (bucket, path) => { grantReads.push(`${bucket}/${path}`); return grants; },
      write: async () => { throw new Error("course access never writes"); },
    },
    registry: async () => { reads.push("registry"); return registry; },
    db: () => ({
      from(table) {
        reads.push(table);
        const result = table === "edu_students" ? student : enrolments;
        const chain = {
          select: () => chain, eq: () => chain,
          maybeSingle: async () => result,
          then: (ok, fail) => Promise.resolve(result).then(ok, fail),
        };
        return chain;
      },
    }),
  };
  return reads;
}

// A Supabase-style uid: the grants store only accepts ids matching
// ^[A-Za-z0-9_-]{6,64}$, so every scenario below also runs the grants read.
const studentUser = { id: "student-u1", roles: ["student"] };
const failure = { data: null, error: { message: "connection reset" } };

// --- one enrolment lookup per access check (F3) ---
let reads = scenario();
assert.deepEqual(await resolveCourseAccess(studentUser), { allowed: ["SAT"], primary: "SAT", locked: true, isStaff: false });
assert.deepEqual(reads, ["edu_students", "edu_enrolments", "registry"], "exactly one student, enrolment and registry read");
assert.deepEqual(globalThis.__sat.grantReads, ["portal-data/subjects/student-u1.json"], "and exactly one subjects read");

reads = scenario({ enrolments: { data: [{ class_id: "sat-1" }, { class_id: "phy-1" }], error: null } });
assert.deepEqual(await resolveCourseAccess(studentUser, { strict: true }), { allowed: ["SAT", "9702"], primary: "9702", locked: false, isStaff: false });
assert.deepEqual(reads, ["edu_students", "edu_enrolments", "registry"]);

// --- strict (the SAT path): a failed read throws, never reads as "not enrolled" (F2) ---
scenario({ student: failure });
await assert.rejects(resolveCourseAccess(studentUser, { strict: true }), /connection reset/, "student lookup error");
scenario({ enrolments: failure });
await assert.rejects(resolveCourseAccess(studentUser, { strict: true }), /connection reset/, "enrolment lookup error");
scenario({ registry: EMPTY_REGISTRY });
await assert.rejects(resolveCourseAccess(studentUser, { strict: true }), /registry/, "a failed (empty) registry read");

// satAccess is strict, so the SAT routes' accessUnavailable() 503 fires.
scenario({ registry: EMPTY_REGISTRY });
await assert.rejects(satAccess(studentUser), /registry/);
scenario({ enrolments: failure });
await assert.rejects(satAccess(studentUser), /connection reset/);
scenario();
assert.deepEqual(await satAccess(studentUser), { ok: true, isStaff: false });
scenario({ enrolments: { data: [{ class_id: "phy-1" }], error: null } });
assert.deepEqual(await satAccess(studentUser), { ok: false, isStaff: false }, "a real non-SAT enrolment is still a plain no");
scenario({ student: { data: null, error: null } });
assert.deepEqual(await satAccess(studentUser), { ok: false, isStaff: false }, "no student record is a plain no, not a failure");
scenario({ enrolments: { data: [], error: null } });
assert.deepEqual(await satAccess(studentUser), { ok: false, isStaff: false }, "no active enrolment is a plain no, not a failure");

// --- non-strict (physics / Exam Lab callers): behaviour unchanged ---
scenario({ student: failure });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, [], "a failed read still reads as no enrolment");
scenario({ registry: EMPTY_REGISTRY });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, ["9702"], "an empty registry still falls back to the 9702 default");

// --- staff never touch the enrolment tables; parents get nothing ---
reads = scenario();
assert.deepEqual(await satAccess({ id: "t1", roles: ["teacher"] }), { ok: true, isStaff: true });
assert.deepEqual(reads, []);
assert.deepEqual(await resolveCourseAccess({ id: "p1", roles: ["parent"] }, { strict: true }), { allowed: [], primary: null, locked: true, isStaff: false });
assert.deepEqual(globalThis.__sat.grantReads, [], "staff and parents never read subject grants");

// --- direct subject grants (subjects.ts / subject-grants.ts) ---
const satGrant = { ok: true, data: { grants: { sat: { by: "admin-1", at: "2026-09-26T10:00:00.000Z" } }, history: [] } };
const noStudentRow = { data: null, error: null };
const noEnrolments = { data: [], error: null };

// SAT granted directly, no student row or class at all -> SAT, and satAccess says yes.
scenario({ student: noStudentRow, grants: satGrant });
assert.deepEqual(await resolveCourseAccess(studentUser, { strict: true }), { allowed: ["SAT"], primary: "SAT", locked: true, isStaff: false });
scenario({ student: noStudentRow, grants: satGrant });
assert.deepEqual(await satAccess(studentUser), { ok: true, isStaff: false }, "an SAT grant opens the SAT Lab without an SAT class");
scenario({ enrolments: noEnrolments, grants: satGrant });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, ["SAT"], "no active enrolment + grant = SAT");
// Physics class + SAT grant -> both; physics opens first.
scenario({ enrolments: { data: [{ class_id: "phy-1" }], error: null }, grants: satGrant });
assert.deepEqual(await resolveCourseAccess(studentUser, { strict: true }), { allowed: ["9702", "SAT"], primary: "9702", locked: false, isStaff: false });
// Adding SAT never removes physics (spec 4, amended): the class-based 9702
// default stays, grant or not.
// (a) unrecognised class "A1" + SAT grant -> 9702 and SAT.
scenario({ enrolments: { data: [{ class_id: "a1-1" }], error: null }, grants: satGrant });
assert.deepEqual(await resolveCourseAccess(studentUser, { strict: true }), { allowed: ["9702", "SAT"], primary: "9702", locked: false, isStaff: false });
scenario({ enrolments: { data: [{ class_id: "odd-1" }], error: null }, grants: satGrant });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, ["9702", "SAT"], "any unplaced class keeps 9702 beside the grant");
scenario({ enrolments: { data: [{ class_id: "odd-1" }], error: null } });
assert.deepEqual((await resolveCourseAccess(studentUser, { strict: true })).allowed, ["9702"], "without grants the default is kept");
// (b) no classes + SAT grant -> SAT only: covered above (no student row /
// no active enrolment + grant = ["SAT"]).
// (c) no classes, no grants: coursesForEnrolment answers 9702
// (test-subjects.mjs), but a student with no active enrolment at all never
// reaches it -- the hard gate still gives them no course.
scenario({ enrolments: noEnrolments });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, [], "no enrolment and no grant is still no course");
// (d) SAT-year class only + no grant -> SAT only (F10, unchanged): see the
// first scenario at the top of this file.
// (e) "AS" class + SAT grant -> 9702 and SAT.
scenario({ enrolments: { data: [{ class_id: "as-1" }], error: null }, grants: satGrant });
assert.deepEqual((await resolveCourseAccess(studentUser, { strict: true })).allowed, ["9702", "SAT"]);
scenario({ enrolments: { data: [{ class_id: "as-1" }], error: null }, grants: satGrant });
assert.deepEqual(await satAccess(studentUser), { ok: true, isStaff: false });
// SAT class + SAT grant -> SAT once.
scenario({ grants: satGrant });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, ["SAT"]);
// A physics grant record is ignored: physics only ever comes from a class.
scenario({ student: noStudentRow, grants: { ok: true, data: { grants: { physics: { by: "admin-1", at: "t" } }, history: [] } } });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, []);

// Strict (the SAT path): a failed grants read throws -> the SAT routes' 503.
scenario({ grants: FAILED });
await assert.rejects(resolveCourseAccess(studentUser, { strict: true }), /subjects/i, "a failed grants read");
scenario({ student: noStudentRow, grants: FAILED });
await assert.rejects(satAccess(studentUser), /subjects/i, "satAccess never reads a failed grants read as 'no SAT'");
// Non-strict (physics / Exam Lab callers): a failed grants read reads as no
// grants, so class-based access is exactly what it was before subjects.
scenario({ enrolments: { data: [{ class_id: "phy-1" }], error: null }, grants: FAILED });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, ["9702"]);
scenario({ enrolments: { data: [{ class_id: "odd-1" }], error: null }, grants: FAILED });
assert.deepEqual((await resolveCourseAccess(studentUser)).allowed, ["9702"], "the default still applies when grants can't be read");

// --- the grants store: fresh read -> write -> verify ---
/** An in-memory portal-data bucket; `failRead`/`failWrite`/`dropWrite` inject faults. */
function store(initial = {}, { failRead = false, failWrite = false, dropWrite = false } = {}) {
  const files = new Map(Object.entries(initial));
  const log = [];
  globalThis.__sat = {
    ...globalThis.__sat,
    storage: {
      read: async (bucket, path) => {
        log.push(`read ${bucket}/${path}`);
        if (failRead) return FAILED;
        return { ok: true, data: files.has(path) ? structuredClone(files.get(path)) : null };
      },
      write: async (bucket, path, value) => {
        log.push(`write ${bucket}/${path}`);
        if (failWrite) return false;
        if (!dropWrite) files.set(path, structuredClone(value));
        return true;
      },
    },
  };
  return { files, log };
}
const UID = "4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f";
const PATH = `subjects/${UID}.json`;

// Missing doc = empty grants; a failed read throws (fails closed).
store();
assert.deepEqual(await readGrants(UID), { grants: {}, history: [] });
store({}, { failRead: true });
await assert.rejects(readGrants(UID), /subjects/i);

// Grant on: read, write, then a verifying read.
let s = store();
let doc = await setGrant(UID, "sat", true, "admin-1");
assert.deepEqual(s.log, [`read portal-data/${PATH}`, `write portal-data/${PATH}`, `read portal-data/${PATH}`]);
assert.equal(doc.grants.sat.by, "admin-1");
assert.ok(!Number.isNaN(Date.parse(doc.grants.sat.at)));
assert.deepEqual(doc.history.map((h) => [h.subject, h.on, h.by]), [["sat", true, "admin-1"]]);
assert.deepEqual(await readGrants(UID), doc, "readGrants returns what was stored");
// Turning on what is already on changes nothing: no write, no history row,
// and the original grant (who, when) is kept.
s.log.length = 0;
assert.deepEqual(await setGrant(UID, "sat", true, "admin-9"), doc);
assert.deepEqual(s.log, [`read portal-data/${PATH}`], "a no-op is one read, no write");
// Grant off: the grant goes, the history keeps both events.
doc = await setGrant(UID, "sat", false, "admin-2");
assert.equal(doc.grants.sat, undefined);
assert.deepEqual(doc.history.map((h) => [h.on, h.by]), [[true, "admin-1"], [false, "admin-2"]]);

// History is capped at the newest 50 events.
const old = Array.from({ length: 50 }, (_, i) => ({ subject: "sat", on: i % 2 === 0, by: `a${i}`, at: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z` }));
store({ [PATH]: { grants: {}, history: old } });
doc = await setGrant(UID, "sat", true, "admin-3");
assert.equal(doc.history.length, 50);
assert.equal(doc.history[0].by, "a1", "the oldest event is dropped");
assert.equal(doc.history.at(-1).by, "admin-3");

// A failed read never becomes "no document" followed by a write.
s = store({ [PATH]: { grants: { sat: { by: "admin-1", at: "t" } }, history: [] } }, { failRead: true });
await assert.rejects(setGrant(UID, "sat", false, "admin-1"), /subjects/i);
assert.deepEqual(s.log, [`read portal-data/${PATH}`], "no write after a failed read");
// A failed write, or a write the verifying read doesn't see, throws.
store({}, { failWrite: true });
await assert.rejects(setGrant(UID, "sat", true, "admin-1"), /subjects/i);
store({}, { dropWrite: true });
await assert.rejects(setGrant(UID, "sat", true, "admin-1"), /subjects/i);

// Only direct-grant subjects, and only safe uids, ever reach storage.
s = store();
await assert.rejects(setGrant(UID, "physics", true, "admin-1"), /physics/i);
await assert.rejects(setGrant(UID, "chemistry", true, "admin-1"));
await assert.rejects(setGrant("../registry", "sat", true, "admin-1"));
await assert.rejects(setGrant("u1", "sat", true, "admin-1")); // too short for a uid
await assert.rejects(readGrants("a/b/c/d/e"));
assert.deepEqual(s.log, [], "nothing unsafe touched storage");

// A stored doc with stray entries is read back cleaned: unknown subjects,
// class-granted subjects and malformed history rows are dropped.
store({ [PATH]: { grants: { sat: { by: "admin-1", at: "t" }, physics: { by: "x", at: "t" }, chess: { by: "x", at: "t" } }, history: [{ subject: "sat", on: true, by: "admin-1", at: "t" }, { junk: 1 }, "nope"] } });
assert.deepEqual(await readGrants(UID), { grants: { sat: { by: "admin-1", at: "t" } }, history: [{ subject: "sat", on: true, by: "admin-1", at: "t" }] });
// A doc that isn't an object at all is unreadable, not empty.
store({ [PATH]: ["not", "a", "doc"] });
await assert.rejects(readGrants(UID), /subjects/i);

// --- switchSubject (admin route + account creation): grant, then notify on off -> on ---
const SAT_OPEN = { type: "sat", title: "SAT Lab is open for you", body: "Set your exam date and start your plan.", href: "/portal/sat-lab" };
s = store();
globalThis.__sat.notices = [];
doc = await switchSubject(UID, "sat", true, "admin-1");
assert.equal(doc.grants.sat.by, "admin-1");
assert.deepEqual(globalThis.__sat.notices, [{ target: { uids: [UID] }, input: SAT_OPEN }], "turning SAT on tells the student");
await switchSubject(UID, "sat", true, "admin-2");
assert.equal(globalThis.__sat.notices.length, 1, "already on: no second notice");
doc = await switchSubject(UID, "sat", false, "admin-1");
assert.equal(doc.grants.sat, undefined);
assert.equal(globalThis.__sat.notices.length, 1, "turning off sends nothing");
await switchSubject(UID, "sat", true, "admin-1");
assert.equal(globalThis.__sat.notices.length, 2, "re-opened later: told again");
// A failed save sends nothing and throws (the route answers 503).
store({}, { failWrite: true });
globalThis.__sat.notices = [];
await assert.rejects(switchSubject(UID, "sat", true, "admin-1"), /subjects/i);
assert.deepEqual(globalThis.__sat.notices, []);

console.log("sat-course-access tests passed");
