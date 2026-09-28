import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  credentialsEmail, fallbackProgressEmail, portalTitle, progressPrompt, recoveryEmail, reportCourses, signOff, subjectName,
  teacherOf, welcomeLines,
} from "../src/lib/portal/portal-emails.ts";
import {
  GENERATED_PASSWORD_PREFIX, PORTAL_CONTACT_EMAIL, PORTAL_LOGIN_URL, PORTAL_NAME, PORTAL_SENDER_NAME, PORTAL_SITE_NAME,
} from "../src/lib/portal/brand.ts";
import { COURSES, GENERAL_WELCOME, welcomeIntro } from "../src/lib/portal/subjects.ts";

// The portal's own emails (final fix wave, M7): the account, reset and
// "Forgot password?" emails and the progress report, worded for the
// account's courses from the brand (brand.ts) and the subject registry. An A
// Level student's emails are pinned word for word to what the portal sent
// before (e5d3e78); O Level, SAT-only, several-subject and no-course
// accounts get their own wording. Then: nothing under src/ writes the
// portal's mailbox or sign-in link out except brand.ts.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const A_LEVEL = ["9702"];
const O_LEVEL = ["5054"];
const SAT_ONLY = ["SAT"];
const PHYSICS_AND_SAT = ["9702", "SAT"];
const BOTH_PHYSICS = ["9702", "5054"];
const NONE = [];
const PASSWORD = `${GENERATED_PASSWORD_PREFIX}ABCDEFGHJK`;

// --- the registry's wording -----------------------------------------------------------

for (const course of COURSES) assert.ok(course.teacher && course.welcome, `${course.id}: a teacher and a welcome`);
assert.equal(subjectName(A_LEVEL), "Physics");
assert.equal(subjectName(O_LEVEL), "Physics");
assert.equal(subjectName(BOTH_PHYSICS), "Physics", "two courses of one subject");
assert.equal(subjectName(SAT_ONLY), "Digital SAT");
assert.equal(subjectName(PHYSICS_AND_SAT), null, "several subjects");
assert.equal(subjectName(NONE), null);
assert.equal(portalTitle(A_LEVEL), "Physics portal");
assert.equal(portalTitle(SAT_ONLY), "Digital SAT portal");
assert.equal(portalTitle(PHYSICS_AND_SAT), PORTAL_NAME);
assert.equal(portalTitle(NONE), PORTAL_NAME);
assert.equal(welcomeLines(A_LEVEL), welcomeIntro("9702"));
assert.equal(welcomeLines(O_LEVEL), welcomeIntro("5054"));
assert.equal(welcomeLines(BOTH_PHYSICS), welcomeIntro("5054"), "O Level first, as course access ranks them");
assert.equal(welcomeLines(SAT_ONLY), welcomeIntro("SAT"));
assert.equal(welcomeLines(NONE), GENERAL_WELCOME);
assert.equal(
  welcomeLines(PHYSICS_AND_SAT),
  `Welcome to the ${PORTAL_NAME}. You now have your own account for Physics and Digital SAT, where you can sit past papers and practice tests with instant marking and feedback, and track your progress through the year.`,
);
assert.equal(welcomeLines(["SAT", "5054"]), welcomeLines(PHYSICS_AND_SAT), "the subjects in registry order, whatever the courses' order");
assert.deepEqual(signOff(A_LEVEL), ["Warm regards,", PORTAL_SENDER_NAME, `Physics | ${PORTAL_SITE_NAME}`]);
assert.deepEqual(signOff(SAT_ONLY, " — "), ["Warm regards,", PORTAL_SENDER_NAME, `Digital SAT — ${PORTAL_SITE_NAME}`]);
assert.deepEqual(signOff(PHYSICS_AND_SAT), ["Warm regards,", PORTAL_SENDER_NAME, PORTAL_SITE_NAME]);
assert.deepEqual(signOff(NONE), ["Warm regards,", PORTAL_SENDER_NAME, PORTAL_SITE_NAME]);
assert.equal(teacherOf(A_LEVEL), "Cambridge A-Level Physics teacher");
assert.equal(teacherOf(O_LEVEL), "Cambridge O-Level Physics teacher");
assert.equal(teacherOf(BOTH_PHYSICS), "Cambridge O-Level Physics teacher");
assert.equal(teacherOf(SAT_ONLY), "Digital SAT tutor");
assert.equal(teacherOf(PHYSICS_AND_SAT), "teacher");
assert.equal(teacherOf(NONE), "teacher");

