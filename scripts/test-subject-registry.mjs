import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCENT_CLASSES, ALL_ITEMS, CLASS_SUBJECTS, COURSES, DIRECT_SUBJECTS, GENERAL_ITEMS, GENERAL_WELCOME, STAFF_ITEMS, SUBJECTS,
  SUBJECT_SPACES, audiencesOf, canSee, courseBoardLabel, courseClassLabel, courseCodeLabel, courseOf, courseShortLabel,
  defaultHelper, helperForPath, itemForPath, itemForRoute, listed, portalItem, practiceItemOf, spaceModules, subjectOf,
  subjectsForCourses, viewerSubjects, visibleItems, welcomeIntro,
} from "../src/lib/portal/subjects.ts";
import { PHYSICS_HELPER, helperCurriculum } from "../src/lib/portal/subject-helpers.ts";
import { menuFor } from "../src/lib/portal/portal-menu.ts";
import { EXAM_LAB_SUBJECTS, examLabContext, examLabWorkLabel } from "../src/lib/portal/exam-lab-context.ts";
import { COURSE_LABEL, welcomeCourse } from "../src/lib/portal/course-labels.ts";
import { PRACTICAL_LAB_PAGE } from "../src/lib/portal/practical-lab-access.ts";
import { PORTAL_NAME } from "../src/lib/portal/brand.ts";

// The subject registry (Task 3 of the portal-v2 plan): its integrity, label
// resolution, the menu built from it, and the Exam Lab's subject/course context.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// --- registry integrity ----------------------------------------------------------

assert.deepEqual(SUBJECTS.map((s) => s.id), ["physics", "sat", "practical-lab"], "no subject was added or removed");
assert.equal(new Set(COURSES.map((c) => c.id)).size, COURSES.length, "course ids are unique");
for (const course of COURSES) assert.ok(subjectOf(course.subject), `${course.id} belongs to a subject`);
for (const subject of SUBJECTS) {
  assert.deepEqual(subject.courses, COURSES.filter((c) => c.subject === subject.id).map((c) => c.id), `${subject.id}: its courses are the registry's`);
  assert.ok(subject.label && subject.shortLabel, `${subject.id} is labelled`);
  assert.ok(ACCENT_CLASSES[subject.accent], `${subject.id}: accent ${subject.accent} has classes`);
  if (subject.partOf) assert.ok(subjectOf(subject.partOf) && !subjectOf(subject.partOf).partOf, `${subject.id} lives inside a top-level subject`);
  if (subject.practice) assert.equal(portalItem(subject.practice) && subject.modules.some((m) => m.id === subject.practice), true, `${subject.id}: its practice module is its own`);
  if (subject.examLab) {
    assert.ok(subject.examLab.courses.length, `${subject.id}: an Exam Lab has courses`);
    for (const c of subject.examLab.courses) assert.ok(subject.courses.includes(c), `${subject.id}: Exam Lab course ${c} is the subject's`);
  }
  const orders = subject.modules.map((m) => m.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), `${subject.id}: modules are listed in display order`);
}
assert.deepEqual(CLASS_SUBJECTS.map((s) => s.id), ["physics"]);
assert.deepEqual(DIRECT_SUBJECTS.map((s) => s.id), ["sat", "practical-lab"]);
assert.deepEqual(SUBJECT_SPACES.map((s) => s.id), ["physics", "sat"], "Practical Lab is shown inside Physics, not as a space");

// Every place is described once, under a unique id and page.
const EXPECTED_IDS = [
  "home", "search", "notifications", "learning", "timetable", "library", "family", "profile", "install", "onboarding", "task",
  "users", "access-locks", "analytics", "institutions", "post-work", "drill-records", "attendance",
  "daily-attendance", "proctoring", "email", "coordinator", "announcements", "academics", "finance", "classes",
  "demo-student-access",
  "exam-lab", "study-plan", "answer-scripts", "progress", "ranking", "leaderboard",
  "resources", "syllabus-coverage", "studio", "test-preview", "practical-lab",
  "sat-today", "sat-practice", "sat-progress", "sat-tutor", "sat-settings", "sat-results",
];
// Pages that are no destination (in no menu, finder or space), described so
// their title and breadcrumb resolve.
assert.deepEqual(ALL_ITEMS.filter((e) => e.item.listed === false).map((e) => e.item.id).sort(), ["demo-student-access", "onboarding", "task", "test-preview"]);
const ids = ALL_ITEMS.map((e) => e.item.id);
assert.equal(new Set(ids).size, ids.length, "item ids are unique");
assert.deepEqual([...ids].sort(), [...EXPECTED_IDS].sort(), "every PortalItemId is described");
const routes = ALL_ITEMS.map((e) => e.item.route);
assert.equal(new Set(routes).size, routes.length, "no two items open the same place");
assert.equal(ALL_ITEMS.length, SUBJECTS.reduce((n, s) => n + s.modules.length, 0) + GENERAL_ITEMS.length + STAFF_ITEMS.length);

// Every route is a real portal page (and a #section is a real id on it).
const sourceFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) sourceFiles.push(p);
  }
})(SRC);
for (const { item } of ALL_ITEMS) {
  const [page, section] = item.route.split("#");
  assert.match(page, /^\/portal(\/([a-z0-9-]+|\[[A-Za-z]+\]))*$/, `${item.id}: a plain portal path (or a [param] page)`);
  const file = path.join(SRC, "app", "portal", "(app)", page.slice("/portal".length), "page.tsx");
  assert.ok(fs.existsSync(file), `${item.id}: ${page} is a page (${path.relative(ROOT, file)})`);
  if (section) assert.ok(sourceFiles.some((f) => fs.readFileSync(f, "utf8").includes(`id="${section}"`)), `${item.id}: #${section} exists`);
}
assert.equal(portalItem("practical-lab").route, PRACTICAL_LAB_PAGE, "the registry and the lab gate name one page");

