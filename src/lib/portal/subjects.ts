/**
 * The subject registry: the single description of every subject the portal
 * teaches and of every place in the portal. Pure and isomorphic (no server
 * imports, no `@/` alias) so the middleware, plain Node tests and client
 * components can all import it.
 *
 * A subject is what an admin adds to a student account. `grant: "class"`
 * subjects come from class enrolment exactly as before (physics: the class
 * `year` label names the course); `grant: "direct"` subjects are switched on
 * per student by an admin and stored in subject-grants.ts.
 *
 * Each subject lists its courses, its look (short label, lucide icon, accent
 * token) and its modules in display order -- route, plain name, icon, one-line
 * purpose and who sees it. The places that belong to no subject (home, search,
 * notifications, profile, the staff consoles) are described here too, as
 * GENERAL_ITEMS and STAFF_ITEMS. The portal's navigation, the product tour,
 * the helper and the Exam Lab read their labels from here, so adding a subject
 * is an entry here plus its own pages (docs/ADDING-A-SUBJECT.md).
 */
import type { Course } from "./course-labels.ts";
import {
  canConductDrills, isAdmin, isCoordinatorOnly, isExamLabStaff, isRegistrarOnly, isStaff, type EduRole,
} from "../edu/roles.ts";
import { PHYSICS_HELPER, type HelperPersona } from "./subject-helpers.ts";
import { PORTAL_NAME } from "./brand.ts";

export type SubjectId = "physics" | "sat" | "practical-lab";

/** The lucide-react icon (by export name) a subject or a portal item shows.
 *  Kept as names so this file stays free of React; the UI maps a name to its
 *  component. scripts/test-subject-registry.mjs checks each one exists. */
export type IconName =
  | "Atom" | "BookOpen" | "BrainCircuit" | "Building2" | "CalendarCheck" | "CalendarClock" | "CalendarDays"
  | "ChartColumn" | "ClipboardCheck" | "ClipboardList" | "Download" | "FlaskConical" | "FlaskRound" | "Gauge"
  | "GraduationCap" | "LayoutDashboard" | "Library" | "ListChecks" | "LockKeyhole" | "Mail" | "Megaphone"
  | "MessagesSquare" | "NotebookPen" | "Presentation" | "Receipt" | "School" | "Search" | "Bell" | "Settings" | "ShieldCheck"
  | "SlidersHorizontal" | "Sparkles" | "Timer" | "TrendingUp" | "Trophy" | "UserCog" | "Users";

/** A subject's accent, named after the portal's colour tokens (tailwind.config.ts). */
export type AccentToken = "cyan" | "violet" | "emerald" | "amber" | "magenta";

/** The Tailwind classes for each accent, written out in full so Tailwind
 *  generates them (it can't see classes assembled from a token at runtime). */
export const ACCENT_CLASSES: Record<AccentToken, { text: string; border: string; soft: string }> = {
  cyan: { text: "text-cyan", border: "border-cyan/30", soft: "bg-cyan/10" },
  violet: { text: "text-violet2", border: "border-violet2/30", soft: "bg-violet2/10" },
  emerald: { text: "text-emerald2", border: "border-emerald2/30", soft: "bg-emerald2/10" },
  amber: { text: "text-amber-300", border: "border-amber-300/30", soft: "bg-amber-300/10" },
  magenta: { text: "text-magenta", border: "border-magenta/30", soft: "bg-magenta/10" },
};

/**
 * Who sees a portal item. Every audience names one rule from edu/roles.ts, so
 * the registry never restates a role list:
 *
 * - `everyone`: any signed-in portal user.
 * - `registrar-desk` / `coordinator-desk`: an attendance registrar, or a
 *   coordinator/facilitator, with no fuller role (isRegistrarOnly /
 *   isCoordinatorOnly). They get their own cut-down desk and none of the
 *   audiences below.
 * - `member`: anyone else -- the full portal. Every audience below applies
 *   on the full portal only: `student`, `parent`, `staff` (isStaff), `admin`
 *   (isAdmin), `super-admin`, `coordinator` (the coordinator role next to an
 *   admin one), `class-teacher` (admin, teacher or teaching assistant),
 *   `drill-staff` (canConductDrills) and `exam-lab-staff` (isExamLabStaff).
 */
export type Audience =
  | "everyone" | "member" | "registrar-desk" | "coordinator-desk"
  | "student" | "parent" | "staff" | "admin" | "super-admin" | "coordinator"
  | "class-teacher" | "drill-staff" | "exam-lab-staff";

