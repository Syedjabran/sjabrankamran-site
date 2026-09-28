import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire, register } from "node:module";

// Practical Lab (Task 2 of the portal-v2 plan): the pure access rules, the
// server-side check behind the portal page and nav, the grants store for the
// new subject, and the middleware's /lab gate itself.
//
// Same resolve hook as test-sat-course-access.mjs: `@/x` maps to src/x.ts and
// the Supabase clients, registry, timetable, notifications and fresh storage
// reads are stubs driven from globalThis.__lab. `@supabase/ssr` is stubbed
// too, so the real middleware runs under Node with a scripted Auth answer and
// a scripted fetch() for its service-role reads -- no network, no sign-in.
const SRC = new URL("../src/", import.meta.url).href;
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  "server-only": stub(""),
  "@supabase/ssr": stub("export const createServerClient = () => globalThis.__lab.supabase();"),
  "@/lib/supabase/admin": stub("export const createAdminClient = () => globalThis.__lab.db();"),
  "@/lib/supabase/server": stub(
    "export const createClient = async () => { throw new Error('not used'); };"
    + " export const bearerToken = async () => null;",
  ),
  "@/lib/portal/institutions": stub("export const getRegistry = async () => ({ updated_at: 'x', schools: [], classes: [{ id: 'phy-1', year: 'A Level' }] });"),
  "@/lib/portal/timetable": stub("export const visibleClassIdsForUid = async () => [];"),
  "@/lib/portal/notifications": stub("export const notify = async (target, input) => { globalThis.__lab.notices.push({ target, input }); return 1; };"),
  "@/lib/exam-lab/storage-fresh": stub([
    "export const readFreshJson = async (bucket, path) => globalThis.__lab.storage.read(bucket, path);",
    "export const writeFreshJson = async (bucket, path, value) => globalThis.__lab.storage.write(bucket, path, value);",
  ].join("\n")),
};
const hooks = `
const SRC = ${JSON.stringify(SRC)};
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) return next(new URL(specifier.slice(2) + ".ts", SRC).href, context);
  // next has no "exports" map, so plain Node ESM needs the file name.
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}`;
register(stub(hooks));
// Next's own Node runtime provides this global before any Next module loads;
// its build helpers (used below to compile the middleware matcher) need it.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;

const {
  LAB_ARCHIVED_MESSAGE, LAB_STAFF_ROLES, PRACTICAL_LAB, PRACTICAL_LAB_ENTRY, PRACTICAL_LAB_PAGE,
  archivedFrom, grantsReadFrom, isLabStaff, labAccess, labRefusalPage, labRequest,
} = await import("../src/lib/portal/practical-lab-access.ts");
const { EXAM_LAB_STAFF_ROLES } = await import("../src/lib/edu/auth.ts");
const { practicalLabAccess } = await import("../src/lib/portal/practical-lab.ts");
const { readGrants, setGrant } = await import("../src/lib/portal/subject-grants.ts");
const { switchSubject } = await import("../src/lib/portal/subject-admin.ts");
const { resolveCourseAccess } = await import("../src/lib/portal/course-access.ts");
const { ACCESS_CONTROL_BUCKET, ACCESS_CONTROL_PATH } = await import("../src/lib/portal/access-shared.ts");

// --- constants -----------------------------------------------------------------
assert.equal(PRACTICAL_LAB, "practical-lab");
assert.equal(PRACTICAL_LAB_PAGE, "/portal/practical-lab");
assert.equal(PRACTICAL_LAB_ENTRY, "/lab/index.html");
// The lab's staff are the Exam Lab staff (the pure edu/roles.ts list, which
// auth.ts re-exports and the middleware can import): the same five roles.
assert.deepEqual([...LAB_STAFF_ROLES].sort(), [...EXAM_LAB_STAFF_ROLES].sort());
assert.deepEqual([...LAB_STAFF_ROLES].sort(), ["admin", "coordinator", "facilitator", "super_admin", "teacher"]);

