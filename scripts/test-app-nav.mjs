import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NATIVE_SCREENS, APP_NAV_VERSION, appNavigation, modulesLine } from "../src/lib/portal/app-nav.ts";
import { allLinks, navigationFor } from "../src/lib/portal/portal-nav.ts";
import { itemEntry, portalItem, visibleItems } from "../src/lib/portal/subjects.ts";
import { PORTAL_NAME } from "../src/lib/portal/brand.ts";

// The mobile app's navigation (Task 5 of the portal-v2 plan): GET
// /api/portal/navigation hands the app the viewer's subject-first navigation,
// built from the registry's one visibility rule. What each kind of viewer
// gets, that it is exactly the portal's own navigation (every role x subject
// combination).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const viewer = (roles, courses = [], practicalLab = false) => ({ roles, courses, practicalLab });
const app = (roles, courses, lab, extra) => appNavigation(navigationFor(viewer(roles, courses, lab)), extra);
const ids = (places) => places.map((p) => p.id).join(" ");
const shape = (nav) => ({
  subjects: nav.subjects.map((s) => `${s.id}: ${ids(s.modules)}`),
  general: ids(nav.general),
  admin: ids(nav.admin),
});
const natives = (nav) => Object.fromEntries(
  [nav.home, ...nav.subjects.flatMap((s) => s.modules), ...nav.general, ...nav.admin, nav.profile]
    .filter((p) => p && p.native).map((p) => [p.id, p.native]),
);

// --- roles and subjects -> subjects and modules ----------------------------------------

const physics = app(["student"], ["9702"]);
assert.equal(physics.version, APP_NAV_VERSION);
assert.equal(physics.portalName, PORTAL_NAME);
assert.deepEqual(shape(physics), {
  subjects: ["physics: exam-lab study-plan answer-scripts progress ranking leaderboard resources"],
  general: "learning timetable library notifications search install",
  admin: "",
});
assert.deepEqual(natives(physics), {
  home: "home", leaderboard: "leaderboard", resources: "resources", learning: "learn", library: "library",
  notifications: "notifications", profile: "settings",
}, "a physics student's native screens; every other page opens in the WebView");
const [space] = physics.subjects;
assert.deepEqual(
  { id: space.id, name: space.name, shortName: space.shortName, icon: space.icon, accent: space.accent, route: space.route, native: space.native },
  { id: "physics", name: "Physics", shortName: "Physics", icon: "Atom", accent: "cyan", route: "/portal/subjects/physics", native: "subject" },
);
assert.equal(space.purpose, "Exam Lab, Study plan, Answer scripts and 4 more");
assert.deepEqual(space.modules[0], {
  id: "exam-lab", name: "Exam Lab", icon: "FlaskConical", route: "/portal/exam-lab",
  purpose: portalItem("exam-lab").purpose, native: null,
});

// SAT and the lab switch: Practical Lab inside Physics, the SAT's five pages in its space (all WebView).
const satLab = app(["student"], ["5054", "SAT"], true);
assert.deepEqual(shape(satLab).subjects, [
  "physics: exam-lab practical-lab study-plan answer-scripts progress ranking leaderboard resources",
  "sat: sat-today sat-practice sat-progress sat-tutor sat-settings",
]);
const sat = satLab.subjects[1];
assert.deepEqual([sat.name, sat.shortName, sat.icon, sat.accent], ["Digital SAT", "SAT", "GraduationCap", "violet"]);
assert.deepEqual(sat.modules.map((m) => m.route), [
  "/portal/sat-lab", "/portal/sat-lab#sat-practice", "/portal/sat-lab/progress", "/portal/sat-lab/tutor", "/portal/sat-lab/settings",
], "the SAT Lab, its coach's practice, progress, tutor and settings");
assert.ok(sat.modules.every((m) => m.native === null));
assert.equal(satLab.subjects[0].modules.find((m) => m.id === "practical-lab").route, "/portal/practical-lab");

// A student has only their own subjects: SAT-only sees no physics module,
// and keeps the shared Physics Resources in General under its full name.
const satOnly = app(["student"], ["SAT"]);
assert.deepEqual(shape(satOnly), {
  subjects: ["sat: sat-today sat-practice sat-progress sat-tutor sat-settings"],
  general: "learning timetable library resources notifications search install",
  admin: "",
});
assert.equal(satOnly.general.find((p) => p.id === "resources").name, "Physics Resources");
assert.deepEqual(shape(app(["student"], [], true)).subjects, ["physics: practical-lab"], "the lab switch alone: Physics holding only the lab");
assert.deepEqual(app(["student"], []).subjects, [], "no course, no switch: no subject");

// Staff: every subject; Administration most used first; the consoles the app draws natively.
const admin = app(["admin"], []);
assert.deepEqual(shape(admin), {
  subjects: ["physics: exam-lab practical-lab resources syllabus-coverage studio", "sat: sat-today sat-practice sat-results"],
  general: "timetable library notifications search install",
  admin: "classes post-work users attendance daily-attendance drill-records analytics institutions announcements email proctoring academics finance",
});
assert.equal(admin.admin.find((p) => p.id === "users").native, "users");
assert.equal(admin.admin.find((p) => p.id === "analytics").native, "rankings");
assert.ok(app(["super_admin"], []).admin.some((p) => p.id === "access-locks"));
assert.ok(!admin.admin.some((p) => p.id === "access-locks"), "access locks are the super admin's");

