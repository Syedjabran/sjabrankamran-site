import assert from "node:assert/strict";
import { register } from "node:module";

// course-access.ts and sat/access.ts import `@/lib/...` aliases that only the
// Next.js build resolves. This resolve hook maps `@/x` to src/x.ts and swaps
// the Supabase clients, the registry read and the timetable scope for stubs
// driven from globalThis, so the real enrolment logic runs under Node.
const SRC = new URL("../src/", import.meta.url).href;
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  // Next resolves "server-only" itself; under plain Node it is a no-op.
  "server-only": stub(""),
  "@/lib/supabase/admin": stub("export const createAdminClient = () => globalThis.__sat.db();"),
  "@/lib/supabase/server": stub("export const createClient = async () => { throw new Error('not used'); };"),
  "@/lib/portal/institutions": stub("export const getRegistry = async () => globalThis.__sat.registry();"),
  "@/lib/portal/timetable": stub("export const visibleClassIdsForUid = async () => [];"),
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

const REGISTRY = { updated_at: "x", schools: ["S"], classes: [{ id: "sat-1", year: "SAT 2026" }, { id: "phy-1", year: "A Level" }] };
const EMPTY_REGISTRY = { updated_at: "", schools: [], classes: [] };

/** One scenario: what each read returns, and a log of every read made. */
function scenario({ student = { data: { id: "st1" }, error: null }, enrolments = { data: [{ class_id: "sat-1" }], error: null }, registry = REGISTRY } = {}) {
  const reads = [];
  globalThis.__sat = {
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

const studentUser = { id: "u1", roles: ["student"] };
const failure = { data: null, error: { message: "connection reset" } };

// --- one enrolment lookup per access check (F3) ---
let reads = scenario();
assert.deepEqual(await resolveCourseAccess(studentUser), { allowed: ["SAT"], primary: "SAT", locked: true, isStaff: false });
assert.deepEqual(reads, ["edu_students", "edu_enrolments", "registry"], "exactly one student, enrolment and registry read");

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

console.log("sat-course-access tests passed");