// --- a new account's welcome ----------------------------------------------------------

const A_LEVEL_WELCOME = `Dear Ayesha Khan,

Welcome to your A-Level Physics learning portal. You now have your own account where you can sit real CAIE 9702 past papers, take timed topic drills with instant marking and feedback, and track your progress through the year.

YOUR LOGIN
Portal: https://sjabrankamran.com/portal/login
Email: ayesha@example.com
Temporary password: Phy-ABCDEFGHJK

FIRST LOGIN - please do this first
On your first sign-in you will be asked to complete a short profile form (about two minutes). It asks for your details and a valid PARENT / GUARDIAN email and WhatsApp number, so we can send progress updates. You only do this once, and the rest of the portal unlocks after you submit it.

Please keep your password private. You can change it any time using "Forgot password?" on the login page.

NEED HELP?
For anything at all, reply to this email (physics@sjabrankamran.com) or visit https://sjabrankamran.com .

Warm regards,
Syed Jabran Ali Kamran
Physics | sjabrankamran.com`;

let email = credentialsEmail("Ayesha Khan", "ayesha@example.com", PASSWORD, false, A_LEVEL);
assert.equal(email.subject, "Your Physics portal login - sjabrankamran.com", "A Level: as before");
assert.equal(email.text, A_LEVEL_WELCOME, "A Level: word for word as before");
assert.equal(
  email.html,
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${A_LEVEL_WELCOME.replace(/\n/g, "<br>")}</div>`,
);

email = credentialsEmail("Bilal", "bilal@example.com", PASSWORD, false, O_LEVEL);
assert.equal(email.subject, "Your Physics portal login - sjabrankamran.com");
assert.ok(email.text.includes(welcomeIntro("5054")) && !/A-Level|9702/.test(email.text), "O Level: its own welcome");
assert.ok(email.text.endsWith("Physics | sjabrankamran.com"));

email = credentialsEmail("Sara", "sara@example.com", PASSWORD, false, SAT_ONLY);
assert.equal(email.subject, "Your Digital SAT portal login - sjabrankamran.com");
assert.ok(email.text.includes(welcomeIntro("SAT")));
assert.doesNotMatch(email.text, /Physics|CAIE/, "SAT only: no physics anywhere");
assert.ok(email.text.endsWith(`${PORTAL_SENDER_NAME}\nDigital SAT | sjabrankamran.com`));

email = credentialsEmail("Omar", "omar@example.com", PASSWORD, false, PHYSICS_AND_SAT);
assert.equal(email.subject, `Your ${PORTAL_NAME} login - sjabrankamran.com`, "several subjects: the portal's own name");
assert.ok(email.text.includes(welcomeLines(PHYSICS_AND_SAT)));
assert.ok(email.text.endsWith(`${PORTAL_SENDER_NAME}\nsjabrankamran.com`), "several subjects: the site alone");

email = credentialsEmail("Ms Rahman", "staff@example.com", PASSWORD);
assert.equal(email.subject, `Your ${PORTAL_NAME} login - sjabrankamran.com`, "no course (staff, parents)");
assert.ok(email.text.includes(GENERAL_WELCOME) && !/Physics|SAT/.test(email.text));

// Every variant links the sign-in page, names the mailbox and keeps the FIRST LOGIN block.
for (const courses of [A_LEVEL, O_LEVEL, SAT_ONLY, PHYSICS_AND_SAT, NONE]) {
  const { text } = credentialsEmail("N", "n@example.com", PASSWORD, false, courses);
  assert.ok(text.includes(`Portal: ${PORTAL_LOGIN_URL}`) && text.includes(`(${PORTAL_CONTACT_EMAIL})`) && text.includes("FIRST LOGIN"));
}
// Names are escaped in the HTML.
assert.ok(credentialsEmail("<b>&", "x@example.com", PASSWORD).html.includes("Dear &lt;b&gt;&amp;,"));

// --- an admin's password reset --------------------------------------------------------

const A_LEVEL_RESET = `Dear Ayesha Khan,

Your Physics portal password has been reset. Here are your current sign-in details.

YOUR LOGIN
Portal: https://sjabrankamran.com/portal/login
Email: ayesha@example.com
New password: Phy-ABCDEFGHJK

Please keep your password private. You can change it any time using "Forgot password?" on the login page.

NEED HELP?
For anything at all, reply to this email (physics@sjabrankamran.com) or visit https://sjabrankamran.com .

Warm regards,
Syed Jabran Ali Kamran
Physics | sjabrankamran.com`;

email = credentialsEmail("Ayesha Khan", "ayesha@example.com", PASSWORD, true, A_LEVEL);
assert.equal(email.subject, "Your Physics portal password has been reset", "A Level: as before");
assert.equal(email.text, A_LEVEL_RESET, "A Level: word for word as before");
assert.equal(credentialsEmail("B", "b@example.com", PASSWORD, true, O_LEVEL).subject, "Your Physics portal password has been reset");
email = credentialsEmail("Sara", "sara@example.com", PASSWORD, true, SAT_ONLY);
assert.equal(email.subject, "Your Digital SAT portal password has been reset");
assert.doesNotMatch(email.text, /Physics/);
assert.equal(credentialsEmail("O", "o@example.com", PASSWORD, true, PHYSICS_AND_SAT).subject, `Your ${PORTAL_NAME} password has been reset`);
assert.equal(credentialsEmail("T", "t@example.com", PASSWORD, true).subject, `Your ${PORTAL_NAME} password has been reset`);
assert.ok(!credentialsEmail("T", "t@example.com", PASSWORD, true).text.includes("FIRST LOGIN"));

// --- "Forgot password?" ------------------------------------------------------------------

const LINK = "https://project.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https://sjabrankamran.com/portal/auth/callback";
const A_LEVEL_RECOVERY = `Dear Ayesha Khan,

We received a request to reset your password for the Physics learning portal.

Reset your password (link valid for 1 hour):
${LINK}

If you didn't request this, you can safely ignore this email — your password stays unchanged.

Warm regards,
Syed Jabran Ali Kamran
Physics | sjabrankamran.com`;

email = recoveryEmail("Ayesha Khan", LINK, A_LEVEL);
assert.equal(email.subject, "Reset your Physics portal password", "A Level: as before");
assert.equal(email.text, A_LEVEL_RECOVERY, "A Level: word for word as before");
assert.ok(email.html.includes(`<a href="${LINK}" style="color:#1436d6">Reset my password</a>`), "the link is a button, not escaped text");
assert.ok(!email.html.includes("token=abc&amp;type"), "the escaped link text is replaced");
assert.equal(recoveryEmail("B", LINK, O_LEVEL).subject, "Reset your Physics portal password");
email = recoveryEmail("Sara", LINK, SAT_ONLY);
assert.equal(email.subject, "Reset your Digital SAT portal password");
assert.ok(email.text.includes("for the Digital SAT learning portal.") && !email.text.includes("Physics"));
email = recoveryEmail("Omar", LINK, PHYSICS_AND_SAT);
assert.equal(email.subject, `Reset your ${PORTAL_NAME} password`);
assert.ok(email.text.includes(`for the ${PORTAL_NAME}.`) && email.text.endsWith(`${PORTAL_SENDER_NAME}\nsjabrankamran.com`));
assert.equal(recoveryEmail("there", LINK).subject, `Reset your ${PORTAL_NAME} password`, "no course, or a failed read");

// --- progress reports --------------------------------------------------------------------

// The courses a report is about: class work and the Exam Lab, so Physics first.
assert.deepEqual(reportCourses(A_LEVEL), ["9702"]);
assert.deepEqual(reportCourses(O_LEVEL), ["5054"]);
assert.deepEqual(reportCourses(PHYSICS_AND_SAT), ["9702"], "physics and SAT: the Physics report (SAT has its own)");
assert.deepEqual(reportCourses(["SAT", "5054"]), ["5054"]);
assert.deepEqual(reportCourses(SAT_ONLY), ["SAT"], "SAT only: an SAT report");
assert.deepEqual(reportCourses(NONE), ["9702"], "no course: the Physics report, as before");
assert.deepEqual(reportCourses(null), ["9702"], "courses unreadable: the Physics report, as before");

const stats = (courses, over = {}) => ({
  name: "Ayesha Khan", className: "AS Physics G1", courses,
  attempts: 4, papersSat: 1, scoredQuestions: 30, accuracy: 72, level: 6, levelLabel: "Developing",
  strengths: ["Kinematics", "Waves"], focus: ["Electricity"], attendancePct: 90, trend: "up", lastActive: null,
  tasksOpen: 1, tasksCompleted: 2, assignmentsSubmitted: 3, assignmentsOutstanding: 1, ...over,
});

const A_LEVEL_REPORT = `Dear Ayesha Khan,
Here is a brief Physics progress update for you (AS Physics G1).
• Exam Lab practice: 4 session(s), 1 full paper(s), 30 questions scored.
• Overall accuracy: 72%.
• Progress level: 6/10 (Developing).
• Class attendance: 90%.
• Assignments: 3 submitted; 1 outstanding.
• Personal study plan: 2 completed; 1 outstanding.
• Strengths: Kinematics, Waves.
• Focus areas: Electricity.
• The trend is improving — keep it up.
Please keep practising regularly on the portal. Do reach out if you have any questions.
Warm regards,
Syed Jabran Ali Kamran
Physics — sjabrankamran.com`;

let report = fallbackProgressEmail(stats(A_LEVEL), false);
assert.equal(report.subject, "Physics progress update — Ayesha Khan", "A Level: as before");
assert.equal(report.body, A_LEVEL_REPORT, "A Level: word for word as before");
report = fallbackProgressEmail(stats(A_LEVEL), true, "Mrs Khan");
assert.ok(report.body.startsWith("Dear Mrs Khan,\nHere is a brief Physics progress update for your child Ayesha Khan (AS Physics G1)."));
assert.equal(fallbackProgressEmail(stats(O_LEVEL), true).subject, "Physics progress update — Ayesha Khan");
report = fallbackProgressEmail(stats(SAT_ONLY, { className: "Digital SAT" }), true);
assert.equal(report.subject, "Digital SAT progress update — Ayesha Khan");
assert.ok(report.body.includes("Here is a brief Digital SAT progress update for your child") && report.body.endsWith("Digital SAT — sjabrankamran.com"));
assert.doesNotMatch(report.body, /Physics/, "SAT only: no physics");
report = fallbackProgressEmail(stats(PHYSICS_AND_SAT), false);
assert.equal(report.subject, "Progress update — Ayesha Khan", "several subjects: no subject named");
assert.ok(report.body.includes("Here is a brief progress update for you") && report.body.endsWith(`${PORTAL_SENDER_NAME}\nsjabrankamran.com`));

const A_LEVEL_PROMPT_START = `You are Syed Jabran Ali Kamran, an experienced Cambridge A-Level Physics teacher. Write a short, warm, professional progress-update email to the student directly (encouraging, second person). British English. 130-190 words. No markdown, plain text with short bullet lines using "• ". End with a sign-off "Warm regards,\\nSyed Jabran Ali Kamran".

Student: Ayesha Khan
Recipient name: Ayesha Khan
Class: AS Physics G1
Data:
- Exam Lab sessions: 4; full papers: 1; scored questions: 30
`;
assert.ok(progressPrompt(stats(A_LEVEL), false).startsWith(A_LEVEL_PROMPT_START), "A Level: the prompt as before");
assert.ok(progressPrompt(stats(A_LEVEL), false).endsWith("Reply in EXACTLY this format:\nSUBJECT: <subject line>\nBODY:\n<the email body>"));
assert.match(progressPrompt(stats(O_LEVEL), true), /^You are Syed Jabran Ali Kamran, an experienced Cambridge O-Level Physics teacher\. .*to the student's parent\/guardian/);
assert.match(progressPrompt(stats(SAT_ONLY), true), /^You are Syed Jabran Ali Kamran, an experienced Digital SAT tutor\./);
assert.doesNotMatch(progressPrompt(stats(SAT_ONLY, { className: "Digital SAT" }), true), /Physics/);
assert.match(progressPrompt(stats(PHYSICS_AND_SAT), false), /^You are Syed Jabran Ali Kamran, an experienced teacher\./);

// --- the brand is written in one place ---------------------------------------------------

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const sources = files(SRC).filter((f) => /\.(tsx?|mjs|cjs|js|css|json|md)$/.test(f)).map((f) => ({ file: rel(f), text: fs.readFileSync(f, "utf8") }));
assert.ok(sources.length > 300, "the walk reads src/");

// Where the mailbox may still be written out, and why.
const MAILBOX_ALLOWED = new Map([
  ["src/lib/portal/brand.ts", "the one place the portal's brand is set"],
  ["src/app/layout.tsx", "the public website's structured data (its contact point), not the portal"],
]);
for (const { file, text } of sources) {
  if (!MAILBOX_ALLOWED.has(file)) assert.ok(!text.includes(PORTAL_CONTACT_EMAIL), `${file} writes the portal's mailbox out: use brand.ts PORTAL_CONTACT_EMAIL`);
  if (file !== "src/lib/portal/brand.ts") {
    assert.ok(!text.includes(PORTAL_LOGIN_URL), `${file} writes the sign-in link out: use brand.ts PORTAL_LOGIN_URL`);
    assert.doesNotMatch(text, new RegExp(`["'\`]${GENERATED_PASSWORD_PREFIX}`), `${file} writes the password prefix out`);
  }
}
for (const [file] of MAILBOX_ALLOWED) assert.ok(read(file).includes(PORTAL_CONTACT_EMAIL), `${file}: the allow-list is current`);

