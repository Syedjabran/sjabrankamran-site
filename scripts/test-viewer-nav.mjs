import assert from "node:assert/strict";
import { register } from "node:module";

// A student's navigation when their subjects can't all be read (final fix
// wave, M2): the real viewerNav (viewer-nav.ts) -- which draws the website's
// navigation and, through appNavigation, the app's /api/portal/navigation --
// over the real course access, subject grants and Practical Lab check.
// When the strict read (the SAT's) fails, the student's class subjects
// (Physics) stay listed from the non-strict read every physics page uses;
// the SAT and the Practical Lab stay closed.
//
// The same resolve hook as test-sat-course-access.mjs: `@/x` maps to src/x.ts;
// the Supabase clients, the class registry, the fresh storage reads behind
// subject-grants.ts and the role preview are stubs driven from globalThis.__nav.
const SRC = new URL("../src/", import.meta.url).href;
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  "server-only": stub(""),
  "@/lib/supabase/admin": stub("export const createAdminClient = () => globalThis.__nav.db();"),
  "@/lib/supabase/server": stub(
    "export const createClient = async () => { throw new Error('not used'); };"
    + " export const bearerToken = async () => null;",
  ),
  "@/lib/portal/institutions": stub("export const getRegistry = async () => globalThis.__nav.registry();"),
  "@/lib/exam-lab/storage-fresh": stub([
    "export const readFreshJson = async (bucket, path) => globalThis.__nav.grants;",
    "export const writeFreshJson = async () => { throw new Error('navigation never writes'); };",
  ].join("\n")),
  "@/lib/portal/view-as": stub("export const effectiveRoles = async (user) => ({ roles: user.roles, previewing: null });"),
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

const { viewerNav } = await import("../src/lib/portal/viewer-nav.ts");
const { navigationCourses } = await import("../src/lib/portal/course-access.ts");
const { appNavigation } = await import("../src/lib/portal/app-nav.ts");
const { classGrantedCourses } = await import("../src/lib/portal/subjects.ts");

const REGISTRY = {
  updated_at: "x", schools: ["S"],
  classes: [{ id: "phy-1", year: "A Level" }, { id: "ol-1", year: "O Level" }, { id: "sat-1", year: "SAT 2026" }],
};
const EMPTY_REGISTRY = { updated_at: "", schools: [], classes: [] };
const FAILED = { ok: false };
const doc = (grants) => ({ ok: true, data: { grants, history: [] } });
const G = { by: "admin-1", at: "2026-09-01T00:00:00.000Z" };
const failure = { data: null, error: { message: "connection reset" } };
const enrolled = (...ids) => ({ data: ids.map((class_id) => ({ class_id })), error: null });

/** One student's reads: their edu_students row, active enrolments, the class
 *  registry and their subjects doc (the SAT and Practical Lab switches). */
function world({ student = { data: { id: "st1" }, error: null }, enrolments = enrolled("phy-1"), registry = REGISTRY, grants = doc({}) } = {}) {
  globalThis.__nav = {
    grants,
    registry: async () => registry,
    db: () => ({
      from(table) {
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
}
const student = { id: "4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f", email: "", fullName: "", roles: ["student"], status: "active" };
const spaces = (viewer) => viewer.nav.spaces.map((s) => `${s.id}: ${s.modules.map((m) => m.id).join(" ")}`);
const appSubjects = (viewer) => appNavigation(viewer.nav, { subjectsUnavailable: viewer.subjectsUnavailable }).subjects.map((s) => s.id);

assert.deepEqual(classGrantedCourses(["SAT", "5054", "9702"]), ["5054", "9702"], "only the class-granted subject's courses, in the order given");
assert.deepEqual(classGrantedCourses(["SAT"]), []);

// Every read answers: the strict course access decides, as before.
world({ enrolments: enrolled("phy-1"), grants: doc({ sat: G, "practical-lab": G }) });
let viewer = await viewerNav(student);
assert.deepEqual(spaces(viewer), [
  "physics: exam-lab practical-lab study-plan answer-scripts progress ranking leaderboard resources",
  "sat: sat-today sat-practice sat-progress sat-tutor sat-settings",
]);
assert.deepEqual([viewer.courseAccess?.allowed, viewer.subjectsUnavailable], [["9702", "SAT"], false]);

// The subjects doc can't be read (a Storage blip): the strict read fails, so the SAT and the
// lab stay closed -- but the physics class is still the student's Physics, on the web and in the app.
world({ enrolments: enrolled("phy-1", "sat-1"), grants: FAILED });
viewer = await viewerNav(student);
assert.deepEqual(spaces(viewer), ["physics: exam-lab study-plan answer-scripts progress ranking leaderboard resources"], "Physics stays; no SAT (not even from an SAT class), no lab");
assert.deepEqual([viewer.courseAccess, viewer.subjectsUnavailable], [null, true], "the strict read is not faked");
assert.deepEqual(appSubjects(viewer), ["physics"], "the app's navigation (/api/portal/navigation) lists the same");
assert.equal(appNavigation(viewer.nav, { subjectsUnavailable: viewer.subjectsUnavailable }).subjectsUnavailable, true);
assert.deepEqual(await navigationCourses(student), { access: null, courses: ["9702"] });

// An O Level class keeps its course.
world({ enrolments: enrolled("ol-1"), grants: FAILED });
assert.deepEqual(await navigationCourses(student), { access: null, courses: ["5054"] });
assert.deepEqual(spaces(await viewerNav(student)).map((s) => s.split(":")[0]), ["physics"]);

// The registry can't be read (an empty one): the non-strict read's long-standing A Level
// default applies, exactly as the physics pages themselves read it.
world({ enrolments: enrolled("ol-1"), registry: EMPTY_REGISTRY });
assert.deepEqual(await navigationCourses(student), { access: null, courses: ["9702"] });

// SAT only -- by grant or by class -- with the subjects doc unreadable: nothing opens.
world({ student: { data: null, error: null }, enrolments: enrolled(), grants: FAILED });
viewer = await viewerNav(student);
assert.deepEqual([viewer.nav.spaces, viewer.subjectsUnavailable], [[], true], "an SAT-by-grant student: no subject, and the home page says it couldn't be loaded");
world({ enrolments: enrolled("sat-1"), grants: FAILED });
viewer = await viewerNav(student);
assert.deepEqual([viewer.nav.spaces, viewer.subjectsUnavailable], [[], true], "an SAT class is no Physics");

// The enrolment read itself fails: the looser read finds nothing either.
world({ enrolments: failure, grants: doc({ sat: G }) });
viewer = await viewerNav(student);
assert.deepEqual([viewer.nav.spaces, viewer.courseAccess, viewer.subjectsUnavailable], [[], null, true]);

// Staff never read course access; nothing changes for them.
world({ grants: FAILED });
viewer = await viewerNav({ ...student, roles: ["teacher"] });
assert.deepEqual([viewer.nav.spaces.map((s) => s.id), viewer.courseAccess, viewer.subjectsUnavailable], [["physics", "sat"], null, false]);

console.log("viewer navigation: all tests passed");
