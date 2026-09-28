import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allLinks, breadcrumbFor, findPages, finderEntries, navigationFor, presentSteps, spaceIdForPath, studentSpacesSentence,
  TOUR_TARGETS, tourSteps,
} from "../src/lib/portal/portal-nav.ts";
import {
  ALL_ITEMS, SUBJECT_SPACES, helperForPath, itemForPath, portalItem, spaceForPath, spaceRoute, subjectOf,
} from "../src/lib/portal/subjects.ts";
import { helperPausedOnPath } from "../src/lib/ai/helper-pause-paths.ts";
import { PHYSICS_HELPER } from "../src/lib/portal/subject-helpers.ts";
import { countBadge, planLine, satGlance } from "../src/lib/portal/glance.ts";

// The subject-first navigation (Task 4 of the portal-v2 plan): the subject
// spaces, General / Administration / More, the breadcrumb, the page finder,
// the product tour's steps, the admin's Subjects line, the glances -- and
// every URL the old navigation, the app, emails and notifications used still
// opening a page. (scripts/test-subject-registry.mjs proves, for all 16,384
// role x switch combinations, that the navigation reaches exactly what the
// old sidebar did.)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const viewer = (roles, courses = [], practicalLab = false) => ({ roles, courses, practicalLab });
const names = (links) => links.map((l) => l.name).join(" | ");
const shape = (nav) => ({
  spaces: nav.spaces.map((s) => `${s.label}: ${names(s.modules)}`),
  general: names(nav.general),
  admin: names(nav.admin),
  more: nav.more.map((l) => `${l.name} (${l.space})`).join(" | "),
});

// --- what each kind of viewer sees -----------------------------------------------------

const physicsStudent = navigationFor(viewer(["student"], ["9702"]));
assert.deepEqual(shape(physicsStudent), {
  spaces: ["Physics: Exam Lab | Study plan | Answer scripts | Progress | Ranking | Leaderboard | Resources"],
  general: "My Learning | Timetable | Resource Library | Notifications | Search | Install App",
  admin: "",
  more: "",
});
assert.deepEqual(shape(navigationFor(viewer(["student"], ["5054", "SAT"], true))), {
  spaces: [
    "Physics: Exam Lab | Practical Lab | Study plan | Answer scripts | Progress | Ranking | Leaderboard | Resources",
    "Digital SAT: Today | Practice | Progress | Tutor | Settings",
  ],
  general: "My Learning | Timetable | Resource Library | Notifications | Search | Install App",
  admin: "",
  more: "",
}, "Practical Lab lives inside Physics, in registry order");
// A SAT-only student: the SAT space, and the physics pages the old menu gave
// every student one level down, under More (nothing reachable is lost).
const satOnly = navigationFor(viewer(["student"], ["SAT"]));
assert.deepEqual(shape(satOnly), {
  spaces: ["Digital SAT: Today | Practice | Progress | Tutor | Settings"],
  general: "My Learning | Timetable | Resource Library | Notifications | Search | Install App",
  admin: "",
  more: "Exam Lab (physics) | Study plan (physics) | Answer scripts (physics) | Progress (physics) | Ranking (physics) | Leaderboard (physics) | Resources (physics)",
});
// The lab switch with no physics class: a Physics card holding only the lab.
const labOnly = navigationFor(viewer(["student"], [], true));
assert.deepEqual(labOnly.spaces.map((s) => `${s.id}: ${names(s.modules)}`), ["physics: Practical Lab"]);
assert.ok(labOnly.more.every((l) => l.space === "physics" && l.id !== "practical-lab"));
// No course and no switch: no subject card; the old physics pages under More.
const noSubject = navigationFor(viewer(["student"]));
assert.deepEqual(noSubject.spaces, []);
assert.equal(noSubject.more.length, 7);
assert.deepEqual(shape(navigationFor(viewer(["parent"]))), {
  spaces: ["Physics: Resources"], general: "My Children | Timetable | Resource Library | Search | Install App", admin: "", more: "",
});
// The coordinator desk keeps its own names.
assert.deepEqual(shape(navigationFor(viewer(["coordinator"]))), {
  spaces: ["Physics: Conduct class drill | Practical Lab | Resources"],
  general: "Timetable | Resource Library | Notifications | Search | Install App",
  admin: "Assign drill | Drill Records | Daily attendance | Class staff desk",
  more: "",
});
assert.equal(navigationFor(viewer(["coordinator"])).home, null, "the desk had no Dashboard link (its home is the desk)");
assert.deepEqual(shape(navigationFor(viewer(["attendance_registrar"]))), {
  spaces: [], general: "Timetable | Install App", admin: "Daily attendance", more: "",
});
// Admins see every subject and the whole Administration group.
const admin = navigationFor(viewer(["admin"]));
assert.deepEqual(shape(admin), {
  spaces: ["Physics: Exam Lab | Practical Lab | Resources | Syllabus coverage | Physics Studio", "Digital SAT: Today | Practice | Results"],
  general: "Timetable | Resource Library | Notifications | Search | Install App",
  admin: "Users & activity | Rankings & analytics | Institutions | Post / Tests | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Announcements | Academics | Fees & Finance | My Classes",
  more: "",
});
assert.ok(navigationFor(viewer(["super_admin"])).admin.some((l) => l.id === "access-locks"));
// Home and Profile are the top bar's, never repeated in General.
for (const nav of [physicsStudent, satOnly, admin]) {
  assert.ok(nav.home && nav.profile);
  assert.ok(!nav.general.some((l) => l.id === "home" || l.id === "profile"));
}
// The study plan keeps its full page load; spaces link to their own page.
assert.equal(physicsStudent.spaces[0].modules.find((l) => l.id === "study-plan").hardNavigate, true);
assert.equal(physicsStudent.spaces[0].href, "/portal/subjects/physics");
// Unlisted pages are never a destination.
const every = navigationFor(viewer(["super_admin", "admin", "teacher", "student", "parent", "coordinator"], ["9702", "SAT"], true));
assert.ok(!allLinks(every).some((l) => portalItem(l.id).listed === false));