// The email modules carry no brand wording of their own, and the ones that
// send (everything but the builders, whose output is pinned above) no course
// wording either.
const BUILDERS = "src/lib/portal/portal-emails.ts";
for (const file of [
  BUILDERS, "src/lib/portal/admin.ts", "src/lib/portal/mail.ts", "src/lib/portal/progress-report.ts",
  "src/app/api/portal/forgot-password/route.ts", "src/app/api/portal/progress-email/route.ts", "src/lib/sat/coach/parent-report-core.ts",
]) {
  const text = read(file);
  assert.ok(!text.includes(PORTAL_SITE_NAME) && !text.includes(PORTAL_SENDER_NAME), `${file}: the site and sender come from brand.ts`);
  if (file !== BUILDERS) assert.doesNotMatch(text, /Physics (learning )?portal|A-Level Physics teacher/i, `${file}: course wording comes from the registry`);
}
assert.ok(read("src/lib/portal/admin.ts").includes("GENERATED_PASSWORD_PREFIX + s"), "genPassword reads the brand's prefix");
// The suspended and locked screens point to the brand's mailbox.
assert.ok(read("src/app/portal/(app)/layout.tsx").includes("contact your teacher at {PORTAL_CONTACT_EMAIL}"));
assert.ok(read("src/app/portal/(app)/portal-access-blocked.tsx").includes("For help, contact {PORTAL_CONTACT_EMAIL}."));

console.log("portal emails: all tests passed");