// --- the access matrix (labAccess) ---------------------------------------------
const ON = { ok: true, grants: { "practical-lab": { by: "admin-1", at: "t" } } };
const OFF = { ok: true, grants: {} };
const SAT_ONLY = { ok: true, grants: { sat: { by: "admin-1", at: "t" } } };
const FAILED_READ = { ok: false };
const STAFF = ["super_admin", "admin", "teacher", "coordinator", "facilitator"];
const NOT_STAFF = [[], ["student"], ["parent"], ["teaching_assistant"], ["counsellor"], ["content_manager"], ["finance_manager"], ["attendance_registrar"]];
for (const role of STAFF) {
  for (const grants of [ON, OFF, FAILED_READ]) {
    assert.equal(labAccess([role], grants), "allow", `${role} always has the lab`);
    assert.equal(labAccess(["student", role], grants), "allow", `student + ${role}`);
  }
  assert.equal(isLabStaff([role]), true);
}
for (const roles of NOT_STAFF) {
  const who = roles.join("+") || "(no role)";
  assert.equal(isLabStaff(roles), false, who);
  assert.equal(labAccess(roles, ON), "allow", `${who} with the switch on`);
  assert.equal(labAccess(roles, OFF), "deny", `${who} with the switch off`);
  assert.equal(labAccess(roles, SAT_ONLY), "deny", `${who}: SAT alone doesn't open the lab`);
  assert.equal(labAccess(roles, FAILED_READ), "unknown", `${who}: a failed grants read is never access`);
}
assert.equal(labAccess(null, ON), "unknown", "roles that couldn't be read decide nothing");
assert.equal(labAccess(null, OFF), "unknown");
assert.equal(labAccess(["student"], { ok: true, grants: { "practical-lab": undefined } }), "deny");

// (Where the navigation lists the lab -- once, inside Physics -- is tested in
// scripts/test-portal-nav.mjs.)

// --- the middleware's raw account-status read (archivedFrom) -------------------
assert.equal(archivedFrom(200, '[{"status":"archived"}]'), true);
assert.equal(archivedFrom(200, '[{"status":"active"}]'), false);
assert.equal(archivedFrom(200, '[{"status":"invited"}]'), false, "only archived is blocked, as in the portal layout");
assert.equal(archivedFrom(200, "[]"), false, "no profile row reads as active, as getPortalUser reads it");
assert.equal(archivedFrom(200, "[null]"), false);
assert.equal(archivedFrom(500, ""), null, "a failed read is unknown");
assert.equal(archivedFrom(401, "[]"), null);
assert.equal(archivedFrom(200, "<html>"), null, "a body that isn't JSON is unknown");
assert.equal(archivedFrom(200, '{"status":"active"}'), null, "a body that isn't a row list is unknown");

// --- the middleware's raw grants read (grantsReadFrom) -------------------------
const G = { by: "admin-1", at: "2026-09-27T10:00:00.000Z" };
assert.deepEqual(grantsReadFrom(200, JSON.stringify({ grants: { "practical-lab": G }, history: [] })), { ok: true, grants: { "practical-lab": G } });
assert.deepEqual(grantsReadFrom(200, JSON.stringify({ grants: { sat: G }, history: [] })), { ok: true, grants: { sat: G } });
assert.deepEqual(grantsReadFrom(200, JSON.stringify({ grants: { "practical-lab": { by: "x" } } })), { ok: true, grants: {} }, "a malformed row is no grant");
assert.deepEqual(grantsReadFrom(200, JSON.stringify({})), { ok: true, grants: {} });
assert.deepEqual(grantsReadFrom(200, "null"), { ok: true, grants: {} }, "a null doc is empty, as readFreshJson reads it");
assert.deepEqual(grantsReadFrom(404, "{}"), { ok: true, grants: {} }, "no doc = no grants");
assert.deepEqual(grantsReadFrom(400, '{"statusCode":"404","error":"not_found","message":"Object not found"}'), { ok: true, grants: {} }, "the older Storage API's missing object");
assert.deepEqual(grantsReadFrom(400, '{"statusCode":"400","message":"bad request"}'), { ok: false });
assert.deepEqual(grantsReadFrom(500, ""), { ok: false }, "a failed read fails closed");
assert.deepEqual(grantsReadFrom(403, "{}"), { ok: false });
assert.deepEqual(grantsReadFrom(200, "<html>"), { ok: false }, "a body that isn't JSON is unreadable");
assert.deepEqual(grantsReadFrom(200, "[1,2]"), { ok: false }, "a doc that isn't an object is unreadable");
assert.deepEqual(grantsReadFrom(200, '"text"'), { ok: false });

