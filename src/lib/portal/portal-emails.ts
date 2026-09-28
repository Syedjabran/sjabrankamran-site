/**
 * The portal's own emails, as pure functions of the brand (brand.ts) and the
 * subject registry (subjects.ts): a new account's sign-in details, an
 * admin's password reset, the "Forgot password?" link, and the AI progress
 * report's prompt and fallback text.
 *
 * Course-aware: each builder takes the account's courses and words the email
 * for them.
 * - Courses of one subject (an A Level or O Level physics student, an SAT
 *   student): that subject's portal ("Physics portal", "Digital SAT
 *   portal"), its course's welcome and teacher -- O Level before A Level for
 *   a student in both, as course access ranks them -- and a sign-off naming
 *   the subject. An A Level student's emails are word for word what the
 *   portal always sent.
 * - Courses of several subjects (physics and the SAT): the portal's own name,
 *   a welcome naming the subjects, and the site alone under the sign-off (as
 *   the SAT's combined parent email signs).
 * - No course (staff, parents, a student not yet placed): the portal's own
 *   name and the general welcome.
 * A new course is a registry entry and a rebrand a brand.ts change; nothing
 * here names a subject or the site.
 *
 * Pure (no server imports), so the tests render every variant without
 * sending anything.
 */
import {
  PORTAL_CONTACT_EMAIL, PORTAL_LOGIN_URL, PORTAL_NAME, PORTAL_SENDER_NAME, PORTAL_SITE_NAME, PORTAL_SITE_URL,
} from "./brand.ts";
import { DEFAULT_COURSE, primaryCourse, type Course } from "./course-labels.ts";
import {
  classGrantedCourses, courseOf, listed, subjectOf, subjectsForCourses, welcomeIntro, type SubjectDef,
} from "./subjects.ts";

/** An account's courses, in any order; empty for none. */
export type Courses = readonly Course[];

export type Email = { subject: string; text: string; html: string };

/** The subjects the courses belong to, in registry order. */
function subjectsOf(courses: Courses): SubjectDef[] {
  return subjectsForCourses(courses).map(subjectOf).filter((s): s is SubjectDef => s !== null);
}

/** The one subject the courses belong to ("Physics", "Digital SAT"); null
 *  for no course, or courses of several subjects. */
export function subjectName(courses: Courses): string | null {
  const subjects = subjectsOf(courses);
  return subjects.length === 1 ? subjects[0].label : null;
}

/** The course whose wording an email uses: the one course, or the one course
 *  access shows first; null unless the courses are of one subject. */
function leadCourse(courses: Courses): Course | null {
  return subjectName(courses) ? primaryCourse(new Set(courses)) : null;
}

/** What an email calls the portal: "Physics portal", "Digital SAT portal";
 *  the portal's own name for no course or several subjects. */
export function portalTitle(courses: Courses): string {
  const subject = subjectName(courses);
  return subject ? `${subject} portal` : PORTAL_NAME;
}

/** A new account's first lines: its course's welcome (subjects.ts), the
 *  general welcome for no course, or for several subjects the portal's
 *  welcome naming them. */
export function welcomeLines(courses: Courses): string {
  const subjects = subjectsOf(courses);
  if (subjects.length < 2) return welcomeIntro(leadCourse(courses));
  return `Welcome to the ${PORTAL_NAME}. You now have your own account for ${listed(subjects.map((s) => s.label))}, where you can sit past papers and practice tests with instant marking and feedback, and track your progress through the year.`;
}

/** The sign-off under an email, one line each: "Warm regards,", the sender,
 *  then the subject and the site ("Physics | <site>") -- the site
 *  alone for no course or several subjects. */