// --- subject spaces and where a page sits ------------------------------------------------

assert.deepEqual(SUBJECT_SPACES.map((s) => spaceRoute(s.id)), ["/portal/subjects/physics", "/portal/subjects/sat"]);
for (const s of SUBJECT_SPACES) assert.equal(spaceForPath(spaceRoute(s.id))?.id, s.id);
assert.equal(spaceForPath("/portal/subjects/practical-lab"), null, "Practical Lab has no space of its own");
assert.equal(spaceForPath("/portal/subjects/nope"), null);
assert.equal(spaceForPath("/portal/subjects/physics/extra"), null);
assert.equal(spaceForPath("/portal/subjects/SAT"), subjectOf("sat"), "case-insensitive, as the router");
assert.equal(itemForPath("/portal/subjects/sat")?.item.id, "subject-space", "the space page is described (title, breadcrumb)");
assert.equal(spaceIdForPath("/portal/exam-lab/review"), "physics");
assert.equal(spaceIdForPath("/portal/practical-lab"), "physics", "the lab is part of the Physics space");
assert.equal(spaceIdForPath("/portal/sat-lab/tutor"), "sat");
assert.equal(spaceIdForPath("/portal/subjects/sat"), "sat");
assert.equal(spaceIdForPath("/portal/timetable"), null);
assert.equal(spaceIdForPath("/portal"), null);