export type PortalItemId =
  // General (every subject)
  | "home" | "search" | "notifications" | "learning" | "timetable" | "library" | "family" | "profile" | "install"
  | "onboarding" | "task" | "subject-space"
  // Staff consoles
  | "users" | "access-locks" | "analytics" | "institutions" | "post-work" | "drill-records" | "attendance"
  | "daily-attendance" | "proctoring" | "email" | "coordinator" | "announcements" | "academics" | "finance" | "classes"
  | "demo-student-access"
  // Physics
  | "exam-lab" | "study-plan" | "answer-scripts" | "progress" | "ranking" | "leaderboard"
  | "resources" | "syllabus-coverage" | "studio" | "test-preview"
  // Practical Lab (shown inside Physics)
  | "practical-lab"
  // Digital SAT
  | "sat-today" | "sat-practice" | "sat-progress" | "sat-tutor" | "sat-settings" | "sat-results";

/** One place in the portal: a page (or a section of one) and who sees it. */
export interface PortalItem {
  id: PortalItemId;
  /** An existing portal page; may end in a `#section` of that page. A
   *  `[param]` segment stands for any value (`/portal/tasks/[id]`), as in the
   *  page's own folder name. */
  route: string;
  /** The plain student-facing name inside its subject space ("Timetable"). */
  name: string;
  /** Its name where no subject is on screen -- today's menu and the page
   *  finder ("Physics timetable"). */
  menuLabel: string;
  /** The coordinator/facilitator desk's own name for it, where different. */
  deskLabel?: string;
  icon: IconName;
  /** One line on what it is for; the product tour and module cards show it. */
  purpose: string;
  /** Shown to anyone in one of these audiences -- and, for a subject's
   *  module, only when the viewer has that subject (see `canSee`). */
  access: readonly Audience[];
  /** Open with a full page load: a route some long-lived app sessions had
   *  cached as missing before it existed. */
  hardNavigate?: boolean;
  /** false: a page, never a destination -- it is in no menu, finder or
   *  subject space (`visibleItems` and `spaceModules` leave it out); it is
   *  described so its title and breadcrumb resolve (`itemForPath`). */
  listed?: false;
}

/** A module: a place that belongs to one subject. */
export interface SubjectModule extends PortalItem {
  /** Its place in the subject's space. A subject shown inside another
   *  (`partOf`) interleaves its modules with the parent's by this number. */
  order: number;
  /** Usable by someone who doesn't take the subject: Physics Resources, whose
   *  Class Drive holds every class's shared folders. The navigation lists it
   *  in General (under its menu label) for a viewer with no space of that
   *  subject -- a subject's other pages appear only in its space. */
  shared?: true;
}

/** What a subject's Exam Lab shows. Only subjects with papers have one. */
export interface ExamLabDef {
  /** The courses with papers, in the order the course choice lists them. */
  courses: readonly Course[];
  /** What the papers are, as staff read it next to the course list. */
  source: string;
  /** The browser-tab title after "Exam Lab — ". It names no single course:
   *  every student of the subject sees it. */
  title: string;
  /** The short line after the course name in the page header. */
  tagline: string;
  /** The banner above the papers. */
  intro: string;
}

export interface SubjectDef {
  id: SubjectId;
  label: string;
  /** For tight places: the subject switcher, "Your SAT practice". */
  shortLabel: string;
  icon: IconName;
  accent: AccentToken;
  grant: "class" | "direct";
  /** The courses a grant opens. Empty for a tool that lives inside another
   *  subject: switching it on opens no course (no Exam Lab, no timetable). */
  courses: Course[];
  /** The subject whose space shows this one (Practical Lab lives inside Physics). */
  partOf?: SubjectId;
  /** Where a student finishes setting the subject up, when it needs it. */
  setupPath?: string;
  /** Its modules, in display order. */
  modules: readonly SubjectModule[];
  /** The module where this subject's practice lives (the Exam Lab points a
   *  student there when the Exam Lab has no papers for them). */
  practice?: PortalItemId;
  examLab?: ExamLabDef;
  /** The floating AI helper's persona for this subject (subject-helpers.ts). */
  helper?: HelperPersona;
}

/** An awarding-body course and how it is named. */
export interface CourseDef {
  id: Course;
  subject: SubjectId;
  /** The full name: "Cambridge A Level Physics · 9702". */
  label: string;
  /** "A Level", "O Level", "Digital SAT". */
  level: string;
  /** The syllabus code, when it has one. */
  code?: string;
  /** The awarding body's short name, when it prints one with the code ("CAIE"). */
  board?: string;
  /** The first lines of a new student's welcome email (admin.ts credentialsEmail). */
  welcome: string;
}

export const COURSES: readonly CourseDef[] = [
  {
    id: "9702", subject: "physics", label: "Cambridge A Level Physics · 9702", level: "A Level", code: "9702", board: "CAIE",
    welcome: "Welcome to your A-Level Physics learning portal. You now have your own account where you can sit real CAIE 9702 past papers, take timed topic drills with instant marking and feedback, and track your progress through the year.",
  },
  {
    id: "5054", subject: "physics", label: "Cambridge O Level Physics · 5054", level: "O Level", code: "5054", board: "CAIE",
    welcome: "Welcome to your O-Level Physics learning portal. You now have your own account where you can sit real CAIE 5054 past papers, take timed topic drills with instant marking and feedback, and track your progress through the year.",
  },
  {
    id: "SAT", subject: "sat", label: "Digital SAT", level: "Digital SAT",
    welcome: "Welcome to your Digital SAT learning portal. You now have your own account where you can practise with official College Board questions, sit full adaptive practice tests, and track your progress towards your target score.",
  },
];