// --- which /lab requests get which check (labRequest) --------------------------
const page = (opens = null) => ({ kind: "page", opens });
const ASSET = { kind: "asset" };
assert.deepEqual(labRequest("/lab"), page("/lab/index.html"));
assert.deepEqual(labRequest("/lab/"), page("/lab/index.html"));
assert.deepEqual(labRequest("/lab/index.html"), page());
assert.deepEqual(labRequest("/lab/lab-room"), page("/lab/lab-room/index.html"));
assert.deepEqual(labRequest("/lab/lab-room/"), page("/lab/lab-room/index.html"));
assert.deepEqual(labRequest("/lab/lab-room/index.html"), page());
assert.deepEqual(labRequest("/lab/practicals/9702_m21_33-q1.html"), page());
assert.deepEqual(labRequest("/lab/INDEX.HTML"), page(), "case doesn't turn a page into an asset");
assert.deepEqual(labRequest("/lab/index.htm"), page());
assert.deepEqual(labRequest("/lab/index.htm%6C"), page(), "an encoded .html is still a page");
assert.deepEqual(labRequest("/lab/%E0%A4%A"), page(), "a path that won't decode gets the stricter check");
assert.deepEqual(labRequest("/lab/lib/live-bench.mjs"), ASSET);
assert.deepEqual(labRequest("/lab/lab-room/room.css"), ASSET);
assert.deepEqual(labRequest("/lab/lab-room/settings.json"), ASSET);
assert.deepEqual(labRequest("/lab/content/student-guides.json"), ASSET);
assert.deepEqual(labRequest("/lab/sources/9702_s21_qp_33.pdf"), ASSET);
assert.deepEqual(labRequest("/lab/lib/LIVE-BENCH.MJS"), ASSET);
// Only known sub-asset types get the cheap check: any other name is a page,
// so a lenient file system can't serve a page under the sign-in-only check.
for (const odd of ["/lab/index.html.", "/lab/index.html%20", "/lab/index.html;x", "/lab/index.html%00", "/lab/index.html::$DATA", "/lab/notes.txt", "/lab/index.html.bak"]) {
  assert.deepEqual(labRequest(odd), page(), odd);
}
// Any letter case of /lab is the lab (a case-insensitive file system serves it).
assert.deepEqual(labRequest("/Lab/index.html"), page());
assert.deepEqual(labRequest("/LAB"), page("/LAB/index.html"));
assert.deepEqual(labRequest("/%4Cab/lab-room/"), page("/Lab/lab-room/index.html"));
assert.deepEqual(labRequest("/LAB/lib/live-bench.mjs"), ASSET);
for (const outside of ["/", "/laboratory", "/labs/x.html", "/LABS/x.html", "/lab.html", "/portal/practical-lab", "/api/lab", "/x/lab/index.html"]) {
  assert.equal(labRequest(outside), null, outside);
}

// --- the refusal page ----------------------------------------------------------
const refusal = labRefusalPage(`Locked <script>alert("x")</script> & 'more'`);
assert.ok(refusal.includes("Locked &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;more&#39;"), "the message is escaped");
assert.ok(!refusal.includes("<script>"));
assert.ok(refusal.includes('href="/portal" target="_top"'), "the way back leaves the portal's frame");

// --- the server-side check (practicalLabAccess) --------------------------------
const UID = "4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f";
const GRANTS_PATH = `subjects/${UID}.json`;
/** An in-memory portal-data bucket plus a log of every read and write. */
function store(initial = {}, { failRead = false } = {}) {
  const files = new Map(Object.entries(initial));
  const log = [];
  globalThis.__lab = {
    ...globalThis.__lab,
    notices: [],
    storage: {
      read: async (bucket, path) => {
        log.push(`read ${bucket}/${path}`);
        if (failRead) return { ok: false };
        return { ok: true, data: files.has(path) ? structuredClone(files.get(path)) : null };
      },
      write: async (bucket, path, value) => {
        log.push(`write ${bucket}/${path}`);
        files.set(path, structuredClone(value));
        return true;
      },
    },
  };
  return { files, log };
}
const user = (roles) => ({ id: UID, email: "", fullName: "", roles, status: "active" });
const grantedDoc = { [GRANTS_PATH]: { grants: { "practical-lab": G }, history: [] } };

