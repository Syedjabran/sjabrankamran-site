import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allLinks, breadcrumbFor, deskHomeOf, deskRoutes, findPages, finderEntries, homeSections, isTourHome, navigationFor,
  onDeskRoute, presentSteps, spaceIdForPath, studentSpacesSentence, TOUR_TARGETS, tourSteps,
} from "../src/lib/portal/portal-nav.ts";
import {
  ALL_ITEMS, SUBJECT_SPACES, helperForPath, itemForPath, portalItem, spaceForPath, spaceRoute, subjectOf,
} from "../src/lib/portal/subjects.ts";
import { helperPausedOnPath } from "../src/lib/ai/helper-pause-paths.ts";
import { PHYSICS_HELPER } from "../src/lib/portal/subject-helpers.ts";
import { countBadge, planLine, satGlance } from "../src/lib/portal/glance.ts";
import { isPortalAppPath } from "../src/lib/portal/portal-paths.ts";

// The subject-first navigation (Task 4 of the portal-v2 plan): the subject
// spaces, General and Administration, the desk roles' Home and fence, the
// breadcrumb, the page finder, the product tour's steps, the admin's
// Subjects line, the glances -- and every URL the old navigation, the app,
// emails and notifications used still opening a page.
// (scripts/test-subject-registry.mjs proves, for all 16,384 role x switch
// combinations, that the navigation reaches exactly what the old sidebar
// did, less Physics' own pages for a viewer who doesn't take Physics and
// Users & activity for a non-admin, whose page always refused them.)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const viewer = (roles, courses = [], practicalLab = false) => ({ roles, courses, practicalLab });
const names = (links) => links.map((l) => l.name).join(" | ");
const shape = (nav) => ({
  spaces: nav.spaces.map((s) => `${s.label}: ${names(s.modules)}`),
  general: names(nav.general),
  admin: names(nav.admin),
});
const ROLES = ["super_admin", "admin", "teacher", "teaching_assistant", "student", "parent", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"];

// --- what each kind of viewer sees -----------------------------------------------------

const physicsStudent = navigationFor(viewer(["student"], ["9702"]));
assert.deepEqual(shape(physicsStudent), {
  spaces: ["Physics: Exam Lab | Study plan | Answer scripts | Progress | Ranking | Leaderboard | Resources"],
  general: "My Learning | Timetable | Resource Library | Notifications | Search | Install App",
  admin: "",
});
assert.deepEqual(shape(navigationFor(viewer(["student"], ["5054", "SAT"], true))), {
  spaces: [
    "Physics: Exam Lab | Practical Lab | Study plan | Answer scripts | Progress | Ranking | Leaderboard | Resources",
    "Digital SAT: SAT Lab | Practice | Progress | Tutor | Settings",
  ],
  general: "My Learning | Timetable | Resource Library | Notifications | Search | Install App",
  admin: "",
}, "Practical Lab lives inside Physics, in registry order");
// A student who doesn't take Physics keeps its shared Class Drive (Physics
// Resources, in General, under its full name); Physics' own pages leave
// their navigation (the routes still open by URL).
const satOnly = navigationFor(viewer(["student"], ["SAT"]));
assert.deepEqual(shape(satOnly), {
  spaces: ["Digital SAT: SAT Lab | Practice | Progress | Tutor | Settings"],
  general: "My Learning | Timetable | Resource Library | Physics Resources | Notifications | Search | Install App",
  admin: "",
});
const PHYSICS_ONLY = ["exam-lab", "study-plan", "answer-scripts", "progress", "ranking", "leaderboard"];
for (const id of PHYSICS_ONLY) {
  assert.ok(!allLinks(satOnly).some((l) => l.id === id), `${id} is not in a SAT-only student's navigation`);
  assert.ok(!finderEntries(satOnly).some((e) => e.link.id === id), `nor in their finder: ${id}`);
}
// The lab switch with no physics class: a Physics card holding only the lab.
const labOnly = navigationFor(viewer(["student"], [], true));
assert.deepEqual(shape(labOnly), {
  spaces: ["Physics: Practical Lab"],
  general: "My Learning | Timetable | Resource Library | Physics Resources | Notifications | Search | Install App",
  admin: "",
});
// No course and no switch: no subject card, the shared page in General.
const noSubject = navigationFor(viewer(["student"]));
assert.deepEqual(noSubject.spaces, []);
assert.ok(noSubject.general.some((l) => l.id === "resources" && l.name === "Physics Resources"));
// A parent's Physics would hold only the shared Resources: no card, it's in General.
const parent = navigationFor(viewer(["parent"]));
assert.deepEqual(shape(parent), {
  spaces: [], general: "My Children | Timetable | Resource Library | Physics Resources | Search | Install App", admin: "",
});
// Staff with a Physics page of their own keep the space (Studio isn't shared).
assert.deepEqual(navigationFor(viewer(["finance_manager"])).spaces.map((s) => `${s.label}: ${names(s.modules)}`), ["Physics: Resources | Physics Studio"]);
// The coordinator desk keeps its own names; Home is the desk.
const coordinator = navigationFor(viewer(["coordinator"]));
assert.deepEqual(shape(coordinator), {
  spaces: ["Physics: Conduct class drill | Practical Lab | Resources"],
  general: "Timetable | Resource Library | Notifications | Search | Install App",
  admin: "Class staff desk | Assign drill | Daily attendance | Drill Records",
});
assert.equal(coordinator.home, null, "the desk had no Dashboard link");
assert.equal(coordinator.homeHref, "/portal/coordinator");
assert.equal(coordinator.deskHome, true);
const registrar = navigationFor(viewer(["attendance_registrar"]));
assert.deepEqual(shape(registrar), { spaces: [], general: "Timetable | Install App", admin: "Daily attendance" });
assert.equal(registrar.homeHref, "/portal/admin/attendance-view");
assert.equal(physicsStudent.homeHref, "/portal");
assert.equal(physicsStudent.deskHome, false);
// Admins see every subject and the whole Administration group, most used first.
const admin = navigationFor(viewer(["admin"]));
assert.deepEqual(shape(admin), {
  spaces: ["Physics: Exam Lab | Practical Lab | Resources | Syllabus coverage | Physics Studio", "Digital SAT: SAT Lab | Practice | Results"],
  general: "Timetable | Resource Library | Notifications | Search | Install App",
  admin: "My Classes | Post / Tests | Users & activity | Attendance | Daily attendance | Drill Records | Rankings & analytics | Institutions | Announcements | Email | Proctoring & Locks | Academics | Fees & Finance",
});
assert.ok(navigationFor(viewer(["super_admin"])).admin.some((l) => l.id === "access-locks"));
// A long group shows its first eight: a teacher's own classes are among them.
const teacher = navigationFor(viewer(["teacher"]));
assert.equal(teacher.admin.length, 9);
assert.ok(!teacher.admin.some((l) => l.id === "users"), "Users & activity is the admins' only, as its page and API are");
assert.ok(teacher.admin.slice(0, 8).some((l) => l.id === "classes"), "My Classes never folds away");
assert.ok(teacher.admin.slice(0, 8).some((l) => l.id === "post-work"));
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
// The SAT page is named as the page itself names it.
assert.equal(portalItem("sat-today").name, "SAT Lab");
assert.match(read("src/app/portal/(app)/sat-lab/page.tsx"), />SAT Lab</);

// --- home pages: the portal home and the desks show every destination -----------------

// Every combination: what a home page draws (cards, Administration, General),
// plus the top bar's Home and Profile, is everything the navigation offers --
// on a desk too (less that desk's own tile: it's the page they're on).
let homeChecks = 0;
for (let mask = 0; mask < 1 << ROLES.length; mask++) {
  const roles = ROLES.filter((_, i) => mask & (1 << i));
  for (const courses of [[], ["9702"], ["SAT"], ["9702", "SAT"]]) {
    for (const lab of [false, true]) {
      const nav = navigationFor(viewer(roles, courses, lab));
      const except = nav.deskHome ? nav.homeHref : undefined;
      const sections = homeSections(nav, except);
      const drawn = new Set([
        ...sections.spaces.flatMap((s) => s.modules.map((m) => `${m.id}@${m.href}`)),
        ...sections.admin.map((l) => `${l.id}@${l.href}`), ...sections.general.map((l) => `${l.id}@${l.href}`),
      ]);
      for (const link of allLinks(nav)) {
        const topBar = link === nav.home || link === nav.profile || link.href === except;
        assert.ok(drawn.has(`${link.id}@${link.href}`) || topBar, `${roles.join("+")} ${courses}: ${link.id} is a button on their home`);
      }
      // Desk roles land on their desk, which is also where Home goes.
      assert.equal(nav.deskHome, !!deskHomeOf(roles));
      if (nav.deskHome) assert.ok(onDeskRoute(nav.homeHref, deskRoutes(nav)), "the desk is inside its own fence");
      homeChecks++;
    }
  }
}
assert.equal(homeChecks, 4096 * 8);
for (const [file, desk] of [["src/app/portal/(app)/coordinator/page.tsx", "coordinator"], ["src/app/portal/(app)/admin/attendance-view/page.tsx", "daily-attendance"]]) {
  const src = read(file);
  assert.ok(src.includes("<DeskGroups nav={nav} />") && src.includes(`portalItem("${desk}").route`), `${file} shows the desk role's groups`);
}
assert.ok(read("src/app/portal/(app)/portal-home-nav.tsx").includes("<HomeGroups nav={nav} except={nav.homeHref} />"), "a desk leaves out its own tile");
assert.ok(read("src/app/portal/(app)/page.tsx").includes("<HomeGroups nav={nav} />"));

// --- the desk roles' fence ----------------------------------------------------------------

const fence = (nav, p) => onDeskRoute(p, deskRoutes(nav));
for (const nav of [coordinator, registrar, navigationFor(viewer(["facilitator"])), navigationFor(viewer(["coordinator", "student"], ["9702"], true))]) {
  for (const link of allLinks(nav)) assert.ok(fence(nav, link.href), `${link.href} is inside the desk fence`);
  for (const space of nav.spaces) assert.ok(fence(nav, space.href), `${space.href} too`);
  for (const p of ["/portal", "/portal/", "/portal/onboarding", "/portal/auth/callback", nav.homeHref]) assert.ok(fence(nav, p), `${p} is open to a desk role`);
  for (const p of ["/portal/admin/users", "/portal/admin/users/1", "/portal/admin/analytics", "/portal/progress", "/portal/nope", "/portal/admin/finance"]) {
    assert.equal(fence(nav, p), false, `${p} is outside the desk fence`);
  }
}
assert.ok(fence(coordinator, "/portal/subjects/physics"), "the coordinator desk's Physics space");
assert.equal(fence(coordinator, "/portal/subjects/sat"), false, "not a space they don't have");
assert.ok(fence(coordinator, "/portal/exam-lab?allocation=a1"), "Conduct class drill");
assert.ok(fence(coordinator, "/portal/admin/assign") && fence(coordinator, "/portal/admin/drills/D1/print"), "Assign drill and a drill's paper");
assert.ok(fence(registrar, "/portal/notifications"), "the bell's \"See all notifications\" opens for a registrar too");
assert.ok(fence(registrar, "/portal/timetable") && fence(registrar, "/portal/settings") && fence(registrar, "/portal/install"));
assert.equal(onDeskRoute("/portal/exam-lab", ["/portal"]), false, "the portal home is matched exactly, never as a prefix");
const layout = read("src/app/portal/(app)/layout.tsx");
assert.match(layout, /\(isRegistrarOnly\(user\.roles\) \|\| isCoordinatorOnly\(user\.roles\)\) && pathname && !onDeskRoute\(pathname, deskRoutes\(nav\)\)/);
assert.ok(layout.includes("redirect(nav.homeHref)"));
assert.ok(!layout.includes('pathname.startsWith(a + "/")'), "no prefix match on the portal home");

// The fence never blocks a page the portal's chrome links to. Every /portal
// link the chrome renders -- the top bar (brand/Home, switcher, finder,
// account menu), the bell (incl. "See all notifications"), the install card,
// the access-lock monitor, the blocked and archived screens, the onboarding
// gate -- read from its source, plus the links the chrome builds from the
// navigation (Home, spaces, every finder row, "Search everything"), passes
// every desk role's fence; a page outside it still doesn't.
const CHROME_FILES = [
  "portal-top-bar.tsx", "notification-bell.tsx", "portal-finder.tsx", "pwa-portal.tsx", "access-lock-monitor.tsx",
  "role-preview.tsx", "portal-product-tour.tsx", "presence-beacon.tsx", "portal-access-blocked.tsx", "layout.tsx",
].map((f) => `src/app/portal/(app)/${f}`);
const chromeLinks = new Set();
for (const f of CHROME_FILES) {
  for (const m of read(f).matchAll(/["'`](\/portal(?:\/[a-z0-9-]+)*)(?=[?#"'`/$])/g)) chromeLinks.add(m[1]);
}
for (const p of ["/portal", "/portal/settings", "/portal/notifications", "/portal/auth/signout", "/portal/onboarding"]) {
  assert.ok(chromeLinks.has(p), `the chrome's ${p} link was found in its source`);
}
const DESK_PERSONAS = {
  coordinator: ["coordinator"], facilitator: ["facilitator"], registrar: ["attendance_registrar"],
  "coordinator+registrar": ["coordinator", "attendance_registrar"], "facilitator+student": ["facilitator", "student"],
  "registrar+parent": ["attendance_registrar", "parent"],
};
for (const [persona, roles] of Object.entries(DESK_PERSONAS)) {
  for (const courses of [[], ["9702"], ["SAT"]]) {
    for (const lab of [false, true]) {
      const nav = navigationFor(viewer(roles, courses, lab));
      assert.ok(nav.deskHome, `${persona} is a desk role`);
      const search = nav.general.find((l) => l.id === "search")?.href;
      const links = [
        ...chromeLinks, nav.homeHref, ...nav.spaces.map((s) => s.href), ...finderEntries(nav).map((e) => e.link.href),
        ...(search ? [`${search}?q=waves`] : []),
      ];
      for (const href of links) {
        // Only the signed-in portal's pages are fenced (sign-in and the main website aren't).
        if (!isPortalAppPath(href)) continue;
        assert.ok(fence(nav, href), `${persona}: the chrome's ${href} passes the fence`);
      }
      for (const out of ["/portal/admin/users", "/portal/admin/analytics", "/portal/progress", "/portal/family", "/portal/admin/finance"]) {
        assert.equal(fence(nav, out), false, `${persona}: ${out} still redirects to the desk`);
      }
    }
  }
}
assert.equal(isPortalAppPath("/"), false, "Main website is outside the portal");

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
assert.equal(crumbs("/portal/sat-lab", navigationFor(viewer(["student"], ["SAT"]))), "Digital SAT</portal/subjects/sat> > SAT Lab");
assert.equal(crumbs("/portal/timetable"), "Timetable");
assert.equal(crumbs("/portal/tasks/42"), "Assigned task");
assert.equal(crumbs("/portal/admin/users/7", admin), "Administration > Users & activity");
assert.equal(crumbs("/portal/exam-lab", coordinator), "Physics</portal/subjects/physics> > Conduct class drill", "the desk's own name");
assert.equal(crumbs("/portal/exam-lab", satOnly), "Exam Lab", "a page opened by URL: no link to a space the viewer can't open");
assert.equal(crumbs("/portal/resources", satOnly), "Physics Resources", "a shared page outside its space reads its full name");
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
assert.equal(top("sat lab", navigationFor(viewer(["student"], ["SAT"]))), "SAT Lab");
assert.equal(top("physics", satOnly), "Physics Resources", "the shared page is found by its subject");
assert.equal(top("users", admin), "Users & activity");
assert.deepEqual(findPages(entries, "zzzz"), []);
assert.ok(findPages(entries, "PHYSICS").some((e) => e.link.href === "/portal/subjects/physics"), "case-insensitive; the space itself is a result");
const finder = read("src/app/portal/(app)/portal-finder.tsx");
assert.ok(finder.includes("onKeyDown={onInputKeyDown}"), "the list keys belong to the search box (Enter on a button does that button)");
assert.match(finder, /function onDialogKeyDown[\s\S]*?"Escape"[\s\S]*?"Tab"/, "Escape anywhere; Tab stays in the dialog");
assert.ok(finder.includes("opener.focus()"), "focus goes back when it closes");

// --- the top bar --------------------------------------------------------------------------

const topBar = read("src/app/portal/(app)/portal-top-bar.tsx");
for (const t of ["portal-home", "portal-switcher", "portal-finder", "portal-alerts", "portal-profile"]) assert.ok(topBar.includes(`data-tour="${t}"`), `the tour's ${t} target exists`);
assert.ok(topBar.includes("href={nav.homeHref}"), "the brand is Home (a desk role's desk)");
assert.ok(topBar.includes("PORTAL_NAME") && topBar.includes('href="/"'), "the brand, and the way back to the main website");
const manifest = read("src/app/manifest.ts");
assert.ok(manifest.includes("short_name: PORTAL_NAME") && manifest.includes("name: PORTAL_APP_NAME"), "the installed app's name is the portal's name");
assert.equal(read("src/lib/portal/brand.ts").includes('PORTAL_NAME = "Learning Portal"'), true);
assert.ok(!/role="menu"|role="menuitem"/.test(topBar), "disclosures, not ARIA menus without menu keys");
assert.ok(topBar.includes("buttonRef.current?.focus()"), "Escape gives focus back to the button");
assert.ok(topBar.includes('document.querySelector(".el-exam-live")'), "Ctrl+K never opens over a live sitting");
// The public site header steps aside inside the signed-in portal.
assert.ok(read("src/components/site-header.tsx").includes("if (isPortalAppPath(pathname)) return null;"));
for (const p of ["/portal", "/portal/", "/portal/exam-lab", "/portal/subjects/sat", "/portal/admin/users/1"]) assert.equal(isPortalAppPath(p), true, p);
for (const p of ["/", "/physics", "/portal/login", "/portal/login?next=%2Fportal", "/portal/reset", "/portal/auth/callback", "/portalx", "/lab/index.html"]) assert.equal(isPortalAppPath(p), false, p);

// --- the product tour -------------------------------------------------------------------

const targetsOf = (steps) => steps.map((s) => s.target);
const homeTour = tourSteps(physicsStudent, "/portal");
assert.equal(homeTour[0].target, null, "a welcome with no target first");
assert.ok(targetsOf(homeTour).includes(TOUR_TARGETS.space("physics")));
assert.ok(targetsOf(homeTour).includes(TOUR_TARGETS.general));
assert.ok(!targetsOf(homeTour).includes(TOUR_TARGETS.space("sat")), "no step for a space the viewer doesn't have");
assert.ok(!targetsOf(homeTour).includes(TOUR_TARGETS.admin), "no Administration step for a student");
assert.ok(targetsOf(tourSteps(admin, "/portal")).includes(TOUR_TARGETS.admin));
assert.ok(!targetsOf(homeTour).some((t) => t && /portal-navigation|data-portal-tour|group-more/.test(t)), "nothing points at the old sidebar or More");
// A desk: the tour walks the desk's groups there, and Home says it's the desk.
const deskTour = tourSteps(coordinator, "/portal/coordinator");
for (const t of [TOUR_TARGETS.space("physics"), TOUR_TARGETS.admin, TOUR_TARGETS.general]) assert.ok(targetsOf(deskTour).includes(t), `desk tour: ${t}`);
assert.match(deskTour.find((s) => s.target === TOUR_TARGETS.home).body, /desk/);
assert.match(homeTour.find((s) => s.target === TOUR_TARGETS.home).body, /subjects/);
// A space page walks that space's pages (with their registry purpose).
const spaceTour = tourSteps(physicsStudent, "/portal/subjects/physics");
const moduleSteps = spaceTour.filter((s) => s.target?.startsWith("[data-tour-module"));
assert.deepEqual(moduleSteps.map((s) => s.title), physicsStudent.spaces[0].modules.map((m) => m.name));
assert.equal(moduleSteps[0].body, portalItem("exam-lab").purpose);
assert.deepEqual(tourSteps(physicsStudent, "/portal/subjects/sat").filter((s) => s.target?.startsWith("[data-tour-module")), [], "not someone else's space");
// Other pages: the welcome and the top bar only.
assert.deepEqual(targetsOf(tourSteps(physicsStudent, "/portal/timetable")),
  [null, TOUR_TARGETS.home, TOUR_TARGETS.switcher, TOUR_TARGETS.finder, TOUR_TARGETS.alerts, TOUR_TARGETS.profile]);
assert.ok(!targetsOf(tourSteps(registrar, "/portal/admin/attendance-view")).includes(TOUR_TARGETS.switcher), "no switcher step without a space");
// The step filter drops a step whose control isn't on the page.
const onPage = new Set([TOUR_TARGETS.home, TOUR_TARGETS.finder]);
assert.deepEqual(targetsOf(presentSteps(homeTour, (t) => onPage.has(t))), [null, TOUR_TARGETS.home, TOUR_TARGETS.finder]);
// Where it may start by itself: a home page or a space -- never a sitting or a deep link into one.
assert.ok(isTourHome("/portal", physicsStudent) && isTourHome("/portal/", physicsStudent) && isTourHome("/portal/subjects/physics", physicsStudent));
assert.ok(isTourHome("/portal/coordinator", coordinator) && isTourHome("/portal/admin/attendance-view", registrar), "a desk is a home");
for (const p of ["/portal/sat-lab/s1", "/portal/exam-lab?allocation=a1", "/portal/exam-lab", "/portal/timetable", "/portal/coordinator"]) {
  assert.equal(isTourHome(p, physicsStudent), false, `no auto-start on ${p}`);
}
const tour = read("src/app/portal/(app)/portal-product-tour.tsx");
assert.ok(tour.includes("isTourHome(pathname, nav)") && tour.includes("#portal-content [aria-busy='true']") && tour.includes("document.fullscreenElement"),
  "auto-start waits for a home page's cards and never runs over a sitting");
// For every role combination, a step only ever points at something that
// viewer's home, desk, space or top bar draws.
let tourCombos = 0;
for (let mask = 0; mask < 1 << ROLES.length; mask++) {
  const roles = ROLES.filter((_, i) => mask & (1 << i));
  for (const courses of [[], ["9702"], ["SAT"], ["9702", "SAT"]]) {
    for (const lab of [false, true]) {
      const nav = navigationFor(viewer(roles, courses, lab));
      const sections = homeSections(nav, nav.deskHome ? nav.homeHref : undefined);
      const drawn = new Set([null, TOUR_TARGETS.home, TOUR_TARGETS.finder, TOUR_TARGETS.alerts, TOUR_TARGETS.profile]);
      if (nav.spaces.length) drawn.add(TOUR_TARGETS.switcher);
      for (const s of nav.spaces) drawn.add(TOUR_TARGETS.space(s.id));
      if (sections.general.length) drawn.add(TOUR_TARGETS.general);
      if (sections.admin.length) drawn.add(TOUR_TARGETS.admin);
      for (const p of ["/portal", nav.homeHref, "/portal/timetable"]) {
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
// The popover is the dark one, in both tours, and its small text is readable (fog on void, about 9:1).
const css = read("src/app/globals.css");
assert.ok(css.includes(".driver-popover.sjak-tour-popover"), "the dark popover style is scoped to the tour's class");
assert.match(css, /\.driver-popover-progress-text \{ color: #aeb8d8;/);
assert.match(css, /\.driver-popover-close-btn \{ top: 6px; right: 6px; color: #aeb8d8; \}/);
for (const f of ["src/app/portal/(app)/portal-product-tour.tsx", "src/components/landing-product-tour.tsx"]) {
  assert.ok(read(f).includes("popoverClass: TOUR_POPOVER_CLASS"), `${f} uses the dark popover`);
}

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
assert.ok(read("src/app/portal/(app)/admin/users/[id]/user-detail.tsx").includes("studentSpacesSentence("), "the Subjects card says which spaces the student sees");

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
// The home page reads the student's work and SAT settings together.
assert.match(read("src/app/portal/(app)/page.tsx"), /const \[work, satProfile\] = await Promise\.all\(\[/);

// --- the helper on the new pages -----------------------------------------------------------

assert.equal(helperForPath("/portal/subjects/sat"), null, "no Einstein in the SAT space (the SAT has its own tutor)");
assert.equal(helperForPath("/portal/subjects/physics"), PHYSICS_HELPER);
assert.equal(helperPausedOnPath("/portal/exam-lab"), true, "still hidden in the Exam Lab");
assert.equal(helperPausedOnPath("/portal/sat-lab/abc"), true, "and in the SAT Lab");

// --- the layout -----------------------------------------------------------------------------

assert.ok(!/PortalNavigation|menuFor|lg:grid-cols-\[13rem_1fr\]/.test(layout), "the sidebar is gone");
assert.match(layout, /\{embedded \? null : \(\s*<PortalTopBar/, "the app's WebView gets no top bar (it has its own chrome)");
assert.match(layout, /navigable=\{!mustOnboard\}/, "no navigation over the mandatory onboarding form");
assert.ok(!fs.existsSync(path.join(ROOT, "src/lib/portal/portal-menu.ts")), "no second menu list");
const homeNav = read("src/app/portal/(app)/portal-home-nav.tsx");
for (const t of ["data-tour-space={space.id}", "data-tour-module={link.id}", 'tour="group-general"', 'tour="group-admin"']) assert.ok(homeNav.includes(t), `home/space target ${t}`);
assert.ok(!/MoreGroup|group-more/.test(homeNav + read("src/app/portal/(app)/page.tsx")), "no More group");
assert.ok(!read("src/lib/portal/practical-lab-access.ts").includes("labInLearning"), "the old menu's lab rule is gone");

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
// The pages installed copies of the mobile app open, from its hardcoded menu
// and screens before it read its menu from /api/portal/navigation (frozen at
// 1a97310; the app now opens what that endpoint lists: test-app-nav.mjs).
const MOBILE = [
  "/portal/admin/attendance-view", "/portal/timetable", "/portal/coordinator", "/portal/admin/access", "/portal/admin/institutions",
  "/portal/admin/assign", "/portal/admin/attendance", "/portal/admin/proctoring", "/portal/admin/mail", "/portal/admin/notify",
  "/portal/admin/academics", "/portal/admin/finance", "/portal/teach", "/portal/exam-lab", "/portal/studio", "/portal/study-plan",
  "/portal/exam-lab/review", "/portal/progress", "/portal/my-ranking", "/portal/family", "/portal/admin/analytics", "/portal/learn",
];
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

// Every portal page (the one sync page, install, too) has its own route-level
// skeleton, so a navigation shows the page's shape at once instead of holding
// the old page.
const PORTAL_APP = path.join(ROOT, "src", "app", "portal", "(app)");
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "page.tsx") {
      assert.ok(fs.existsSync(path.join(dir, "loading.tsx")), `${path.relative(PORTAL_APP, dir) || "(home)"} has a loading.tsx`);
    }
  }
})(PORTAL_APP);
// Placeholders the review asked for: the Exam Lab's Assigned board and the Practical Lab frame.
assert.ok(read("src/components/exam-lab/papers-hub.tsx").includes("!allocationsLoaded ?"), "the Assigned board holds its place while it loads");
assert.ok(read("src/app/portal/(app)/practical-lab/page.tsx").includes("<LabFrame "), "the lab frame shows a placeholder until the lab loads");
assert.ok(!read("src/app/portal/(app)/onboarding/onboarding-form.tsx").includes("Loading…</div>"), "onboarding has one loader shape, not two");

console.log("portal navigation: all tests passed");