/** The welcome email's first lines for an account with no course (staff,
 *  parents, a student not yet in a class or subject). */
export const GENERAL_WELCOME = `Welcome to the ${PORTAL_NAME}. You now have your own account — sign in with the details below to get started.`;

export const SUBJECTS: readonly SubjectDef[] = [
  {
    id: "physics", label: "Physics", shortLabel: "Physics", icon: "Atom", accent: "cyan",
    grant: "class", courses: ["9702", "5054"], practice: "exam-lab", helper: PHYSICS_HELPER,
    examLab: {
      courses: ["9702", "5054"],
      source: "Real CAIE past papers",
      title: "Real CAIE Past Papers",
      tagline: "exact questions with diagrams",
      intro: "Sit a full past paper under timed conditions, or drill a topic. Paper 1 auto-marks; Paper 2 & 4 reveal the official mark scheme. Every question is the exact Cambridge original — diagrams, graphs and all.",
    },
    modules: [
      {
        id: "exam-lab", route: "/portal/exam-lab", name: "Exam Lab", menuLabel: "Exam Lab", deskLabel: "Conduct class drill",
        icon: "FlaskConical", order: 10, access: ["student", "drill-staff", "coordinator-desk"],
        purpose: "Open assigned tests, topical practice, past papers and timed assessments.",
      },
      {
        id: "study-plan", route: "/portal/study-plan", name: "Study plan", menuLabel: "My study plan", hardNavigate: true,
        icon: "BrainCircuit", order: 20, access: ["student"],
        purpose: "Follow personalised weekly activities based on your performance and learning needs.",
      },
      {
        id: "answer-scripts", route: "/portal/exam-lab/review", name: "Answer scripts", menuLabel: "My answer scripts",
        icon: "ClipboardCheck", order: 40, access: ["student"],
        purpose: "Review submitted answers, marks, correct responses and teacher feedback.",
      },
      {
        id: "progress", route: "/portal/progress", name: "Progress", menuLabel: "My Progress",
        icon: "TrendingUp", order: 50, access: ["student"],
        purpose: "Track patterns across assessments, practice and attendance.",
      },
      {
        id: "ranking", route: "/portal/my-ranking", name: "Ranking", menuLabel: "My Ranking",
        icon: "Gauge", order: 60, access: ["student"],
        purpose: "Understand the performance pillars behind your private comparative position.",
      },
      {
        id: "leaderboard", route: "/portal/leaderboard", name: "Leaderboard", menuLabel: "Leaderboard",
        icon: "Trophy", order: 70, access: ["student"],
        purpose: "View privacy-safe class and network comparisons using student call-signs.",
      },
      {
        id: "resources", route: "/portal/resources", name: "Resources", menuLabel: "Physics Resources",
        icon: "Library", order: 80, access: ["member", "coordinator-desk"], shared: true,
        purpose: "Browse curated Cambridge Physics resources and supporting content.",
      },
      {
        id: "syllabus-coverage", route: "/portal/teach/syllabus", name: "Syllabus coverage", menuLabel: "Syllabus coverage",
        icon: "ListChecks", order: 90, access: ["exam-lab-staff"],
        purpose: "Mark which syllabus topics each class and school has covered.",
      },
      {
        id: "studio", route: "/portal/studio", name: "Physics Studio", menuLabel: "Physics Studio",
        icon: "Sparkles", order: 100, access: ["staff"],
        purpose: "Reach the teaching and studio workspace.",
      },
      {
        id: "test-preview", route: "/portal/admin/test-preview/[testId]", name: "Test question preview", menuLabel: "Test question preview",
        icon: "ClipboardCheck", order: 110, access: ["super-admin"], listed: false,
        purpose: "Preview a physics class test's questions and images.",
      },
    ],
  },
  {
    id: "sat", label: "Digital SAT", shortLabel: "SAT", icon: "GraduationCap", accent: "violet",
    grant: "direct", courses: ["SAT"], setupPath: "/portal/sat-lab/setup", practice: "sat-today",
    modules: [
      {
        id: "sat-today", route: "/portal/sat-lab", name: "SAT Lab", menuLabel: "SAT Lab",
        icon: "GraduationCap", order: 10, access: ["student", "exam-lab-staff"],
        purpose: "Your SAT plan for today, work from your teacher and anything left unfinished.",
      },
      {
        id: "sat-practice", route: "/portal/sat-lab#sat-practice", name: "Practice", menuLabel: "SAT practice",
        icon: "Timer", order: 20, access: ["student", "exam-lab-staff"],
        purpose: "Adaptive mock exams, official practice tests and drills by skill.",
      },
      {
        id: "sat-progress", route: "/portal/sat-lab/progress", name: "Progress", menuLabel: "SAT progress",
        icon: "ChartColumn", order: 30, access: ["student"],
        purpose: "See every finished drill, practice test and mock exam.",
      },
      {
        id: "sat-tutor", route: "/portal/sat-lab/tutor", name: "Tutor", menuLabel: "SAT tutor",
        icon: "MessagesSquare", order: 40, access: ["student"],
        purpose: "Ask about the SAT, your plan or a mistake — the tutor knows your record.",
      },
      {
        id: "sat-settings", route: "/portal/sat-lab/settings", name: "Settings", menuLabel: "SAT settings",
        icon: "SlidersHorizontal", order: 50, access: ["student"],
        purpose: "Your exam date, target and practice routine.",
      },
      {
        id: "sat-results", route: "/portal/sat-lab/results", name: "Results", menuLabel: "SAT results",
        icon: "ClipboardList", order: 60, access: ["exam-lab-staff"],
        purpose: "Sittings for the SAT-class students you can see.",
      },
    ],
  },
  // The 9702 virtual practicals (public/lab). Switched on per student by an
  // admin, no teacher; shown inside Physics but never a physics course itself.
  {
    id: "practical-lab", label: "Practical Lab", shortLabel: "Practical Lab", icon: "FlaskRound", accent: "emerald",
    grant: "direct", courses: [], partOf: "physics",
    modules: [
      {
        // Same route as practical-lab-access.ts PRACTICAL_LAB_PAGE (a test keeps them equal).
        id: "practical-lab", route: "/portal/practical-lab", name: "Practical Lab", menuLabel: "Practical Lab",
        icon: "FlaskRound", order: 15, access: ["student", "exam-lab-staff", "coordinator-desk"],
        purpose: "Set up, observe and measure the 9702 practicals in a virtual lab.",
      },
    ],
  },
];