store(grantedDoc);
assert.deepEqual(await practicalLabAccess(user(["student"])), { ok: true, isStaff: false }, "switched on");
store();
assert.deepEqual(await practicalLabAccess(user(["student"])), { ok: false, isStaff: false }, "no doc: switched off");
store({ [GRANTS_PATH]: { grants: { sat: G }, history: [] } });
assert.deepEqual(await practicalLabAccess(user(["student"])), { ok: false, isStaff: false }, "SAT alone");
store(grantedDoc, { failRead: true });
await assert.rejects(practicalLabAccess(user(["student"])), /subjects/i, "a failed read throws: never access, never 'not switched on'");
for (const role of STAFF) {
  const s = store({}, { failRead: true });
  assert.deepEqual(await practicalLabAccess(user([role])), { ok: true, isStaff: true }, role);
  assert.deepEqual(s.log, [], `${role}: staff need no grants read`);
}
store();
assert.deepEqual(await practicalLabAccess(user(["parent"])), { ok: false, isStaff: false });

// --- the grants store and the admin switch for the new subject -----------------
let s = store();
let doc = await setGrant(UID, "practical-lab", true, "admin-1");
assert.equal(doc.grants["practical-lab"].by, "admin-1");
assert.deepEqual(s.log, [`read portal-data/${GRANTS_PATH}`, `write portal-data/${GRANTS_PATH}`, `read portal-data/${GRANTS_PATH}`]);
assert.deepEqual((await readGrants(UID)).grants, doc.grants, "stored like SAT's");
doc = await setGrant(UID, "sat", true, "admin-1");
assert.deepEqual(Object.keys(doc.grants).sort(), ["practical-lab", "sat"], "the two switches are independent");
doc = await setGrant(UID, "practical-lab", false, "admin-2");
assert.deepEqual(Object.keys(doc.grants), ["sat"]);
assert.deepEqual(doc.history.map((h) => [h.subject, h.on]), [["practical-lab", true], ["sat", true], ["practical-lab", false]]);

store();
doc = await switchSubject(UID, "practical-lab", true, "admin-1");
assert.equal(doc.grants["practical-lab"].by, "admin-1");
assert.deepEqual(globalThis.__lab.notices, [{
  target: { uids: [UID] },
  input: { type: "resource", title: "Practical Lab is open for you", body: "Try the 9702 practicals in the virtual lab.", href: "/portal/practical-lab" },
}], "turning the lab on tells the student where it is");
await switchSubject(UID, "practical-lab", true, "admin-2");
assert.equal(globalThis.__lab.notices.length, 1, "already on: no second notice");

// --- a lab grant opens no course (course access is unchanged) ------------------
/** Supabase stub for course-access: the student row and their enrolments. */
function enrolled(classIds) {
  globalThis.__lab.db = () => ({
    from(table) {
      const result = table === "edu_students"
        ? { data: classIds ? { id: "st1" } : null, error: null }
        : { data: (classIds || []).map((class_id) => ({ class_id })), error: null };
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result, then: (ok, fail) => Promise.resolve(result).then(ok, fail) };
      return chain;
    },
  });
}
store(grantedDoc);
enrolled(null);
assert.deepEqual((await resolveCourseAccess(user(["student"]))).allowed, [], "lab only: no course, so no Exam Lab");
store({ [GRANTS_PATH]: { grants: { "practical-lab": G, sat: G }, history: [] } });
assert.deepEqual((await resolveCourseAccess(user(["student"]))).allowed, ["SAT"], "lab + SAT: SAT only");
store(grantedDoc);
enrolled(["phy-1"]);
assert.deepEqual((await resolveCourseAccess(user(["student"]))).allowed, ["9702"], "lab + physics class: physics as before");