// Icons are real lucide-react exports; text is plain and one line.
const lucide = read("node_modules/lucide-react/dist/lucide-react.d.ts");
const AUDIENCES = new Set(["everyone", "member", "registrar-desk", "coordinator-desk", "student", "parent", "staff", "admin", "super-admin", "coordinator", "class-teacher", "drill-staff", "exam-lab-staff"]);
for (const icon of [...SUBJECTS.map((s) => s.icon), ...ALL_ITEMS.map((e) => e.item.icon)]) {
  assert.ok(lucide.includes(`declare const ${icon}:`), `lucide-react has ${icon}`);
}
for (const { item } of ALL_ITEMS) {
  for (const text of [item.name, item.menuLabel, item.purpose]) assert.ok(text && text.trim() === text, `${item.id}: text is set`);
  assert.ok(!item.purpose.includes("\n") && item.purpose.length <= 110 && item.purpose.endsWith("."), `${item.id}: purpose is one short sentence`);
  assert.ok(item.access.length && item.access.every((a) => AUDIENCES.has(a)), `${item.id}: access names known audiences`);
}
// Places outside any subject never name one -- except the timetable's
// menu label, today's "Physics timetable", kept until the subject-first
// navigation renames it (Task 4's rename map: "Physics timetable" -> "Timetable").
const subjectWords = new RegExp(`\\b(${[...SUBJECTS.flatMap((s) => [s.label, s.shortLabel]), ...COURSES.flatMap((c) => [c.level, c.code ?? c.level])].join("|")})\\b`, "i");
const KEPT_UNTIL_TASK_4 = new Set(["timetable:Physics timetable"]);
for (const { item } of [...GENERAL_ITEMS.map((item) => ({ item })), ...STAFF_ITEMS.map((item) => ({ item }))]) {
  for (const text of [item.name, item.menuLabel, item.purpose, item.deskLabel ?? ""]) {
    if (KEPT_UNTIL_TASK_4.has(`${item.id}:${text}`)) continue;
    assert.doesNotMatch(text, subjectWords, `${item.id} is subject-free: "${text}"`);
  }
}
assert.equal(portalItem("timetable").name, "Timetable", "the timetable's own name is already subject-free");

// Every portal page belongs to a described place (breadcrumbs, titles), and a
// page's tab title is never a second copy of its registry name.
const APP = path.join(SRC, "app", "portal", "(app)");
const pageFiles = sourceFiles.filter((f) => f.startsWith(APP) && path.basename(f) === "page.tsx");
assert.ok(pageFiles.length >= 50, "every portal page was found");
for (const file of pageFiles) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).join("/");
  const pattern = rel ? `/portal/${rel}` : "/portal";
  const example = pattern.replace(/\[[^\]]+\]/g, "x");
  assert.ok(itemForPath(example), `${pattern} belongs to a registry item`);
  const own = ALL_ITEMS.find((e) => e.item.route.split("#")[0] === pattern)?.item;
  if (own) assert.ok(!fs.readFileSync(file, "utf8").includes(`title: ${JSON.stringify(own.menuLabel)}`), `${pattern}: its title reads the registry, not a copy of "${own.menuLabel}"`);
}