// The desk roles: their desk is Home, their navigation is cut down.
const coordinator = app(["coordinator"], []);
assert.deepEqual(shape(coordinator), {
  subjects: ["physics: exam-lab practical-lab resources"],
  general: "timetable library notifications search install",
  admin: "coordinator post-work daily-attendance drill-records",
});
assert.equal(coordinator.subjects[0].modules[0].name, "Conduct class drill", "the desk's own names");
assert.deepEqual([coordinator.home, coordinator.homeRoute, coordinator.deskHome], [null, "/portal/coordinator", true]);
const registrar = app(["attendance_registrar"], []);
assert.deepEqual(shape(registrar), { subjects: [], general: "timetable install", admin: "daily-attendance" });
assert.deepEqual([registrar.homeRoute, registrar.deskHome], ["/portal/admin/attendance-view", true]);
assert.deepEqual(shape(app(["parent"], [])), { subjects: [], general: "family timetable library resources search install", admin: "" });
assert.deepEqual([physics.homeRoute, physics.deskHome, physics.onboardingRoute, physics.subjectsUnavailable], ["/portal", false, null, false]);

// The flags the route passes through.
const flagged = app(["student"], [], false, { subjectsUnavailable: true, onboardingRoute: portalItem("onboarding").route });
assert.equal(flagged.subjectsUnavailable, true);
assert.equal(flagged.onboardingRoute, "/portal/onboarding");

// --- exactly the portal's navigation, for every role x subject combination ---------------

const ROLES = ["super_admin", "admin", "teacher", "teaching_assistant", "student", "parent", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"];
const COURSE_SETS = [[], ["9702"], ["5054", "SAT"], ["SAT"]];
let checked = 0;
for (let mask = 0; mask < 1 << ROLES.length; mask++) {
  const roles = ROLES.filter((_, i) => mask & (1 << i));
  for (const courses of COURSE_SETS) {
    for (const lab of [false, true]) {
      const facts = viewer(roles, courses, lab);
      const nav = navigationFor(facts);
      const out = appNavigation(nav);
      const places = [out.home, ...out.subjects.flatMap((s) => s.modules), ...out.general, ...out.admin, out.profile].filter(Boolean);
      // No second list: the app gets the portal's links, route for href, and nothing else.
      const portal = allLinks(nav).map((l) => `${l.id} ${l.href}`).sort();
      assert.deepEqual([...new Set(places.map((p) => `${p.id} ${p.route}`))].sort(), portal);
      assert.deepEqual(out.subjects.map((s) => s.id), nav.spaces.map((s) => s.id));
      // Only what the viewer may see: one of their visible items, or a shared
      // subject page the portal's General lists for them (Physics Resources).
      const visible = new Set(visibleItems(facts).map((e) => e.item.id));
      for (const p of places) {
        assert.ok(visible.has(p.id) || itemEntry(p.id).item.shared === true, `${p.id} is visible to ${roles.join("+") || "no role"}`);
        assert.ok(p.route.startsWith("/portal") && !p.route.startsWith("//"), `${p.id}: a portal path`);
        assert.equal(p.native, APP_NATIVE_SCREENS[p.id] ?? null);
      }
      checked++;
    }
  }
}
assert.equal(checked, 4096 * COURSE_SETS.length * 2);

// --- the reply ------------------------------------------------------------------------------

// Every native screen named is a real registry item.
for (const id of Object.keys(APP_NATIVE_SCREENS)) assert.ok(itemEntry(id), `${id} is a registry item`);
for (const nav of [physics, satLab, satOnly, admin, coordinator, registrar, flagged]) {
  assert.deepEqual(JSON.parse(JSON.stringify(nav)), nav, "the reply is plain JSON");
}

assert.equal(modulesLine([{ name: "A" }, { name: "B" }]), "A and B");
assert.equal(modulesLine([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }]), "A, B, C and 2 more");

// --- the endpoint ---------------------------------------------------------------------------

const route = read("src/app/api/portal/navigation/route.ts");
assert.ok(/getPortalUser\(\)/.test(route) && /status: 401/.test(route), "signed out: 401");
assert.ok(route.includes("viewerNav(user)") && route.includes("appNavigation(viewer.nav"), "built from the portal's own viewer navigation");
assert.ok(route.includes("getPortalRestriction(user)") && /status: 423/.test(route), "an access lock: 423, as the middleware answers");
assert.ok(/user\.status === "archived"/.test(route) && /status: 403/.test(route), "a suspended account gets no navigation");
assert.ok(route.includes('"cache-control": "no-store"'), "never cached: it is per viewer");
// Under /api/portal, so the middleware's access-lock gate runs for cookie AND Bearer callers.
const middleware = read("src/middleware.ts");
assert.ok(middleware.includes('pathname.startsWith("/api/portal")') && middleware.includes('"/api/portal/:path*"'));

console.log(`app navigation: all tests passed (${checked} viewer combinations)`);