// --- the middleware's /lab gate --------------------------------------------------
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
const { NextRequest } = await import("next/server.js");
const { middleware, config } = await import("../src/middleware.ts");
// The matcher compiled exactly as Next compiles it: the middleware runs for
// /lab and everything under it in any letter case, and for nothing near it.
{
  const require = createRequire(import.meta.url);
  const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info.js");
  const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher.js");
  const runs = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
  const runsFor = (path) => runs(path, { headers: {} }, {});
  for (const path of ["/lab", "/lab/", "/lab/index.html", "/lab/lab-room/index.html", "/lab/lib/live-bench.mjs", "/Lab/index.html", "/LAB", "/lAb/lab-room/room.css"]) {
    assert.ok(runsFor(path), `the middleware runs for ${path}`);
  }
  for (const path of ["/laboratory", "/labs/x.html", "/lab.html", "/x/lab/index.html", "/"]) {
    assert.ok(!runsFor(path), `the middleware skips ${path}`);
  }
  // The other gates are unchanged.
  for (const path of ["/portal", "/portal/practical-lab", "/api/portal/me", "/api/exam-lab/x", "/api/sat/profile", "/api/lab/attempt", "/api/lab/view", "/api/lab/sample", "/api/lab/trial"]) {
    assert.ok(runsFor(path), `the middleware still runs for ${path}`);
  }
  assert.ok(!runsFor("/api/cron/daily-sat-plans"), "cron routes stay outside the middleware (their own CRON_SECRET gate)");
}

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl";
const COOKIE = "sb-stub-auth-token=session";
const LAB_STUDENT = "11111111-1111-4111-8111-111111111111";
/**
 * One scripted world for the middleware: who Auth says the caller is (a user
 * id, null for no session, or "throw"), their roles, their subjects doc (an
 * object, "missing" or an HTTP status), their account status (and the HTTP
 * status of that read) and the access-control doc. Every Auth call and fetch
 * is logged.
 */
function world({
  uid = LAB_STUDENT, roles = ["student"], grants = "missing", rolesStatus = 200,
  accountStatus = "active", profileStatus = 200, access = null, fetchThrows = false,
} = {}) {
  const log = [];
  globalThis.__lab.supabase = () => ({
    auth: {
      getUser: async (token) => {
        log.push(token ? `auth bearer ${token}` : "auth cookie");
        if (uid === "throw") throw new Error("auth down");
        return { data: { user: uid ? { id: uid } : null } };
      },
    },
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    log.push(`fetch ${url.pathname}`);
    if (fetchThrows) throw new Error("network down");
    if (url.pathname === "/rest/v1/edu_user_roles") {
      return new Response(JSON.stringify(roles.map((role) => ({ role }))), { status: rolesStatus });
    }
    if (url.pathname === "/rest/v1/edu_profiles") {
      assert.equal(url.searchParams.get("id"), `eq.${uid}`);
      assert.equal(url.searchParams.get("select"), "status");
      return new Response(JSON.stringify([{ status: accountStatus }]), { status: profileStatus });
    }
    if (url.pathname === `/storage/v1/object/portal-data/subjects/${uid}.json`) {
      assert.ok(url.searchParams.get("cb"), "the grants read is cache-busted");
      if (grants === "missing") return new Response('{"statusCode":"404","message":"Object not found"}', { status: 400 });
      if (typeof grants === "number") return new Response("", { status: grants });
      return new Response(JSON.stringify(grants), { status: 200 });
    }
    if (url.pathname === `/storage/v1/object/${ACCESS_CONTROL_BUCKET}/${ACCESS_CONTROL_PATH}`) {
      return access ? new Response(JSON.stringify(access), { status: 200 }) : new Response("", { status: 404 });
    }
    // Membership reads behind an active lock: nobody belongs to anything.
    return new Response("[]", { status: 200 });
  };
  return log;
}
const call = (path, headers = {}) => middleware(new NextRequest(`https://sjabrankamran.com${path}`, { headers }));
const passes = (res) => res.headers.get("x-middleware-next") === "1";
const location = (res) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};
const grantedLab = { grants: { "practical-lab": G }, history: [] };

// Signed out: pages go to login with a safe `next`; sub-assets get 401.
let log = world({ uid: null });
let res = await call("/lab/index.html");
assert.equal(res.status, 307);
assert.equal(location(res), "/portal/login?next=%2Flab%2Findex.html");
assert.deepEqual(log, [], "a signed-out visitor costs no network call");
res = await call("/lab");
assert.equal(location(res), "/portal/login?next=%2Flab%2Findex.html", "/lab (where /lab/ lands) logs in to the entry page");
res = await call("/lab/lab-room/index.html?experiment=9702_m22_33-q2");
assert.equal(location(res), "/portal/login?next=%2Flab%2Flab-room%2Findex.html%3Fexperiment%3D9702_m22_33-q2", "the room and its experiment survive sign-in");
res = await call("/lab/lib/live-bench.mjs");
assert.equal(res.status, 401);
assert.equal(res.headers.get("cache-control"), "no-store");
res = await call("/Lab/index.html");
assert.equal(location(res), "/portal/login?next=%2FLab%2Findex.html", "any letter case of /lab is gated");
log = world({ uid: null });
res = await call("/lab/index.html", { authorization: "Bearer garbage-token" });
assert.equal(location(res), "/portal/login?next=%2Flab%2Findex.html", "a non-JWT bearer is signed out");
assert.deepEqual(log, [], "and is never sent to Auth");
res = await call("/lab/index.html", { authorization: `Bearer ${JWT}` });
assert.equal(res.status, 307, "an invalid JWT is signed out too");