/** Places that belong to every subject (no subject around them). */
export const GENERAL_ITEMS: readonly PortalItem[] = [
  {
    id: "home", route: "/portal", name: "Home", menuLabel: "Dashboard", icon: "LayoutDashboard",
    access: ["member", "registrar-desk"],
    purpose: "Your daily starting point for upcoming classes, tasks, announcements and study priorities.",
  },
  {
    id: "family", route: "/portal/family", name: "My Children", menuLabel: "My Children", icon: "Users",
    access: ["parent"],
    purpose: "Follow your children's attendance, results and progress.",
  },
  {
    id: "learning", route: "/portal/learn", name: "My Learning", menuLabel: "My Learning", icon: "NotebookPen",
    access: ["student"],
    purpose: "Find assignments and individual tasks, organised by status and deadline.",
  },
  {
    // Class-based, so it belongs to every subject: it lists the lessons of
    // every class the viewer is in (SAT classes too; timetable.ts). Before the
    // subject-first navigation its menu label was "Physics timetable".
    id: "timetable", route: "/portal/timetable", name: "Timetable", menuLabel: "Timetable", icon: "CalendarClock",
    access: ["student", "parent", "staff", "registrar-desk", "coordinator-desk"],
    purpose: "See lessons and additional classes filtered for your school, class and group.",
  },
  {
    id: "library", route: "/portal/library", name: "Resource Library", menuLabel: "Resource Library", icon: "BookOpen",
    access: ["member", "coordinator-desk"],
    purpose: "Open approved notes, worksheets, videos and collaborative learning material.",
  },
  {
    id: "notifications", route: "/portal/notifications", name: "Notifications", menuLabel: "Notifications", icon: "Bell",
    access: ["student", "staff", "coordinator-desk"],
    purpose: "Read announcements, test reminders, class changes and marked-work alerts.",
  },
  {
    id: "search", route: "/portal/search", name: "Search", menuLabel: "Search", icon: "Search",
    access: ["member", "coordinator-desk"],
    purpose: "Find any page, resource or piece of your own work you can open.",
  },
  {
    id: "profile", route: "/portal/settings", name: "Profile & settings", menuLabel: "Profile", icon: "Settings",
    access: ["everyone"],
    purpose: "Manage your profile, guardian information and device settings.",
  },
  {
    id: "install", route: "/portal/install", name: "Install App", menuLabel: "Install App", icon: "Download",
    access: ["everyone"],
    purpose: "Add the portal to your phone, tablet or computer.",
  },
  {
    id: "onboarding", route: "/portal/onboarding", name: "Complete your profile", menuLabel: "Complete your profile", icon: "UserCog",
    access: ["student"], listed: false,
    purpose: "Set up your profile and a parent or guardian contact before using the portal.",
  },
  {
    id: "task", route: "/portal/tasks/[id]", name: "Assigned task", menuLabel: "Assigned task", icon: "ListChecks",
    access: ["student"], listed: false,
    purpose: "One task assigned to you, with its details and due date.",
  },
  {
    // The page each subject space is (`spaceRoute`). No destination of its
    // own: the home page's subject cards and the subject switcher open it,
    // and its title and breadcrumb come from the subject in its path
    // (`spaceForPath`).
    id: "subject-space", route: "/portal/subjects/[subject]", name: "Subject", menuLabel: "Subject", icon: "LayoutDashboard",
    access: ["member", "coordinator-desk"], listed: false,
    purpose: "One subject's own home: every page of that subject as a button.",
  },
];