const crumbs = (p, nav = physicsStudent) => breadcrumbFor(p, nav).map((c) => c.href ? `${c.label}<${c.href}>` : c.label).join(" > ");
assert.equal(crumbs("/portal"), "");
assert.equal(crumbs("/portal/exam-lab"), "Physics</portal/subjects/physics> > Exam Lab");
assert.equal(crumbs("/portal/exam-lab/review?x=1"), "Physics</portal/subjects/physics> > Answer scripts");
assert.equal(crumbs("/portal/subjects/physics"), "Physics");
assert.equal(crumbs("/portal/timetable"), "Timetable");
assert.equal(crumbs("/portal/tasks/42"), "Assigned task");
assert.equal(crumbs("/portal/admin/users/7", admin), "Administration > Users & activity");
assert.equal(crumbs("/portal/exam-lab", navigationFor(viewer(["coordinator"]))), "Physics</portal/subjects/physics> > Conduct class drill", "the desk's own name");
assert.equal(crumbs("/portal/exam-lab", satOnly), "Exam Lab", "a More page: no link to a space the viewer can't open");
assert.equal(crumbs("/portal/sat-lab/progress", satOnly), "Digital SAT</portal/subjects/sat> > Progress");
assert.equal(crumbs("/portal/nowhere"), "");

// --- the finder -------------------------------------------------------------------------

const entries = finderEntries(physicsStudent);
assert.equal(findPages(entries, "").length, entries.length, "an empty query lists every destination");
assert.deepEqual([...new Set(entries.map((e) => e.group))], ["General", "Subjects", "Physics"], "grouped as the home page groups them");
const top = (q, nav = physicsStudent) => findPages(finderEntries(nav), q)[0]?.link.name;
assert.equal(top("exam"), "Exam Lab");
assert.equal(top("my study plan"), "Study plan", "old menu names still find their page");
assert.equal(top("physics resources"), "Resources");
assert.equal(top("dashboard"), "Home");
assert.equal(top("time"), "Timetable");
assert.equal(top("sat lab", navigationFor(viewer(["student"], ["SAT"]))), "Today");
assert.deepEqual(findPages(finderEntries(satOnly), "exam").map((e) => `${e.link.name}/${e.group}`)[0], "Exam Lab/More", "More pages are found too");
assert.equal(top("users", admin), "Users & activity");
assert.deepEqual(findPages(entries, "zzzz"), []);
assert.ok(findPages(entries, "PHYSICS").some((e) => e.link.href === "/portal/subjects/physics"), "case-insensitive; the space itself is a result");

// --- the product tour -------------------------------------------------------------------

const targetsOf = (steps) => steps.map((s) => s.target);
const homeTour = tourSteps(physicsStudent, "/portal");
assert.equal(homeTour[0].target, null, "a welcome with no target first");
assert.ok(targetsOf(homeTour).includes(TOUR_TARGETS.space("physics")));
assert.ok(!targetsOf(homeTour).includes(TOUR_TARGETS.space("sat")), "no step for a space the viewer doesn't have");
assert.ok(!targetsOf(homeTour).includes(TOUR_TARGETS.admin), "no Administration step for a student");
assert.ok(!targetsOf(homeTour).includes(TOUR_TARGETS.more));
assert.ok(targetsOf(tourSteps(admin, "/portal")).includes(TOUR_TARGETS.admin));
assert.ok(targetsOf(tourSteps(satOnly, "/portal")).includes(TOUR_TARGETS.more));
assert.ok(!targetsOf(homeTour).some((t) => t && /portal-navigation|data-portal-tour/.test(t)), "nothing points at the old sidebar");
// A space page walks that space's pages (with their registry purpose).
const spaceTour = tourSteps(physicsStudent, "/portal/subjects/physics");
const moduleSteps = spaceTour.filter((s) => s.target?.startsWith("[data-tour-module"));
assert.deepEqual(moduleSteps.map((s) => s.title), physicsStudent.spaces[0].modules.map((m) => m.name));
assert.equal(moduleSteps[0].body, portalItem("exam-lab").purpose);
assert.deepEqual(tourSteps(physicsStudent, "/portal/subjects/sat").filter((s) => s.target?.startsWith("[data-tour-module")), [], "not someone else's space");
// Other pages: the welcome and the top bar only.
assert.deepEqual(targetsOf(tourSteps(physicsStudent, "/portal/timetable")),
  [null, TOUR_TARGETS.home, TOUR_TARGETS.switcher, TOUR_TARGETS.finder, TOUR_TARGETS.alerts, TOUR_TARGETS.profile]);