// Cookie session, switched on: the page opens; a directory opens its index.html.
log = world({ grants: grantedLab });
res = await call("/lab/index.html", { cookie: COOKIE });
assert.ok(passes(res), "granted student opens the lab");
assert.deepEqual(log.sort(), [
  "auth cookie", "fetch /rest/v1/edu_user_roles", "fetch /rest/v1/edu_profiles",
  `fetch /storage/v1/object/${ACCESS_CONTROL_BUCKET}/${ACCESS_CONTROL_PATH}`,
  `fetch /storage/v1/object/portal-data/subjects/${LAB_STUDENT}.json`,
].sort(), "one read each: the roles are read once and shared with the access-lock check");
res = await call("/lab", { cookie: COOKIE });
assert.equal(res.status, 307);
assert.equal(location(res), "/lab/index.html");
res = await call("/lab/lab-room/?experiment=9702_m22_33-q2", { cookie: COOKIE });
assert.equal(location(res), "/lab/lab-room/index.html?experiment=9702_m22_33-q2");

// Switched off / SAT only: refused with a plain page, not the lab.
for (const grants of ["missing", { grants: {}, history: [] }, { grants: { sat: G }, history: [] }]) {
  world({ grants });
  res = await call("/lab/index.html", { cookie: COOKIE });
  assert.equal(res.status, 403, JSON.stringify(grants));
  assert.match(await res.text(), /Practical Lab isn’t switched on for your account yet/);
  assert.equal(res.headers.get("cache-control"), "no-store");
}
world({ grants: { grants: {}, history: [] } });
assert.equal((await call("/lab/index.htm%6C", { cookie: COOKIE })).status, 403, "an encoded page name gets the full check");
assert.equal((await call("/lab/practicals/9702_m21_33-q1.html", { cookie: COOKIE })).status, 403, "every HTML page is gated");
assert.equal((await call("/Lab/index.html", { cookie: COOKIE })).status, 403, "another letter case is gated the same");
assert.equal((await call("/lab/index.html.", { cookie: COOKIE })).status, 403, "an odd name gets the full check, not the sign-in one");

// Staff always: no grants doc needed.
for (const role of STAFF) {
  world({ roles: [role], grants: "missing" });
  assert.ok(passes(await call("/lab/index.html", { cookie: COOKIE })), role);
}
world({ roles: ["teaching_assistant"], grants: "missing" });
assert.equal((await call("/lab/index.html", { cookie: COOKIE })).status, 403, "a teaching assistant is not lab staff");

// Fail closed: every read failure refuses (503), never opens.
for (const [label, w] of [
  ["grants read 500", { grants: 500 }],
  ["grants read 403", { grants: 403 }],
  ["roles read 500", { rolesStatus: 500, grants: grantedLab }],
  ["roles read 500, staff", { roles: ["admin"], rolesStatus: 500 }],
  ["account status read 500", { grants: grantedLab, profileStatus: 500 }],
  ["account status read 500, staff", { roles: ["admin"], profileStatus: 500 }],
  ["network down", { grants: grantedLab, fetchThrows: true }],
  ["Auth down", { uid: "throw", grants: grantedLab }],
]) {
  world(w);
  res = await call("/lab/index.html", { cookie: COOKIE });
  assert.equal(res.status, 503, label);
  assert.match(await res.text(), /couldn’t check your (access|sign-in) just now/, label);
}
world({ uid: "throw" });
assert.equal((await call("/lab/lib/live-bench.mjs", { cookie: COOKIE })).status, 503, "a sub-asset fails closed too");