/** The staff consoles (Administration): no subject around them. Listed most
 *  used first -- a long Administration group shows the first eight and folds
 *  the rest (a desk's own desk, then a teacher's classes, lead). */
export const STAFF_ITEMS: readonly PortalItem[] = [
  { id: "coordinator", route: "/portal/coordinator", name: "Coordinator desk", menuLabel: "Coordinator desk", deskLabel: "Class staff desk", icon: "School", access: ["coordinator", "coordinator-desk"], purpose: "Run your assigned school's classes: students, drills and attendance in one place." },
  { id: "classes", route: "/portal/teach", name: "My Classes", menuLabel: "My Classes", icon: "Presentation", access: ["class-teacher"], purpose: "Open the classes and students assigned to you." },
  { id: "post-work", route: "/portal/admin/assign", name: "Post / Tests", menuLabel: "Post / Tests", deskLabel: "Assign drill", icon: "ClipboardList", access: ["staff", "coordinator-desk"], purpose: "Assign learning activities and Exam Lab assessments." },
  { id: "users", route: "/portal/admin/users", name: "Users & activity", menuLabel: "Users & activity", icon: "UserCog", access: ["staff"], purpose: "Manage portal users and inspect authorised activity records." },
  { id: "attendance", route: "/portal/admin/attendance", name: "Attendance", menuLabel: "Attendance", icon: "CalendarCheck", access: ["staff"], purpose: "Record and manage lesson attendance." },
  { id: "daily-attendance", route: "/portal/admin/attendance-view", name: "Daily attendance", menuLabel: "Daily attendance", icon: "CalendarDays", access: ["staff", "registrar-desk", "coordinator-desk"], purpose: "Review the current attendance picture for authorised classes." },
  { id: "drill-records", route: "/portal/admin/drills", name: "Drill Records", menuLabel: "Drill Records", icon: "ClipboardCheck", access: ["drill-staff", "coordinator-desk"], purpose: "Look back at the class drills you conducted and how each student did." },
  { id: "analytics", route: "/portal/admin/analytics", name: "Rankings & analytics", menuLabel: "Rankings & analytics", icon: "ChartColumn", access: ["staff"], purpose: "Review performance evidence and portal analytics." },
  { id: "institutions", route: "/portal/admin/institutions", name: "Institutions", menuLabel: "Institutions", icon: "Building2", access: ["staff"], purpose: "Manage the school, class and group hierarchy." },
  { id: "announcements", route: "/portal/admin/notify", name: "Announcements", menuLabel: "Announcements", icon: "Megaphone", access: ["admin"], purpose: "Publish targeted announcements to portal users." },
  { id: "email", route: "/portal/admin/mail", name: "Email", menuLabel: "Email", icon: "Mail", access: ["staff"], purpose: "Manage portal email communication and delivery status." },
  { id: "proctoring", route: "/portal/admin/proctoring", name: "Proctoring & Locks", menuLabel: "Proctoring & Locks", icon: "ShieldCheck", access: ["staff"], purpose: "Monitor proctored assessments and exam restrictions." },
  { id: "academics", route: "/portal/admin/academics", name: "Academics", menuLabel: "Academics", icon: "GraduationCap", access: ["admin"], purpose: "Manage academic configuration and teaching structures." },
  { id: "finance", route: "/portal/admin/finance", name: "Fees & Finance", menuLabel: "Fees & Finance", icon: "Receipt", access: ["admin"], purpose: "Access authorised fee and finance administration." },
  { id: "access-locks", route: "/portal/admin/access", name: "Access locks", menuLabel: "Access locks", icon: "LockKeyhole", access: ["super-admin"], purpose: "Lock or suspend a user, group, class or school with a custom message." },
  { id: "demo-student-access", route: "/portal/admin/demo-student-access", name: "Private demo-student access", menuLabel: "Private demo-student access", icon: "LockKeyhole", access: ["super-admin"], listed: false, purpose: "Generate a fresh password for the private Portal QA Student." },
];

/** The registry entry for an id, or null for anything that isn't a subject. */
export function subjectOf(id: string): SubjectDef | null {
  return SUBJECTS.find((s) => s.id === id) ?? null;
}