export function signOff(courses: Courses, separator = " | "): string[] {
  const subject = subjectName(courses);
  return ["Warm regards,", PORTAL_SENDER_NAME, subject ? `${subject}${separator}${PORTAL_SITE_NAME}` : PORTAL_SITE_NAME];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wrap = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${inner}</div>`;

/**
 * A new account's welcome with its sign-in details, or (`isReset`) the new
 * details after an admin reset the password. `courses`: the account's
 * courses (admin.ts welcomeCoursesFor for a new account, accountCoursesFor
 * for a reset).
 */
export function credentialsEmail(name: string, email: string, password: string, isReset = false, courses: Courses = []): Email {
  const portal = portalTitle(courses);
  const subject = isReset
    ? `Your ${portal} password has been reset`
    : `Your ${portal} login - ${PORTAL_SITE_NAME}`;
  const intro = isReset
    ? `Your ${portal} password has been reset. Here are your current sign-in details.`
    : welcomeLines(courses);
  const text = `Dear ${name},

${intro}

YOUR LOGIN
Portal: ${PORTAL_LOGIN_URL}
Email: ${email}
${isReset ? "New password" : "Temporary password"}: ${password}

${isReset ? "" : `FIRST LOGIN - please do this first
On your first sign-in you will be asked to complete a short profile form (about two minutes). It asks for your details and a valid PARENT / GUARDIAN email and WhatsApp number, so we can send progress updates. You only do this once, and the rest of the portal unlocks after you submit it.

`}Please keep your password private. You can change it any time using "Forgot password?" on the login page.

NEED HELP?
For anything at all, reply to this email (${PORTAL_CONTACT_EMAIL}) or visit ${PORTAL_SITE_URL} .

${signOff(courses).join("\n")}`;
  return { subject, text, html: wrap(esc(text).replace(/\n/g, "<br>")) };
}

/** The "Forgot password?" email: the reset link (valid for an hour), worded
 *  for the account's `courses` (admin.ts accountCoursesFor). */
export function recoveryEmail(name: string, link: string, courses: Courses = []): Email {
  const label = subjectName(courses);
  const text = `Dear ${name},

We received a request to reset your password for the ${label ? `${label} learning portal` : PORTAL_NAME}.

Reset your password (link valid for 1 hour):
${link}

If you didn't request this, you can safely ignore this email — your password stays unchanged.

${signOff(courses).join("\n")}`;
  const linkHtml = `<a href="${link}" style="color:#1436d6">Reset my password</a>`;
  return {
    subject: `Reset your ${portalTitle(courses)} password`,
    text,
    html: wrap(esc(text).replace(esc(link), linkHtml).replace(/\n/g, "<br>")),
  };
}

// --- progress reports ----------------------------------------------------------------

export type ProgressStats = {
  name: string;
  className: string;
  /** The courses the report is written for (reportCourses): its subject, its
   *  teacher and its sign-off. */
  courses: Course[];
  attempts: number;
  papersSat: number;
  scoredQuestions: number;
  accuracy: number | null;
  level: number;
  levelLabel: string;
  strengths: string[];
  focus: string[];
  attendancePct: number | null;
  trend: "up" | "down" | "flat" | "n/a";
  lastActive: number | null;
  tasksOpen: number;
  tasksCompleted: number;
  assignmentsSubmitted: number;
  assignmentsOutstanding: number;
};

/**
 * The courses a student's progress report is written for, from their courses
 * (null: they couldn't be read). The report covers class work and the Exam
 * Lab, so it is about their class-granted courses (Physics) when they take
 * any -- the SAT has its own report -- and otherwise their other courses (the
 * SAT alone). A student with no course, or whose courses couldn't be read,
 * gets the Physics report every student got before courses were read.
 */
export function reportCourses(courses: Courses | null): Course[] {
  const taught = classGrantedCourses(courses ?? []);
  if (taught.length) return taught;
  return courses?.length ? [...courses] : [DEFAULT_COURSE];
}

/** Who the report's writer is: "Cambridge A-Level Physics teacher",
 *  "Digital SAT tutor" (the registry's course), or a teacher. */
export function teacherOf(courses: Courses): string {
  const course = leadCourse(courses);
  return (course ? courseOf(course)?.teacher : null) ?? "teacher";
}

/** The deterministic report (no AI, or when the AI call fails). */
export function fallbackProgressEmail(s: ProgressStats, forParent: boolean, recipientName?: string): { subject: string; body: string } {
  const label = subjectName(s.courses);
  const who = forParent ? `your child ${s.name}` : "you";
  const acc = s.accuracy != null ? `${s.accuracy}%` : "not enough scored questions yet";
  const trendLine = s.trend === "up" ? "The trend is improving — keep it up." :
    s.trend === "down" ? "Accuracy has dipped recently; a little more consistent practice will help." :
    s.trend === "flat" ? "Performance is steady." : "";
  const lines = [
    `Dear ${forParent ? (recipientName || "Parent/Guardian") : s.name},`,
    "",
    `Here is a brief ${label ? `${label} ` : ""}progress update for ${who} (${s.className}).`,
    "",
    `• Exam Lab practice: ${s.attempts} session(s), ${s.papersSat} full paper(s), ${s.scoredQuestions} questions scored.`,
    `• Overall accuracy: ${acc}.`,
    `• Progress level: ${s.level}/10 (${s.levelLabel}).`,
    s.attendancePct != null ? `• Class attendance: ${s.attendancePct}%.` : "",
    `• Assignments: ${s.assignmentsSubmitted} submitted; ${s.assignmentsOutstanding} outstanding.`,
    `• Personal study plan: ${s.tasksCompleted} completed; ${s.tasksOpen} outstanding.`,
    s.strengths.length ? `• Strengths: ${s.strengths.join(", ")}.` : "",
    s.focus.length ? `• Focus areas: ${s.focus.join(", ")}.` : "",
    trendLine ? `• ${trendLine}` : "",
    "",
    "Please keep practising regularly on the portal. Do reach out if you have any questions.",
    "",
    ...signOff(s.courses, " — "),
  ].filter((l) => l !== "");
  return { subject: `${label ? `${label} progress update` : "Progress update"} — ${s.name}`, body: lines.join("\n") };
}

/** The AI's instructions for one report: written as the sender, the teacher
 *  of the report's course. */
export function progressPrompt(s: ProgressStats, forParent: boolean, recipientName?: string): string {
  const audience = forParent
    ? "the student's parent/guardian (address them warmly and refer to the student by name in the third person)"
    : "the student directly (encouraging, second person)";
  return `You are ${PORTAL_SENDER_NAME}, an experienced ${teacherOf(s.courses)}. Write a short, warm, professional progress-update email to ${audience}. British English. 130-190 words. No markdown, plain text with short bullet lines using "• ". End with a sign-off "Warm regards,\\n${PORTAL_SENDER_NAME}".

Student: ${s.name}
Recipient name: ${recipientName || (forParent ? "Parent/Guardian" : s.name)}
Class: ${s.className}
Data:
- Exam Lab sessions: ${s.attempts}; full papers: ${s.papersSat}; scored questions: ${s.scoredQuestions}
- Overall accuracy: ${s.accuracy != null ? s.accuracy + "%" : "insufficient data"}
- Progress level: ${s.level}/10 (${s.levelLabel})
- Attendance: ${s.attendancePct != null ? s.attendancePct + "%" : "n/a"}
- Assignments submitted/outstanding: ${s.assignmentsSubmitted}/${s.assignmentsOutstanding}
- Study-plan tasks completed/outstanding: ${s.tasksCompleted}/${s.tasksOpen}
- Strengths: ${s.strengths.join(", ") || "n/a"}
- Focus areas: ${s.focus.join(", ") || "n/a"}
- Recent trend: ${s.trend}

Reply in EXACTLY this format:
SUBJECT: <subject line>
BODY:
<the email body>`;
}