// Sub-assets: sign-in only -- one Auth call, no role or grants reads.
log = world({ grants: "missing" });
res = await call("/lab/lib/live-bench.mjs", { cookie: COOKIE });
assert.ok(passes(res), "a signed-in user loads sub-assets");
assert.deepEqual(log, ["auth cookie"], "sub-assets cost one Auth call and nothing else");
world({ uid: null });
res = await call("/lab/lib/live-bench.mjs", { cookie: COOKIE });
assert.equal(res.status, 401, "an expired cookie session loads nothing");
res = await call("/lab/index.html", { cookie: COOKIE });
assert.equal(location(res), "/portal/login?next=%2Flab%2Findex.html");

// Bearer (native app, no cookie): the same gate.
log = world({ grants: grantedLab });
res = await call("/lab/index.html", { authorization: `Bearer ${JWT}` });
assert.ok(passes(res), "a granted bearer session opens the lab");
assert.ok(log.includes(`auth bearer ${JWT}`));
world({ grants: "missing" });
assert.equal((await call("/lab/index.html", { authorization: `Bearer ${JWT}` })).status, 403, "an ungranted bearer session is refused");
world({ grants: 500 });
assert.equal((await call("/lab/index.html", { authorization: `Bearer ${JWT}` })).status, 503);
world({ grants: "missing" });
assert.ok(passes(await call("/lab/room.css", { authorization: `Bearer ${JWT}` })), "bearer sub-assets: sign-in only");
// The cookie wins when both are sent (bearer.ts): an expired cookie is signed out.
log = world({ uid: null, grants: grantedLab });
res = await call("/lab/index.html", { cookie: COOKIE, authorization: `Bearer ${JWT}` });
assert.equal(res.status, 307);
assert.deepEqual(log, ["auth cookie"]);

// An access lock on the user: refused with the lock's own (escaped) message.
const now = new Date().toISOString();
const lock = {
  id: "lock-1", scopeType: "user", scopeKey: LAB_STUDENT, scopeLabel: "Student", classIds: [],
  startsAt: "2026-01-01T00:00:00.000Z", endsAt: null, createdAt: now, createdBy: "owner",
  releasedAt: null, releasedBy: null, mode: "locked", message: "Fees <due>",
};
world({ grants: grantedLab, access: { version: 1, updatedAt: now, restrictions: [lock] } });
res = await call("/lab/index.html", { cookie: COOKIE });
assert.equal(res.status, 423);
assert.match(await res.text(), /Fees &lt;due&gt;/);
world({ grants: grantedLab, accountStatus: "archived", access: { version: 1, updatedAt: now, restrictions: [lock] } });
assert.equal((await call("/lab/index.html", { cookie: COOKIE })).status, 423, "a lock is reported first, as in the portal layout");
// The lab API (/api/lab) is a portal API in the middleware: a lock refuses it
// with the portal's JSON; unlocked, the request reaches its route, which does
// the Practical Lab check itself (test-practical-lab-engine.mjs).
world({ grants: grantedLab, access: { version: 1, updatedAt: now, restrictions: [lock] } });
res = await call("/api/lab/sample", { cookie: COOKIE });
assert.equal(res.status, 423, "access locks apply to the lab API");
assert.equal((await res.json()).code, "PORTAL_ACCESS_RESTRICTED");
world({ grants: grantedLab });
assert.ok(passes(await call("/api/lab/sample", { cookie: COOKIE })), "unlocked: a lab API call reaches its route");

// The legacy "archived" status (the portal layout's "Access suspended"): refused
// whatever the switch or role says; "invited" is not blocked, as in the layout.
for (const [label, w] of [
  ["archived student, switch on", { grants: grantedLab, accountStatus: "archived" }],
  ["archived teacher", { roles: ["teacher"], accountStatus: "archived" }],
  ["archived super admin", { roles: ["super_admin"], accountStatus: "archived" }],
]) {
  world(w);
  res = await call("/lab/index.html", { cookie: COOKIE });
  assert.equal(res.status, 403, label);
  assert.ok((await res.text()).includes(LAB_ARCHIVED_MESSAGE), label);
  world(w);
  assert.equal((await call("/lab/index.html", { authorization: `Bearer ${JWT}` })).status, 403, `${label} (app session)`);
}
world({ grants: grantedLab, accountStatus: "invited" });
assert.ok(passes(await call("/lab/index.html", { cookie: COOKIE })), "an invited account with the switch opens the lab");