/** The label an admin reads next to a switch: "Practical Lab (Physics)" for a
 *  subject that lives inside another, the plain label otherwise. */
export function subjectSwitchLabel(subject: SubjectDef): string {
  const parent = subject.partOf ? subjectOf(subject.partOf) : null;
  return parent ? `${subject.label} (${parent.label})` : subject.label;
}

/** The subjects an admin switches on per student (Digital SAT, Practical Lab). */
export const DIRECT_SUBJECTS: readonly SubjectDef[] = SUBJECTS.filter((s) => s.grant === "direct");

/** The subjects class enrolment grants (Physics). */
export const CLASS_SUBJECTS: readonly SubjectDef[] = SUBJECTS.filter((s) => s.grant === "class");

/** The subjects with a space of their own: every subject that isn't shown
 *  inside another (Physics, Digital SAT). */
export const SUBJECT_SPACES: readonly SubjectDef[] = SUBJECTS.filter((s) => !s.partOf);

/** The space a subject is shown in: the one it is part of (Practical Lab ->
 *  Physics), or its own. */
export function spaceOf(subject: SubjectDef): SubjectDef {
  return (subject.partOf ? subjectOf(subject.partOf) : null) ?? subject;
}

/** The page of a subject's space ("/portal/subjects/physics"). */
export function spaceRoute(id: SubjectId): string {
  return `/portal/subjects/${id}`;
}

/** The subject space a path opens ("/portal/subjects/sat" -> Digital SAT);
 *  null for any other path, and for a subject shown inside another. */