assert.ok(!targetsOf(tourSteps(navigationFor(viewer(["attendance_registrar"])), "/portal")).includes(TOUR_TARGETS.switcher), "no switcher step without a space");
// The step filter drops a step whose control isn't on the page.
const onPage = new Set([TOUR_TARGETS.home, TOUR_TARGETS.finder]);
assert.deepEqual(targetsOf(presentSteps(homeTour, (t) => onPage.has(t))), [null, TOUR_TARGETS.home, TOUR_TARGETS.finder]);
// For every role combination, a step only ever points at something that
// viewer's navigation draws.
const ROLES = ["super_admin", "admin", "teacher", "teaching_assistant", "student", "parent", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"];
let tourCombos = 0;
for (let mask = 0; mask < 1 << ROLES.length; mask++) {
  const roles = ROLES.filter((_, i) => mask & (1 << i));
  for (const courses of [[], ["9702"], ["SAT"], ["9702", "SAT"]]) {
    for (const lab of [false, true]) {
      const nav = navigationFor(viewer(roles, courses, lab));
      const drawn = new Set([null, TOUR_TARGETS.home, TOUR_TARGETS.finder, TOUR_TARGETS.alerts, TOUR_TARGETS.profile]);
      if (nav.spaces.length) drawn.add(TOUR_TARGETS.switcher);
      for (const s of nav.spaces) drawn.add(TOUR_TARGETS.space(s.id));
      if (nav.general.length) drawn.add(TOUR_TARGETS.general);
      if (nav.admin.length) drawn.add(TOUR_TARGETS.admin);
      if (nav.more.length) drawn.add(TOUR_TARGETS.more);
      for (const p of ["/portal", "/portal/timetable"]) {
        for (const step of tourSteps(nav, p)) assert.ok(drawn.has(step.target), `${roles.join("+")}: ${step.target} is drawn`);
      }
      for (const s of SUBJECT_SPACES) {
        const own = nav.spaces.find((x) => x.id === s.id);
        const modules = new Set(own ? own.modules.map((m) => TOUR_TARGETS.module(m.id)) : []);
        for (const step of tourSteps(nav, spaceRoute(s.id))) {
          assert.ok(drawn.has(step.target) || modules.has(step.target), `${roles.join("+")} in ${s.id}: ${step.target} is drawn`);
        }
      }
      tourCombos++;
    }
  }
}
assert.equal(tourCombos, 4096 * 8);

// --- the admin's Subjects card ------------------------------------------------------------

assert.equal(studentSpacesSentence({ courses: ["9702"], practicalLab: false }), "Their home page shows Physics.");
assert.equal(studentSpacesSentence({ courses: ["5054", "SAT"], practicalLab: true }), "Their home page shows Physics (with Practical Lab) and Digital SAT.");
assert.equal(studentSpacesSentence({ courses: ["SAT"], practicalLab: false }), "Their home page shows Digital SAT.");
assert.equal(studentSpacesSentence({ courses: [], practicalLab: true }), "Their home page shows Physics (Practical Lab only).");
assert.equal(studentSpacesSentence({ courses: [], practicalLab: false }), "Their home page shows no subject yet: enrol them in a class or switch a subject on.");
// The sentence names exactly the spaces the student's own navigation shows.
for (const courses of [[], ["9702"], ["SAT"], ["5054", "SAT"]]) {
  for (const lab of [false, true]) {
    const sentence = studentSpacesSentence({ courses, practicalLab: lab });
    for (const s of SUBJECT_SPACES) {
      const shown = navigationFor(viewer(["student"], courses, lab)).spaces.some((x) => x.id === s.id);
      assert.equal(sentence.includes(s.label), shown, `${courses}/${lab}: ${s.label}`);
    }
  }
}
const detail = read("src/app/portal/(app)/admin/users/[id]/user-detail.tsx");
assert.ok(detail.includes("studentSpacesSentence("), "the Subjects card says which spaces the student sees");

// --- glances ----------------------------------------------------------------------------------

assert.equal(countBadge(0, "open"), null);
assert.equal(countBadge(2, "open"), "2 open");
assert.equal(planLine(0), null);
assert.equal(planLine(1), "1 study-plan activity to do");
assert.equal(planLine(3), "3 study-plan activities to do");
const sat = (examDate, targetMonth = null) => ({ examDate, targetMonth, targetScore: 1400 });
assert.equal(satGlance(undefined, "2026-09-28"), null, "an unreadable profile shows no line");
assert.equal(satGlance(null, "2026-09-28"), "Set up your SAT plan to begin.");
assert.equal(satGlance(sat("2026-10-28"), "2026-09-28"), "Exam in 30 days · target 1400");
assert.equal(satGlance(sat("2026-09-29"), "2026-09-28"), "Exam tomorrow · target 1400");
assert.equal(satGlance(sat("2026-09-28"), "2026-09-28"), "Exam today · good luck");
assert.equal(satGlance(sat("2026-09-01"), "2026-09-28"), "Your exam date has passed: update it in Settings.");
assert.equal(satGlance(sat(null, "2027-03"), "2026-09-28"), "Aiming for March 2027 · target 1400");
assert.equal(satGlance(sat(null), "2026-09-28"), "Aiming for 1400");

// --- the helper on the new pages -----------------------------------------------------------

assert.equal(helperForPath("/portal/subjects/sat"), null, "no Einstein in the SAT space (the SAT has its own tutor)");
assert.equal(helperForPath("/portal/subjects/physics"), PHYSICS_HELPER);
assert.equal(helperPausedOnPath("/portal/exam-lab"), true, "still hidden in the Exam Lab");
assert.equal(helperPausedOnPath("/portal/sat-lab/abc"), true, "and in the SAT Lab");

// --- the layout -----------------------------------------------------------------------------

const layout = read("src/app/portal/(app)/layout.tsx");
assert.ok(!/PortalNavigation|menuFor|lg:grid-cols-\[13rem_1fr\]/.test(layout), "the sidebar is gone");
assert.match(layout, /\{embedded \? null : \(\s*<PortalTopBar/, "the app's WebView gets no top bar (it has its own chrome)");
assert.match(layout, /navigable=\{!mustOnboard\}/, "no navigation over the mandatory onboarding form");
assert.ok(/const allowed = \["\/portal", "\/portal\/search", "\/portal\/subjects",/.test(layout), "the coordinator desk may open its subject spaces");
assert.ok(!fs.existsSync(path.join(ROOT, "src/lib/portal/portal-menu.ts")), "no second menu list");
const topBar = read("src/app/portal/(app)/portal-top-bar.tsx");
assert.ok(topBar.includes('data-tour="portal-home"') && topBar.includes('data-tour="portal-switcher"') && topBar.includes('data-tour="portal-finder"') && topBar.includes('data-tour="portal-alerts"') && topBar.includes('data-tour="portal-profile"'), "the tour's top-bar targets exist");
assert.ok(topBar.includes('document.querySelector(".el-exam-live")'), "Ctrl+K never opens over a live sitting");
const homeNav = read("src/app/portal/(app)/portal-home-nav.tsx");
for (const t of ["data-tour-space={space.id}", "data-tour-module={link.id}", 'data-tour="group-more"']) assert.ok(homeNav.includes(t), `home/space target ${t}`);
assert.ok(read("src/app/portal/(app)/page.tsx").includes('tour="group-general"') && read("src/app/portal/(app)/page.tsx").includes('tour="group-admin"'));
// The tour popover is the dark one (globals.css), in both tours.
const css = read("src/app/globals.css");
assert.ok(css.includes(".driver-popover.sjak-tour-popover"), "the dark popover style is scoped to the tour's class");
for (const f of ["src/app/portal/(app)/portal-product-tour.tsx", "src/components/landing-product-tour.tsx"]) {
  assert.ok(read(f).includes("popoverClass: TOUR_POPOVER_CLASS"), `${f} uses the dark popover`);
}

// --- every old URL still opens a page ---------------------------------------------------

// Page routes on disk, as patterns ("/portal/tasks/[id]").
const APP = path.join(ROOT, "src", "app");
const routes = [];
(function walk(dir, segs) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name]);
    else if (e.name === "page.tsx") routes.push(segs);
  }
})(APP, []);
const opens = (url) => {
  const segs = url.split(/[?#]/)[0].split("/").filter(Boolean);
  return routes.some((r) => r.length === segs.length && r.every((s, i) => /^\[[^\]]+\]$/.test(s) || s === segs[i].toLowerCase()));
};
assert.ok(opens("/portal/tasks/abc") && !opens("/portal/nope"), "the resolver itself");
// The old sidebar's links (frozen at 0646a86), the mobile app's portal pages,
// and the links emails and notifications carry.
const OLD_SIDEBAR = [
  "/portal", "/portal/search", "/portal/resources", "/portal/library", "/portal/timetable", "/portal/study-plan", "/portal/exam-lab",
  "/portal/exam-lab/review", "/portal/learn", "/portal/progress", "/portal/my-ranking", "/portal/leaderboard", "/portal/notifications",
  "/portal/install", "/portal/practical-lab", "/portal/sat-lab", "/portal/family", "/portal/admin/attendance-view", "/portal/coordinator",
  "/portal/admin/assign", "/portal/admin/drills", "/portal/admin/users", "/portal/admin/analytics", "/portal/admin/institutions",
  "/portal/admin/attendance", "/portal/admin/proctoring", "/portal/admin/mail", "/portal/teach", "/portal/sat-lab/results",
  "/portal/teach/syllabus", "/portal/studio", "/portal/admin/notify", "/portal/admin/academics", "/portal/admin/finance",
  "/portal/admin/access", "/portal/settings",
];
const mobileNav = read("mobile/src/nav/nav.ts");
const MOBILE = [...mobileNav.matchAll(/web\('(\/portal[^']*)'\)/g)].map((m) => m[1]);
assert.ok(MOBILE.length >= 10, "the app's portal pages were found");
const LINKED = [
  "/portal/exam-lab?allocation=a1", "/portal/tasks/t1", "/portal/learn/assignments/a1", "/portal/sat-lab/s1", "/portal/sat-lab/progress",
  "/portal/sat-lab/tutor", "/portal/sat-lab/settings", "/portal/sat-lab/setup", "/portal/sat-lab/results/u1/s1", "/portal/admin/users/u1",
  "/portal/library?thread=t1", "/portal/onboarding", "/portal/admin/drills/d1/print", "/portal/teach/c1", "/portal/teach/c1/attendance/l1",
  "/portal/admin/test-preview/t1", "/portal/admin/demo-student-access", "/portal/sat-lab#sat-practice",
];
for (const url of [...OLD_SIDEBAR, ...MOBILE, ...LINKED]) {
  assert.ok(opens(url), `${url} still opens a page`);
  assert.ok(itemForPath(url), `${url} still belongs to a described place (title, breadcrumb)`);
}
// Every registry route and every destination the new navigation offers opens a page.
for (const { item } of ALL_ITEMS) assert.ok(opens(item.route.replace(/\[[^\]]+\]/g, "x")), `${item.route} opens`);
for (const link of allLinks(every)) assert.ok(opens(link.href), `${link.href} opens`);
for (const s of SUBJECT_SPACES) assert.ok(opens(spaceRoute(s.id)), `${spaceRoute(s.id)} opens`);

// --- loaders ---------------------------------------------------------------------------

// Every portal page that reads data has its own route-level skeleton, so a
// navigation shows the page's shape at once instead of holding the old page.
const PORTAL_APP = path.join(ROOT, "src", "app", "portal", "(app)");
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "page.tsx" && /export default async function/.test(fs.readFileSync(p, "utf8"))) {
      assert.ok(fs.existsSync(path.join(dir, "loading.tsx")), `${path.relative(PORTAL_APP, dir) || "(home)"} has a loading.tsx`);
    }
  }
})(PORTAL_APP);

console.log("portal navigation: all tests passed");