// The registry is pure: the middleware, client components and Node import it.
for (const rel of ["src/lib/portal/subjects.ts", "src/lib/portal/subject-helpers.ts", "src/lib/portal/portal-menu.ts", "src/lib/portal/exam-lab-context.ts", "src/lib/portal/course-labels.ts", "src/lib/edu/roles.ts"]) {
  const text = read(rel);
  assert.doesNotMatch(text, /from "@\//, `${rel} has no @/ imports`);
  assert.doesNotMatch(text, /server-only|from "react"|from "next/, `${rel} has no server or React imports`);
}

// --- label resolution --------------------------------------------------------------

assert.deepEqual(COURSE_LABEL, { "9702": "Cambridge A Level Physics · 9702", "5054": "Cambridge O Level Physics · 5054", SAT: "Digital SAT" }, "course names are unchanged");
assert.equal(courseShortLabel(courseOf("9702")), "A Level · 9702");
assert.equal(courseShortLabel(courseOf("5054")), "O Level · 5054");
assert.equal(courseShortLabel(courseOf("SAT")), "Digital SAT");
assert.equal(courseCodeLabel(courseOf("9702")), "A Level 9702");
assert.equal(courseClassLabel(courseOf("5054")), "O Level (5054)");
assert.equal(courseOf("nope"), null);
assert.deepEqual(subjectsForCourses(["9702"]), ["physics"]);
assert.deepEqual(subjectsForCourses(["5054", "SAT"]), ["physics", "sat"]);
assert.deepEqual(subjectsForCourses([]), [], "Practical Lab opens no course, so no course names it");
assert.equal(listed(["A"]), "A");
assert.equal(listed(["A", "B"], "or"), "A or B");
assert.equal(listed(["A", "B", "C"]), "A, B and C");

// The labels today's pages show, now read from the registry.
assert.equal(portalItem("timetable").menuLabel, "Physics timetable");
assert.equal(portalItem("resources").menuLabel, "Physics Resources");
assert.equal(portalItem("exam-lab").name, "Exam Lab");
assert.equal(portalItem("sat-today").menuLabel, "SAT Lab");
assert.equal(portalItem("study-plan").hardNavigate, true);

// Where a path belongs (breadcrumbs, the helper, the tour).
const at = (p) => { const e = itemForPath(p); return e && `${e.subject?.id ?? e.group}/${e.item.id}`; };
assert.equal(at("/portal"), "general/home");
assert.equal(at("/portal/"), "general/home");
assert.equal(at("/portal/exam-lab"), "physics/exam-lab");
assert.equal(at("/portal/exam-lab?allocation=a1"), "physics/exam-lab");
assert.equal(at("/portal/exam-lab/review"), "physics/answer-scripts", "the longest page wins");
assert.equal(at("/portal/sat-lab"), "sat/sat-today", "two items on one page: the page is named after the first");
assert.equal(at("/portal/sat-lab/abc123"), "sat/sat-today");
assert.equal(at("/portal/sat-lab/results/u1/s1"), "sat/sat-results");
assert.equal(at("/portal/admin/users/42"), "staff/users");
assert.equal(at("/portal/practical-lab"), "practical-lab/practical-lab");
assert.equal(at("/portal/tasks/9"), "general/task", "a [param] page matches any value");
assert.equal(at("/portal/admin/test-preview/ct1"), "physics/test-preview");
assert.equal(at("/portal/onboarding"), "general/onboarding");
assert.equal(at("/portal/admin/demo-student-access"), "staff/demo-student-access");
assert.equal(at("/portal/timetable"), "general/timetable", "the timetable is class-based: every subject's");
assert.equal(at("/portal/nope"), null, "the home page doesn't claim every portal path");
assert.equal(at("/physics"), null);
assert.equal(at(null), null);
assert.equal(itemForRoute("/portal/timetable")?.id, "timetable");
assert.equal(itemForRoute("/portal/timetable/x"), null);

// The helper persona follows the page's subject.
assert.equal(defaultHelper(), PHYSICS_HELPER);
assert.equal(helperForPath("/portal/timetable"), PHYSICS_HELPER);
assert.equal(helperForPath("/portal/practical-lab"), PHYSICS_HELPER, "a subject inside Physics shows Physics' helper");
assert.equal(helperForPath("/portal/sat-lab/tutor"), null, "the SAT has its own tutor, not Einstein");
assert.equal(helperForPath("/portal/learn"), PHYSICS_HELPER, "pages outside a subject use the first subject's helper");
assert.equal(helperForPath("/physics-studio"), PHYSICS_HELPER);
assert.equal(PHYSICS_HELPER.greetings[1], "Stuck on a physics problem? Ask me.");
assert.equal(PHYSICS_HELPER.curricula[0], "A-Level", "the default curriculum is unchanged");

// A subject's space: its modules plus those shown inside it, by order.
assert.deepEqual(spaceModules("physics").map((m) => m.module.id), [
  "exam-lab", "practical-lab", "study-plan", "answer-scripts", "progress", "ranking", "leaderboard",
  "resources", "syllabus-coverage", "studio",
], "unlisted pages (the test preview) are in no space");
assert.deepEqual(spaceModules("sat").map((m) => m.module.id), ["sat-today", "sat-practice", "sat-progress", "sat-tutor", "sat-settings", "sat-results"]);
assert.equal(practiceItemOf(subjectOf("sat")).menuLabel, "SAT Lab");

// --- today's menu, built from the registry ------------------------------------------

// Captured from the portal layout's own navFor before the registry described
// it (branch portal-v2 at 0646a86): the label -> link legend, then each
// persona's sections ("Title: a | b*", * = full page load).
const LEGACY_HREF = {
  "Search": "/portal/search", "Dashboard": "/portal", "Physics Resources": "/portal/resources", "Resource Library": "/portal/library",
  "Physics timetable": "/portal/timetable", "My study plan": "/portal/study-plan", "Exam Lab": "/portal/exam-lab",
  "My answer scripts": "/portal/exam-lab/review", "My Learning": "/portal/learn", "My Progress": "/portal/progress",
  "My Ranking": "/portal/my-ranking", "Leaderboard": "/portal/leaderboard", "Notifications": "/portal/notifications",
  "Install App": "/portal/install", "Practical Lab": "/portal/practical-lab", "SAT Lab": "/portal/sat-lab", "My Children": "/portal/family",
  "Daily attendance": "/portal/admin/attendance-view", "Class staff desk": "/portal/coordinator", "Conduct class drill": "/portal/exam-lab",
  "Assign drill": "/portal/admin/assign", "Drill Records": "/portal/admin/drills", "Users & activity": "/portal/admin/users",
  "Rankings & analytics": "/portal/admin/analytics", "Institutions": "/portal/admin/institutions", "Post / Tests": "/portal/admin/assign",
  "Attendance": "/portal/admin/attendance", "Proctoring & Locks": "/portal/admin/proctoring", "Email": "/portal/admin/mail",
  "My Classes": "/portal/teach", "SAT results": "/portal/sat-lab/results", "Syllabus coverage": "/portal/teach/syllabus",
  "Physics Studio": "/portal/studio", "Announcements": "/portal/admin/notify", "Academics": "/portal/admin/academics",
  "Fees & Finance": "/portal/admin/finance", "Access locks": "/portal/admin/access", "Coordinator desk": "/portal/coordinator",
};
const ADMIN_CORE = "Dashboard | Physics timetable | Users & activity";
const STAFF_CORE = "Rankings & analytics | Institutions | Post / Tests";
const LEGACY_MENU = {
  student: [["student"], {}, ["Search", "Dashboard | Physics Resources | Resource Library", "Physics timetable | My study plan* | Exam Lab | My answer scripts | My Learning | My Progress | My Ranking | Leaderboard | Notifications", "Portal App: Install App"]],
  studentAll: [["student"], { sat: true, practicalLab: true }, ["Search", "Dashboard | Physics Resources | Resource Library", "Physics timetable | My study plan* | Exam Lab | Practical Lab | SAT Lab | My answer scripts | My Learning | My Progress | My Ranking | Leaderboard | Notifications", "Portal App: Install App"]],
  parent: [["parent"], {}, ["Search", "Dashboard | Physics Resources | Resource Library", "My Children | Physics timetable", "Portal App: Install App"]],
  registrar: [["attendance_registrar"], {}, ["Attendance: Dashboard | Daily attendance | Physics timetable", "Portal App: Install App"]],
  coordinator: [["coordinator"], {}, ["Search", "Assigned class: Class staff desk | Conduct class drill | Practical Lab | Assign drill | Drill Records | Physics timetable | Daily attendance | Resource Library | Physics Resources | Notifications", "Portal App: Install App"]],
  facilitator: [["facilitator"], {}, ["Search", "Assigned class: Class staff desk | Conduct class drill | Practical Lab | Assign drill | Drill Records | Physics timetable | Daily attendance | Resource Library | Physics Resources | Notifications", "Portal App: Install App"]],
  teacher: [["teacher"], {}, ["Search", `Administration: ${ADMIN_CORE} | ${STAFF_CORE} | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | My Classes | Exam Lab | Practical Lab | SAT Lab | SAT results | Syllabus coverage | Physics Studio | Physics Resources | Resource Library`, "Portal App: Install App"]],
  ta: [["teaching_assistant"], {}, ["Search", `Administration: ${ADMIN_CORE} | ${STAFF_CORE} | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | My Classes | Exam Lab | Physics Studio | Physics Resources | Resource Library`, "Portal App: Install App"]],
  finance: [["finance_manager"], {}, ["Search", `Administration: ${ADMIN_CORE} | ${STAFF_CORE} | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | Physics Studio | Physics Resources | Resource Library`, "Portal App: Install App"]],
  admin: [["admin"], {}, ["Search", `Administration: ${ADMIN_CORE} | ${STAFF_CORE} | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | Announcements | Academics | Fees & Finance | My Classes | Exam Lab | Practical Lab | SAT Lab | SAT results | Syllabus coverage | Physics Studio | Physics Resources | Resource Library`, "Portal App: Install App"]],
  superAdmin: [["super_admin"], {}, ["Search", `Administration: ${ADMIN_CORE} | Access locks | ${STAFF_CORE} | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | Announcements | Academics | Fees & Finance | My Classes | Exam Lab | Practical Lab | SAT Lab | SAT results | Syllabus coverage | Physics Studio | Physics Resources | Resource Library`, "Portal App: Install App"]],
  coordAdmin: [["coordinator", "admin"], {}, ["Search", `Administration: ${ADMIN_CORE} | ${STAFF_CORE} | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | Coordinator desk | Announcements | Academics | Fees & Finance | My Classes | Exam Lab | Practical Lab | SAT Lab | SAT results | Syllabus coverage | Physics Studio | Physics Resources | Resource Library`, "Portal App: Install App"]],
  adminStudent: [["admin", "student"], { sat: true, practicalLab: true }, ["Search", `Administration: ${ADMIN_CORE} | ${STAFF_CORE} | Drill Records | Attendance | Daily attendance | Proctoring & Locks | Email | Notifications | Announcements | Academics | Fees & Finance | My Classes | Exam Lab | Practical Lab | SAT Lab | SAT results | Syllabus coverage | Physics Studio | Physics Resources | Resource Library`, "Learning: Physics timetable | My study plan* | Exam Lab | SAT Lab | My answer scripts | My Learning | My Progress | My Ranking | Leaderboard | Notifications", "Portal App: Install App"]],
  none: [[], {}, ["Search", "Dashboard | Physics Resources | Resource Library", "Portal App: Install App"]],
};
const compact = (menu) => menu.map((s) => (s.title ? `${s.title}: ` : "") + s.items.map((i) => i.label + (i.hardNavigate ? "*" : "")).join(" | "));

// Items the registry describes that today's sidebar doesn't list (the header's
// Profile link, and the SAT Lab's own pages it links to).
const NOT_IN_TODAYS_MENU = new Set(["profile", "sat-practice", "sat-progress", "sat-tutor", "sat-settings"]);

for (const [persona, [roles, on, want]] of Object.entries(LEGACY_MENU)) {
  const switchedOn = { sat: false, practicalLab: false, ...on };
  const menu = menuFor(roles, switchedOn);
  assert.deepEqual(compact(menu), want, `${persona}: the menu reads exactly as before`);
  const shown = new Set();
  for (const item of menu.flatMap((s) => s.items)) {
    assert.equal(item.href, LEGACY_HREF[item.label], `${persona}: "${item.label}" links where it did`);
    const described = itemForRoute(item.href);
    assert.ok(described, `${persona}: ${item.href} is described in the registry`);
    assert.ok([described.menuLabel, described.deskLabel].includes(item.label), `${persona}: "${item.label}" is the registry's label`);
    shown.add(described.id);
  }
}

// --- every role combination: the old menu, the new menu, the registry's rule ---------

// The portal layout's navFor and its additions as they were at 0646a86,
// before the registry, with the role rules they used -- frozen here as the
// reference the registry must reproduce.
const L_STAFF = ["super_admin", "admin", "teacher", "teaching_assistant", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"];
const L_DRILL = ["super_admin", "admin", "teacher", "coordinator", "facilitator", "teaching_assistant"];
const L_EXAM_LAB = ["super_admin", "admin", "teacher", "coordinator", "facilitator"];
const lAdmin = (r) => r.some((x) => x === "super_admin" || x === "admin");
const lStaff = (r) => r.some((x) => L_STAFF.includes(x));
const lRegistrarOnly = (r) => r.includes("attendance_registrar") && !r.includes("coordinator") && !r.includes("facilitator") && !lAdmin(r);
const lCoordinatorOnly = (r) => (r.includes("coordinator") || r.includes("facilitator")) && !lAdmin(r);
const lDrills = (r) => r.some((x) => L_DRILL.includes(x));
const lExamLab = (r) => r.some((x) => L_EXAM_LAB.includes(x));
const L_LAB = { href: "/portal/practical-lab", label: "Practical Lab" };
function legacyNavFor(roles, switchedOn) {
  const staff = lStaff(roles), admin = lAdmin(roles), isStudent = roles.includes("student"), isParent = roles.includes("parent");
  const sections = [];
  if (lRegistrarOnly(roles)) {
    return [{ title: "Attendance", items: [{ href: "/portal", label: "Dashboard" }, { href: "/portal/admin/attendance-view", label: "Daily attendance" }, { href: "/portal/timetable", label: "Physics timetable" }] }];
  }
  if (lCoordinatorOnly(roles)) {
    return [{ title: "Assigned class", items: [
      { href: "/portal/coordinator", label: "Class staff desk" }, { href: "/portal/exam-lab", label: "Conduct class drill" }, L_LAB,
      { href: "/portal/admin/assign", label: "Assign drill" }, { href: "/portal/admin/drills", label: "Drill Records" },
      { href: "/portal/timetable", label: "Physics timetable" }, { href: "/portal/admin/attendance-view", label: "Daily attendance" },
      { href: "/portal/library", label: "Resource Library" }, { href: "/portal/resources", label: "Physics Resources" },
      { href: "/portal/notifications", label: "Notifications" },
    ] }];
  }
  const a = [{ href: "/portal", label: "Dashboard" }];
  if (staff) {
    a.push({ href: "/portal/timetable", label: "Physics timetable" }, { href: "/portal/admin/users", label: "Users & activity" });
    if (roles.includes("super_admin")) a.push({ href: "/portal/admin/access", label: "Access locks" });
    a.push({ href: "/portal/admin/analytics", label: "Rankings & analytics" }, { href: "/portal/admin/institutions", label: "Institutions" }, { href: "/portal/admin/assign", label: "Post / Tests" });
    if (lDrills(roles)) a.push({ href: "/portal/admin/drills", label: "Drill Records" });
    a.push({ href: "/portal/admin/attendance", label: "Attendance" }, { href: "/portal/admin/attendance-view", label: "Daily attendance" }, { href: "/portal/admin/proctoring", label: "Proctoring & Locks" }, { href: "/portal/admin/mail", label: "Email" }, { href: "/portal/notifications", label: "Notifications" });
  }
  if (roles.includes("coordinator")) a.push({ href: "/portal/coordinator", label: "Coordinator desk" });
  if (admin) a.push({ href: "/portal/admin/notify", label: "Announcements" });
  if (admin) a.push({ href: "/portal/admin/academics", label: "Academics" }, { href: "/portal/admin/finance", label: "Fees & Finance" });
  if (admin || roles.includes("teacher") || roles.includes("teaching_assistant")) a.push({ href: "/portal/teach", label: "My Classes" });
  if (lDrills(roles)) a.push({ href: "/portal/exam-lab", label: "Exam Lab" });
  if (lExamLab(roles)) a.push(L_LAB, { href: "/portal/sat-lab", label: "SAT Lab" }, { href: "/portal/sat-lab/results", label: "SAT results" });
  if (lExamLab(roles)) a.push({ href: "/portal/teach/syllabus", label: "Syllabus coverage" });
  if (staff) a.push({ href: "/portal/studio", label: "Physics Studio" });
  a.push({ href: "/portal/resources", label: "Physics Resources" }, { href: "/portal/library", label: "Resource Library" });
  sections.push({ title: staff ? "Administration" : undefined, items: a });
  const l = [];
  if (isStudent) {
    l.push({ href: "/portal/timetable", label: "Physics timetable" }, { href: "/portal/study-plan", label: "My study plan", hardNavigate: true }, { href: "/portal/exam-lab", label: "Exam Lab" });
    if (switchedOn.practicalLab && !lExamLab(roles)) l.push(L_LAB);
    if (switchedOn.sat) l.push({ href: "/portal/sat-lab", label: "SAT Lab" });
    l.push({ href: "/portal/exam-lab/review", label: "My answer scripts" }, { href: "/portal/learn", label: "My Learning" }, { href: "/portal/progress", label: "My Progress" }, { href: "/portal/my-ranking", label: "My Ranking" }, { href: "/portal/leaderboard", label: "Leaderboard" }, { href: "/portal/notifications", label: "Notifications" });
  }
  if (isParent) l.push({ href: "/portal/family", label: "My Children" }, { href: "/portal/timetable", label: "Physics timetable" });
  if (l.length) sections.push({ title: staff ? "Learning" : undefined, items: l });
  return sections;
}
function legacyMenu(roles, switchedOn) {
  const sections = legacyNavFor(roles, switchedOn);
  if (!lRegistrarOnly(roles)) sections.unshift({ items: [{ href: "/portal/search", label: "Search" }] });
  sections.push({ title: "Portal App", items: [{ href: "/portal/install", label: "Install App" }] });
  return sections;
}
// The frozen copy agrees with the captured snapshot.
for (const [persona, [roles, on, want]] of Object.entries(LEGACY_MENU)) {
  assert.deepEqual(compact(legacyMenu(roles, { sat: false, practicalLab: false, ...on })), want, `frozen reference matches the snapshot: ${persona}`);
}

// All 12 roles in every combination, with the SAT and Practical Lab switches
// on and off: 16,384 viewers. The menu reads exactly as before, and the
// registry's one visibility rule (visibleItems, through viewerSubjects) shows
// exactly the old menu's places -- a physics course assumed for everyone, as
// the old menu showed physics to every student.
const ROLES = ["super_admin", "admin", "teacher", "teaching_assistant", "student", "parent", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"];
let combinations = 0;
const menuDiffs = [];
const ruleDiffs = [];
for (let mask = 0; mask < 1 << ROLES.length; mask++) {
  const roles = ROLES.filter((_, i) => mask & (1 << i));
  for (const sat of [false, true]) {
    for (const practicalLab of [false, true]) {
      combinations++;
      const old = legacyMenu(roles, { sat, practicalLab });
      if (JSON.stringify(menuFor(roles, { sat, practicalLab })) !== JSON.stringify(old)) menuDiffs.push(`${roles.join("+")} sat=${sat} lab=${practicalLab}`);
      const shown = [...new Set(old.flatMap((section) => section.items).map((item) => itemForRoute(item.href)?.id))].sort();
      const facts = { roles, courses: ["9702", ...(sat ? ["SAT"] : [])], practicalLab };
      const visible = [...new Set(visibleItems(facts).map((e) => e.item.id).filter((id) => !NOT_IN_TODAYS_MENU.has(id)))].sort();
      if (JSON.stringify(visible) !== JSON.stringify(shown)) ruleDiffs.push(`${roles.join("+") || "(none)"} sat=${sat} lab=${practicalLab}: +[${visible.filter((v) => !shown.includes(v))}] -[${shown.filter((v) => !visible.includes(v))}]`);
    }
  }
}
assert.equal(combinations, 16384);
assert.deepEqual(menuDiffs, [], "the menu reads exactly as before for every combination");
assert.deepEqual(ruleDiffs.slice(0, 5), [], `the registry's rule shows the old menu's places for every combination (${ruleDiffs.length} differ)`);

// The product tour explains each menu link with its registry purpose; every
// explanation the tour had before (its own label-keyed list) reads the same.
const LEGACY_TOUR_HELP = {
  "Dashboard": "Your daily starting point for upcoming classes, tasks, announcements and study priorities.",
  "Physics timetable": "See lessons and additional classes filtered for your school, class and group.",
  "My study plan": "Follow personalised weekly activities based on your performance and learning needs.",
  "Exam Lab": "Open assigned tests, topical practice, past papers and timed assessments.",
  "My answer scripts": "Review submitted answers, marks, correct responses and teacher feedback.",
  "My Learning": "Find assignments and individual tasks, organised by status and deadline.",
  "My Progress": "Track patterns across assessments, practice and attendance.",
  "My Ranking": "Understand the performance pillars behind your private comparative position.",
  "Leaderboard": "View privacy-safe class and network comparisons using student call-signs.",
  "Notifications": "Read announcements, test reminders, class changes and marked-work alerts.",
  "Resource Library": "Open approved notes, worksheets, videos and collaborative learning material.",
  "Physics Resources": "Browse curated Cambridge Physics resources and supporting content.",
  "Users & activity": "Manage portal users and inspect authorised activity records.",
  "Access locks": "Lock or suspend a user, group, class or school with a custom message.",
  "Rankings & analytics": "Review performance evidence and portal analytics.",
  "Institutions": "Manage the school, class and group hierarchy.",
  "Post / Tests": "Assign learning activities and Exam Lab assessments.",
  "Attendance": "Record and manage lesson attendance.",
  "Daily attendance": "Review the current attendance picture for authorised classes.",
  "Proctoring & Locks": "Monitor proctored assessments and exam restrictions.",
  "Email": "Manage portal email communication and delivery status.",
  "Announcements": "Publish targeted announcements to portal users.",
  "Academics": "Manage academic configuration and teaching structures.",
  "Fees & Finance": "Access authorised fee and finance administration.",
  "My Classes": "Open the classes and students assigned to you.",
  "Physics Studio": "Reach the teaching and studio workspace.",
};
for (const [label, help] of Object.entries(LEGACY_TOUR_HELP)) {
  assert.equal(itemForRoute(LEGACY_HREF[label])?.purpose, help, `tour: "${label}" is explained as before`);
}
// Every link the menu shows has a purpose for the tour (no generic fallback).
for (const [roles, on] of Object.values(LEGACY_MENU)) {
  for (const item of menuFor(roles, { sat: false, practicalLab: false, ...on }).flatMap((s) => s.items)) {
    assert.ok(itemForRoute(item.href)?.purpose, `tour: ${item.href} has a purpose`);
  }
}

// The audiences behind those rules.
assert.deepEqual([...audiencesOf(["attendance_registrar"])].sort(), ["everyone", "registrar-desk"]);
assert.deepEqual([...audiencesOf(["coordinator", "student"])].sort(), ["coordinator-desk", "everyone"], "the coordinator desk is all a coordinator sees");
assert.deepEqual([...audiencesOf(["student"])].sort(), ["everyone", "member", "student"]);
assert.ok(audiencesOf(["teacher"]).has("exam-lab-staff") && !audiencesOf(["teaching_assistant"]).has("exam-lab-staff"));
// The subjects a viewer has (viewerSubjects).
const ALL_SUBJECTS = SUBJECTS.map((s) => s.id);
const subjectsOf = (roles, courses = [], practicalLab = false) => viewerSubjects({ roles, courses, practicalLab });
assert.deepEqual(subjectsOf(["teacher"]), ALL_SUBJECTS, "Exam Lab staff have every subject");
assert.deepEqual(subjectsOf(["admin", "student"]), ALL_SUBJECTS, "an admin who is also a student keeps the SAT Lab and the lab");
assert.deepEqual(subjectsOf(["coordinator"]), ALL_SUBJECTS);
assert.deepEqual(subjectsOf(["teaching_assistant", "student"]), ["physics"], "other staff keep Physics; SAT only with their own SAT");
assert.deepEqual(subjectsOf(["teaching_assistant", "student"], ["SAT"], true), ["physics", "sat", "practical-lab"]);
assert.deepEqual(subjectsOf(["finance_manager"]), ["physics"]);
assert.deepEqual(subjectsOf(["student"], ["9702"]), ["physics"]);
assert.deepEqual(subjectsOf(["student"], ["5054", "SAT"]), ["physics", "sat"]);
assert.deepEqual(subjectsOf(["student"], ["SAT"]), ["sat"], "a student in no physics class has no Physics");
assert.deepEqual(subjectsOf(["student"], [], true), ["practical-lab"], "the lab switch alone");
assert.deepEqual(subjectsOf(["student"], []), [], "no course, no switch: no subject");
assert.deepEqual(subjectsOf(["parent"]), ["physics"], "a parent keeps Physics' shared pages, as before");
assert.deepEqual(subjectsOf(["parent"], ["SAT"]), ["physics", "sat"], "and their children's subjects when the caller knows them");
assert.deepEqual(subjectsOf([]), ["physics"], "an account with no role, as before");

// A subject's modules need the subject: an SAT-only student sees no physics
// module, but keeps everything class-based and general -- the timetable too.
const satOnly = { roles: ["student"], courses: ["SAT"], practicalLab: false };
const entry = (id) => ALL_ITEMS.find((e) => e.item.id === id);
assert.equal(canSee(entry("exam-lab"), satOnly), false);
assert.equal(canSee(entry("resources"), satOnly), false);
assert.equal(canSee(entry("sat-tutor"), satOnly), true);
assert.equal(canSee(entry("learning"), satOnly), true, "general items need no subject");
assert.equal(canSee(entry("timetable"), satOnly), true, "the timetable lists SAT classes too");
assert.equal(canSee(entry("timetable"), { roles: ["parent"], courses: [], practicalLab: false }), true, "and parents keep it");
assert.equal(canSee(entry("sat-tutor"), { roles: ["admin"], courses: [], practicalLab: false }), false, "staff have no SAT coach of their own");
assert.equal(canSee(entry("task"), satOnly), false, "an unlisted page is never a destination");
assert.deepEqual(visibleItems({ roles: ROLES, courses: ["9702", "SAT"], practicalLab: true }).filter((e) => e.item.listed === false), [], "not even for every role at once");

// --- the Exam Lab's subject/course context --------------------------------------------

assert.deepEqual(EXAM_LAB_SUBJECTS.map((s) => s.id), ["physics"], "physics is the only subject with papers");
const papers = (ctx) => (ctx.kind === "papers" ? `${ctx.subject.id}:${ctx.course}:${ctx.courses.join("+")}:${ctx.choice ? "choice" : "fixed"}` : ctx.kind);
const STAFF = { allowed: ["9702", "5054", "SAT"], primary: "9702" };
// Defaults to the student's own course; one course never offers a choice.
assert.equal(papers(examLabContext({ allowed: ["9702"], primary: "9702" })), "physics:9702:9702:fixed");
assert.equal(papers(examLabContext({ allowed: ["5054"], primary: "5054" })), "physics:5054:5054:fixed");
assert.equal(papers(examLabContext({ allowed: ["9702", "SAT"], primary: "9702" })), "physics:9702:9702:fixed", "SAT never reaches the Exam Lab's course choice");
assert.equal(papers(examLabContext({ allowed: ["SAT", "5054"], primary: "SAT" })), "physics:5054:5054:fixed", "a primary without papers falls back to a course with them");
assert.equal(papers(examLabContext({ allowed: ["9702", "5054"], primary: "5054" })), "physics:5054:9702+5054:choice", "both physics courses: primary first, switchable");
assert.equal(papers(examLabContext(STAFF)), "physics:9702:9702+5054:choice", "staff keep every track");
// The query picks among courses the user may open -- never more.
assert.equal(papers(examLabContext(STAFF, { course: "5054" })), "physics:5054:9702+5054:choice");
assert.equal(papers(examLabContext(STAFF, { subject: "physics", course: "5054" })), "physics:5054:9702+5054:choice");
assert.equal(papers(examLabContext({ allowed: ["9702"], primary: "9702" }, { course: "5054" })), "physics:9702:9702:fixed", "a course the student doesn't take is ignored");
assert.equal(papers(examLabContext(STAFF, { course: "SAT" })), "physics:9702:9702+5054:choice", "a course without papers is ignored");
assert.equal(papers(examLabContext(STAFF, { subject: "sat" })), "physics:9702:9702+5054:choice", "a subject without an Exam Lab is ignored");
assert.equal(papers(examLabContext(STAFF, { subject: "nope", course: ["5054", "9702"] })), "physics:9702:9702+5054:choice", "repeated or unknown values are ignored");
// No papers for this user: where their own subjects practise, or nothing.
const elsewhere = examLabContext({ allowed: ["SAT"], primary: "SAT" });
assert.equal(elsewhere.kind, "elsewhere");
assert.deepEqual(elsewhere.places.map((p) => `${p.subject.shortLabel} -> ${p.item.menuLabel} (${p.item.route})`), ["SAT -> SAT Lab (/portal/sat-lab)"]);
assert.equal(examLabContext({ allowed: [], primary: null }).kind, "none");
assert.equal(examLabContext({ allowed: [], primary: null }, { course: "9702" }).kind, "none", "the query never opens a course");

// --- the viewer's course names them (no A Level wording for O Level) ------------------

// The Exam Lab's tab title, seen by every student, names no single course.
const tabTitle = `${portalItem("exam-lab").name} — ${EXAM_LAB_SUBJECTS[0].examLab.title}`;
assert.equal(tabTitle, "Exam Lab — Real CAIE Past Papers");
assert.doesNotMatch(tabTitle, /\b(9702|5054)\b/);
// How Exam Lab work is named (My Progress: "Your … performance").
assert.equal(courseBoardLabel(courseOf("9702")), "CAIE 9702");
assert.equal(courseBoardLabel(courseOf("5054")), "CAIE 5054");
assert.equal(courseBoardLabel(courseOf("SAT")), "Digital SAT");
assert.equal(examLabWorkLabel({ allowed: ["9702"], primary: "9702" }), "CAIE 9702", "A Level: as before");
assert.equal(examLabWorkLabel({ allowed: ["5054"], primary: "5054" }), "CAIE 5054", "O Level: its own course");
assert.equal(examLabWorkLabel({ allowed: ["5054", "SAT"], primary: "5054" }), "CAIE 5054");
assert.equal(examLabWorkLabel({ allowed: ["SAT"], primary: "SAT" }), "Exam Lab", "SAT only: no physics course named");
assert.equal(examLabWorkLabel({ allowed: [], primary: null }), "Exam Lab", "no course");
assert.equal(examLabWorkLabel(STAFF), "CAIE 9702", "staff: the course the Exam Lab opens on");
// The welcome email's first lines follow the new account's course.
const OLD_WELCOME = "Welcome to your A-Level Physics learning portal. You now have your own account where you can sit real CAIE 9702 past papers, take timed topic drills with instant marking and feedback, and track your progress through the year.";
assert.equal(welcomeIntro("9702"), OLD_WELCOME, "A Level: exactly as before");
assert.match(welcomeIntro("5054"), /^Welcome to your O-Level Physics learning portal\..*CAIE 5054 past papers/);
assert.doesNotMatch(welcomeIntro("5054"), /A-Level|9702/);
assert.match(welcomeIntro("SAT"), /^Welcome to your Digital SAT learning portal\./);
assert.doesNotMatch(welcomeIntro("SAT"), /Physics|CAIE/);
assert.equal(welcomeIntro(null), GENERAL_WELCOME, "no course");
assert.ok(GENERAL_WELCOME.includes(PORTAL_NAME) && !/A-Level|9702|CAIE/.test(GENERAL_WELCOME));
const CLASSES = [{ id: "as", year: "AS" }, { id: "ol", year: "O Level" }, { id: "sat", year: "Digital SAT" }, { id: "odd", year: "Saturday Batch" }];
assert.equal(welcomeCourse("as", CLASSES, []), "9702");
assert.equal(welcomeCourse("ol", CLASSES, []), "5054");
assert.equal(welcomeCourse("sat", CLASSES, []), "SAT");
assert.equal(welcomeCourse(null, CLASSES, ["SAT"]), "SAT", "SAT switched on, no class");
assert.equal(welcomeCourse("ol", CLASSES, ["SAT"]), "5054", "physics first, as course access ranks it");
assert.equal(welcomeCourse("odd", CLASSES, []), "9702", "an unplaced class counts as A Level, as course access does");
assert.equal(welcomeCourse("as", [], []), "9702", "a failed registry read: unplaced");
assert.equal(welcomeCourse(null, CLASSES, []), null, "no class, no subject: the general welcome");
// Nothing still hardcodes the A Level names where the course is known.
assert.ok(!read("src/components/exam-lab/exam-runner.tsx").includes("CAIE 9702 Practice Paper"), "the practice paper header names its course");
assert.ok(!read("src/app/portal/(app)/progress/page.tsx").includes("CAIE 9702"), "My Progress names the student's course");
assert.ok(!read("src/lib/portal/admin.ts").includes("A-Level Physics learning portal"), "the welcome email reads the registry");

// --- the helper's curriculum -----------------------------------------------------------

// Worked out on every render and question, from the viewer's courses: never
// frozen from the first page (a first page with no helper -- the SAT Lab --
// used to leave it empty, and every question then failed until a reload).
assert.equal(helperCurriculum(PHYSICS_HELPER, ["9702"], null), "A-Level");
assert.equal(helperCurriculum(PHYSICS_HELPER, ["5054"], null), "O-Level", "an O Level student is asked as O Level");
assert.equal(helperCurriculum(PHYSICS_HELPER, ["9702", "5054"], null), "O-Level", "both: O Level, as course access ranks them");
assert.equal(helperCurriculum(PHYSICS_HELPER, ["SAT"], null), "A-Level", "no physics course: the default");
assert.equal(helperCurriculum(PHYSICS_HELPER, [], null), "A-Level", "signed out or staff: the default");
assert.equal(helperCurriculum(PHYSICS_HELPER, ["5054"], "IBDP"), "IBDP", "the viewer's own pick wins");
assert.equal(helperCurriculum(PHYSICS_HELPER, ["9702"], ""), "A-Level", "an empty pick is never sent");
assert.equal(helperCurriculum(PHYSICS_HELPER, ["9702"], "Nonsense"), "A-Level", "nor one the helper doesn't offer");
for (const courses of [[], ["9702"], ["5054"], ["SAT"]]) {
  for (const picked of [null, "", "O-Level", "x"]) {
    assert.ok(PHYSICS_HELPER.curricula.includes(helperCurriculum(PHYSICS_HELPER, courses, picked)), "always one the API accepts");
  }
}
// The companion keeps no curriculum state of its own beyond the viewer's pick,
// and is still hidden in the Exam Lab and the SAT Lab.
const companion = read("src/components/einstein-companion.tsx");
assert.ok(companion.includes("helperCurriculum(helper, viewerCourses, pickedCurriculum)"));
assert.ok(!/useState<string>\(helper/.test(companion), "no curriculum frozen from the first page");
assert.ok(companion.includes("if (dismissed || !visible || pausedHere || !helper) return null;"));

console.log("subject registry: all tests passed");