export function spaceForPath(pathname: string | null | undefined): SubjectDef | null {
  const match = /^\/portal\/subjects\/([a-z0-9-]+)\/?(?:[?#].*)?$/.exec((pathname || "").toLowerCase());
  const subject = match ? subjectOf(match[1]) : null;
  return subject && !subject.partOf ? subject : null;
}

/** The registry entry for a direct-grant subject id; null for a
 *  class-granted subject, an unknown id or a non-string. */
export function directSubjectOf(id: unknown): SubjectDef | null {
  const subject = typeof id === "string" ? subjectOf(id) : null;
  return subject?.grant === "direct" ? subject : null;
}

/** "A", "A and B", "A, B and C" (or "A or B" with `or`). */
export function listed(items: readonly string[], conjunction: "and" | "or" = "and"): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

const labels = (grant: SubjectDef["grant"]) => listed(SUBJECTS.filter((s) => s.grant === grant).map((s) => s.label));

/** The plain sentence for a request naming anything but a direct subject. */
export const DIRECT_SUBJECT_ONLY = `Only ${labels("direct")} can be added directly; ${labels("class")} comes from class enrolment.`;

// --- courses -------------------------------------------------------------------

/** The registry entry for a course id, or null. */
export function courseOf(id: string): CourseDef | null {
  return COURSES.find((c) => c.id === id) ?? null;
}

/** "A Level · 9702" (the course choice); "Digital SAT" for a course with no code. */
export function courseShortLabel(course: CourseDef): string {
  return course.code ? `${course.level} · ${course.code}` : course.level;
}

/** "A Level 9702" (staff lists). */
export function courseCodeLabel(course: CourseDef): string {
  return course.code ? `${course.level} ${course.code}` : course.level;
}

/** "A Level (9702)" (which class a student needs). */
export function courseClassLabel(course: CourseDef): string {
  return course.code ? `${course.level} (${course.code})` : course.level;
}

/** "CAIE 9702" (how Exam Lab work is named); the full name for a course
 *  with no board or code. */
export function courseBoardLabel(course: CourseDef): string {
  return course.board && course.code ? `${course.board} ${course.code}` : course.label;
}

/** The first lines of a new account's welcome email: its course's, or the
 *  general welcome for an account with no course. */
export function welcomeIntro(course: string | null | undefined): string {
  return (course ? courseOf(course)?.welcome : null) ?? GENERAL_WELCOME;
}

/** The subjects a set of courses opens, in registry order (9702 -> physics). */
export function subjectsForCourses(courses: readonly string[]): SubjectId[] {
  return SUBJECTS.filter((s) => s.courses.some((c) => courses.includes(c))).map((s) => s.id);
}

// --- places in the portal ------------------------------------------------------

/** Where a portal item sits: inside a subject, or in the general or staff group. */
export type ItemEntry =
  | { item: SubjectModule; subject: SubjectDef; group: "subject" }
  | { item: PortalItem; subject: null; group: "general" | "staff" };

/** Every place in the portal: each subject's modules (registry order), then
 *  the general items, then the staff consoles. */
export const ALL_ITEMS: readonly ItemEntry[] = [
  ...SUBJECTS.flatMap((subject) => subject.modules.map((item): ItemEntry => ({ item, subject, group: "subject" }))),
  ...GENERAL_ITEMS.map((item): ItemEntry => ({ item, subject: null, group: "general" })),
  ...STAFF_ITEMS.map((item): ItemEntry => ({ item, subject: null, group: "staff" })),
];

/** The entry for an item id. Every PortalItemId is described (the registry
 *  test checks), so a miss is a programming error. */
export function itemEntry(id: PortalItemId): ItemEntry {
  const entry = ALL_ITEMS.find((e) => e.item.id === id);
  if (!entry) throw new Error(`"${id}" isn't described in the subject registry.`);
  return entry;
}

export function portalItem(id: PortalItemId): PortalItem {
  return itemEntry(id).item;
}

/** A subject's space: its own listed modules and those of the subjects shown
 *  inside it (Practical Lab inside Physics), interleaved by `order`. */
export function spaceModules(spaceId: SubjectId): { module: SubjectModule; subject: SubjectDef }[] {
  return SUBJECTS
    .filter((s) => s.id === spaceId || s.partOf === spaceId)
    .flatMap((subject) => subject.modules.filter((module) => module.listed !== false).map((module) => ({ module, subject })))
    .sort((a, b) => a.module.order - b.module.order);
}

const pagePath = (route: string) => route.split(/[?#]/)[0];
const segmentsOf = (path: string) => path.split("/").filter(Boolean);
const isParam = (segment: string) => segment.startsWith("[") && segment.endsWith("]");

/** How closely a page covers a path: -1 when it doesn't; otherwise more for
 *  more segments, and a named segment beats a `[param]` one. */
function coverage(page: string, path: string, home: string): number {
  if (page === home) return path === home ? 0 : -1;
  const want = segmentsOf(page);
  const got = segmentsOf(path);
  if (got.length < want.length) return -1;
  let params = 0;
  for (let i = 0; i < want.length; i++) {
    if (isParam(want[i])) params++;
    else if (want[i] !== got[i]) return -1;
  }
  return want.length * 10 - params;
}

/** The item a portal path belongs to: the one whose page is the path or the
 *  closest prefix of it ("/portal/sat-lab/abc" -> SAT Today,
 *  "/portal/tasks/9" -> Assigned task). The portal home matches itself only.
 *  Query strings and #sections are ignored. null for a path no item covers. */
export function itemForPath(pathname: string | null | undefined): ItemEntry | null {
  const path = pagePath(pathname || "").replace(/(.)\/+$/, "$1").toLowerCase();
  const home = pagePath(portalItem("home").route);
  let best: ItemEntry | null = null;
  let bestScore = -1;
  for (const entry of ALL_ITEMS) {
    const score = coverage(pagePath(entry.item.route), path, home);
    // The first item wins a tie: two items on one page (SAT Today and its
    // Practice section) name the page after the first.
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

/** The item a menu link opens (its exact page), or null. */
export function itemForRoute(route: string | null | undefined): PortalItem | null {
  if (!route) return null;
  return ALL_ITEMS.find((e) => e.item.route === route)?.item ?? null;
}

/** The practice module a subject points to, when it has one. */
export function practiceItemOf(subject: SubjectDef): PortalItem | null {
  return subject.practice ? portalItem(subject.practice) : null;
}

/** The helper persona for a page: on a subject's page or space, that
 *  subject's persona (or that of the space it sits in -- Practical Lab shows
 *  Physics' helper), none when the subject has none (the SAT has its own
 *  tutor); anywhere else, the first subject's persona. */
export function helperForPath(pathname: string | null | undefined): HelperPersona | null {
  const subject = spaceForPath(pathname) ?? itemForPath(pathname)?.subject;
  if (!subject) return defaultHelper();
  const space = subject.partOf ? subjectOf(subject.partOf) : null;
  return subject.helper ?? space?.helper ?? null;
}

/** The first subject's helper (Physics' Einstein): pages outside any subject use it. */
export function defaultHelper(): HelperPersona | null {
  return SUBJECTS.find((s) => s.helper)?.helper ?? null;
}

// --- who sees what ---------------------------------------------------------------

/** The audiences a set of roles belongs to (see Audience). */
export function audiencesOf(roles: readonly EduRole[]): Set<Audience> {
  const audiences = new Set<Audience>(["everyone"]);
  if (isRegistrarOnly(roles)) return audiences.add("registrar-desk");
  if (isCoordinatorOnly(roles)) return audiences.add("coordinator-desk");
  audiences.add("member");
  if (isStaff(roles)) audiences.add("staff");
  if (isAdmin(roles)) audiences.add("admin");
  if (roles.includes("super_admin")) audiences.add("super-admin");
  if (roles.includes("coordinator")) audiences.add("coordinator");
  if (isAdmin(roles) || roles.includes("teacher") || roles.includes("teaching_assistant")) audiences.add("class-teacher");
  if (canConductDrills(roles)) audiences.add("drill-staff");
  if (isExamLabStaff(roles)) audiences.add("exam-lab-staff");
  if (roles.includes("student")) audiences.add("student");
  if (roles.includes("parent")) audiences.add("parent");
  return audiences;
}

/**
 * What the server knows about a viewer, all the registry needs:
 * - `roles`: their (effective) roles;
 * - `courses`: the courses course access opens for them
 *   (course-access.ts `resolveCourseAccess(user).allowed`: their classes and
 *   direct grants -- SAT by class or by grant). For a parent, pass their
 *   children's courses when known, else none;
 * - `practicalLab`: whether Practical Lab is switched on for them
 *   (practical-lab.ts `practicalLabAccess(user).ok`).
 */
export type ViewerFacts = { roles: readonly EduRole[]; courses: readonly string[]; practicalLab: boolean };

/**
 * The subjects a viewer has -- THE rule behind `visibleItems` (and so behind
 * the subject picker, the spaces, the finder and the app's module list):
 * - Exam Lab staff (teacher, coordinator, facilitator, admin, super admin):
 *   every subject -- they teach across all of them and their menu has always
 *   listed Exam Lab, Practical Lab and the SAT Lab;
 * - everyone else: the subjects of their own courses, plus Practical Lab when
 *   it is switched on for them;
 * - and anyone who isn't a student -- other staff, parents, an account with
 *   no role -- also keeps the class-granted subjects (Physics), whose shared
 *   pages (Physics Resources, Physics Studio for staff) they have always had.
 * A student has only their own: a student in no physics class has no Physics.
 * With a physics course assumed for students, this shows exactly what the
 * portal menu showed before the registry for every combination of the 12
 * roles and both switches (scripts/test-subject-registry.mjs).
 */
export function viewerSubjects({ roles, courses, practicalLab }: ViewerFacts): SubjectId[] {
  if (isExamLabStaff(roles)) return SUBJECTS.map((s) => s.id);
  const has = new Set<SubjectId>(subjectsForCourses(courses));
  if (practicalLab) has.add("practical-lab");
  if (!roles.includes("student") || isStaff(roles)) for (const s of CLASS_SUBJECTS) has.add(s.id);
  return SUBJECTS.filter((s) => has.has(s.id)).map((s) => s.id);
}

function seen(entry: ItemEntry, audiences: ReadonlySet<Audience>, subjects: readonly SubjectId[]): boolean {
  if (entry.item.listed === false) return false;
  if (entry.subject && !subjects.includes(entry.subject.id)) return false;
  return entry.item.access.some((a) => audiences.has(a));
}

/** Whether a viewer sees an item: it is listed, they are in one of its
 *  audiences and, for a subject's module, they have that subject
 *  (`viewerSubjects`). */
export function canSee(entry: ItemEntry, viewer: ViewerFacts): boolean {
  return seen(entry, audiencesOf(viewer.roles), viewerSubjects(viewer));
}

/** Every place a viewer sees, in ALL_ITEMS order: the one visibility rule
 *  the subject-first navigation and the app's module list use. */
export function visibleItems(viewer: ViewerFacts): ItemEntry[] {
  const audiences = audiencesOf(viewer.roles);
  const subjects = viewerSubjects(viewer);
  return ALL_ITEMS.filter((entry) => seen(entry, audiences, subjects));
}

// --- direct grants -----------------------------------------------------------------

export type DirectGrant = { by: string; at: string };

/** Where a student's direct grants live in the portal-data bucket. */
export const grantsDocPath = (uid: string) => `subjects/${uid}.json`;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The well-formed direct grants in a stored subjects doc's `grants` field:
 *  only direct-grant subjects with a text `by` and `at` survive; anything
 *  else (a class subject, an unknown id, a malformed row) is dropped. The one
 *  rule behind subject-grants.ts and the middleware's /lab gate. */
export function directGrantsIn(stored: unknown): Partial<Record<SubjectId, DirectGrant>> {
  const grants: Partial<Record<SubjectId, DirectGrant>> = {};
  if (!isRecord(stored)) return grants;
  for (const subject of DIRECT_SUBJECTS) {
    const grant = stored[subject.id];
    if (isRecord(grant) && typeof grant.by === "string" && typeof grant.at === "string") {
      grants[subject.id] = { by: grant.by, at: grant.at };
    }
  }
  return grants;
}

/** The courses a student's direct grants open, in registry order. Only
 *  direct-grant subjects count: a class-granted subject (physics) never
 *  becomes a course from a grant record, and Practical Lab opens none. */
export function coursesFromGrants(grants: Partial<Record<SubjectId, unknown>>): Course[] {
  const courses: Course[] = [];
  for (const subject of SUBJECTS) {
    if (subject.grant !== "direct" || !grants[subject.id]) continue;
    for (const course of subject.courses) if (!courses.includes(course)) courses.push(course);
  }
  return courses;
}
