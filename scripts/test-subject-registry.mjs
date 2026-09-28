import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCENT_CLASSES, ALL_ITEMS, CLASS_SUBJECTS, COURSES, DIRECT_SUBJECTS, GENERAL_ITEMS, STAFF_ITEMS, SUBJECTS, SUBJECT_SPACES,
  audiencesOf, canSee, courseClassLabel, courseCodeLabel, courseOf, courseShortLabel, defaultHelper, helperForPath,
  itemForPath, itemForRoute, listed, portalItem, practiceItemOf, spaceModules, subjectOf, subjectsForCourses, visibleItems,
} from "../src/lib/portal/subjects.ts";
import { PHYSICS_HELPER } from "../src/lib/portal/subject-helpers.ts";
import { menuFor } from "../src/lib/portal/portal-menu.ts";
import { EXAM_LAB_SUBJECTS, examLabContext } from "../src/lib/portal/exam-lab-context.ts";
import { COURSE_LABEL } from "../src/lib/portal/course-labels.ts";
import { PRACTICAL_LAB_PAGE } from "../src/lib/portal/practical-lab-access.ts";

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
  "home", "search", "notifications", "learning", "library", "family", "profile", "install",
  "users", "access-locks", "analytics", "institutions", "post-work", "drill-records", "attendance",
  "daily-attendance", "proctoring", "email", "coordinator", "announcements", "academics", "finance", "classes",
  "exam-lab", "study-plan", "timetable", "answer-scripts", "progress", "ranking", "leaderboard",
  "resources", "syllabus-coverage", "studio", "practical-lab",
  "sat-today", "sat-practice", "sat-progress", "sat-tutor", "sat-settings", "sat-results",
];
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
  assert.match(page, /^\/portal(\/[a-z0-9-]+)*$/, `${item.id}: a plain portal path`);
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
// Places outside any subject never name one.
const subjectWords = new RegExp(`\\b(${[...SUBJECTS.flatMap((s) => [s.label, s.shortLabel]), ...COURSES.flatMap((c) => [c.level, c.code ?? c.level])].join("|")})\\b`, "i");
for (const { item } of [...GENERAL_ITEMS.map((item) => ({ item })), ...STAFF_ITEMS.map((item) => ({ item }))]) {
  for (const text of [item.name, item.menuLabel, item.purpose, item.deskLabel ?? ""]) assert.doesNotMatch(text, subjectWords, `${item.id} is subject-free: "${text}"`);
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
assert.equal(at("/portal/tasks/9"), null, "the home page doesn't claim every portal path");
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
  "exam-lab", "practical-lab", "study-plan", "timetable", "answer-scripts", "progress", "ranking", "leaderboard",
  "resources", "syllabus-coverage", "studio",
]);
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
  // The registry's access rules show exactly the menu's places (plus the few
  // the sidebar doesn't list), so the subject-first navigation can rely on them.
  const subjects = ["physics", ...(switchedOn.sat ? ["sat"] : []), ...(switchedOn.practicalLab ? ["practical-lab"] : [])];
  const staffSubjects = SUBJECTS.map((s) => s.id);
  const viewer = { roles, subjects: roles.includes("student") || roles.includes("parent") || !roles.length ? subjects : staffSubjects };
  const visible = new Set(visibleItems(viewer).map((e) => e.item.id).filter((id) => !NOT_IN_TODAYS_MENU.has(id)));
  assert.deepEqual([...visible].sort(), [...shown].sort(), `${persona}: the registry's rules show the menu's places`);
}

// The audiences behind those rules.
assert.deepEqual([...audiencesOf(["attendance_registrar"])].sort(), ["everyone", "registrar-desk"]);
assert.deepEqual([...audiencesOf(["coordinator", "student"])].sort(), ["coordinator-desk", "everyone"], "the coordinator desk is all a coordinator sees");
assert.deepEqual([...audiencesOf(["student"])].sort(), ["everyone", "member", "student"]);
assert.ok(audiencesOf(["teacher"]).has("exam-lab-staff") && !audiencesOf(["teaching_assistant"]).has("exam-lab-staff"));
// A subject's modules need the subject: an SAT-only student sees no physics module.
const satOnly = { roles: ["student"], subjects: ["sat"] };
assert.equal(canSee(ALL_ITEMS.find((e) => e.item.id === "exam-lab"), satOnly), false);
assert.equal(canSee(ALL_ITEMS.find((e) => e.item.id === "sat-tutor"), satOnly), true);
assert.equal(canSee(ALL_ITEMS.find((e) => e.item.id === "learning"), satOnly), true, "general items need no subject");
assert.equal(canSee(ALL_ITEMS.find((e) => e.item.id === "sat-tutor"), { roles: ["admin"], subjects: ["physics", "sat", "practical-lab"] }), false, "staff have no SAT coach of their own");

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

console.log("subject registry: all tests passed");