// --- nothing teacher-only is served from public/lab ------------------------------
// public/ is served to anyone the /lab gate lets through, and sub-assets only
// need a sign-in. The teacher guide (withholdFromStudents content) lives in
// src/content/lab, which the site never serves; nothing in the lab loads it.
{
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join, relative } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const LAB_DIR = join(ROOT, "public", "lab");
  const files = readdirSync(LAB_DIR, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name));
  assert.ok(files.length > 10, "the lab is where the test expects it");
  for (const file of files) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    assert.ok(!/teacher/i.test(rel), `${rel}: teacher-only files don't belong under public/lab`);
    if (/\.(?:json|mjs|js|html?|css)$/i.test(file)) {
      const text = readFileSync(file, "utf8");
      assert.ok(!text.includes("withholdFromStudents"), `${rel} carries content marked "withhold from students"`);
      assert.ok(!/"kind"\s*:\s*"teacher-guides"/.test(text), `${rel} is a teacher guide`);
      assert.ok(!/teacher-guides/.test(text), `${rel} refers to the teacher guide`);
    }
  }
  const moved = join(ROOT, "src", "content", "lab", "teacher-guides.json");
  assert.ok(existsSync(moved), "the teacher guide is kept, outside public/");
  const guide = JSON.parse(readFileSync(moved, "utf8"));
  assert.equal(guide.kind, "teacher-guides");
  assert.equal(guide.guides.length, 50);
  assert.ok(guide.guides.every((g) => Array.isArray(g.guidedMode?.withholdFromStudents)), "the moved file is the teacher-only one");
}

// Nothing else changed: portal pages and APIs behave as before.
world({ uid: null });
res = await call("/portal/practical-lab");
assert.equal(location(res), "/portal/login?next=%2Fportal%2Fpractical-lab");
res = await call("/portal/sat-lab");
assert.equal(location(res), "/portal/login?next=%2Fportal%2Fsat-lab");
assert.ok(passes(await call("/api/portal/admin/users")), "a signed-out API call still reaches its route (JSON 401 there)");
assert.ok(passes(await call("/api/lab/view")), "a signed-out lab API call reaches its route (JSON 401 there)");
assert.ok(passes(await call("/portal/login")), "the login page stays reachable");

// Portal deep links keep their query through sign-in, as /lab links do (final fix wave, M8):
// inside `next` only, and the login page still goes only to a same-site path.
{
  const { safeNextPath } = await import("../src/lib/request-guards.ts");
  const nextOf = (r) => new URL(r.headers.get("location")).searchParams.get("next");
  world({ uid: null });
  res = await call("/portal/exam-lab?allocation=a1b2c3");
  assert.equal(location(res), "/portal/login?next=%2Fportal%2Fexam-lab%3Fallocation%3Da1b2c3", "an allocation link survives sign-in");
  assert.equal(safeNextPath(nextOf(res)), "/portal/exam-lab?allocation=a1b2c3", "and the login page goes there");
  res = await call("/portal/exam-lab?course=5054&mode=paper");
  assert.equal(safeNextPath(nextOf(res)), "/portal/exam-lab?course=5054&mode=paper", "a course link too, every parameter kept");
  res = await call("/portal/learn?error=Wrong%20password");
  assert.equal(location(res), "/portal/login?next=%2Fportal%2Flearn%3Ferror%3DWrong%2520password", "the page's query never lands on the login page's own URL");
  res = await call("/portal");
  assert.equal(location(res), "/portal/login?next=%2Fportal", "no query, no '?'");
  // Open redirects stay refused: a hostile query is only a query on a portal page...
  res = await call("/portal/x?next=https://evil.example/&u=//evil.example");
  assert.equal(safeNextPath(nextOf(res)), "/portal/x?next=https://evil.example/&u=//evil.example");
  // ...and a hand-made `next` that leaves the site is refused by the login page.
  for (const evil of ["//evil.example/portal", "/\\evil.example", "https://evil.example/", "/\t/evil.example", "\\\\evil.example", "javascript:alert(1)"]) {
    assert.equal(safeNextPath(evil), "/portal", JSON.stringify(evil));
  }
}

console.log("practical-lab tests passed");
