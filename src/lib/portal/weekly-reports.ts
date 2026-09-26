import { createAdminClient } from "@/lib/supabase/admin";
import { guardianContacts, isOnboardingComplete } from "@/lib/portal/onboarding";
import { buildStats, composeProgressEmail, type ProgressStats } from "@/lib/portal/progress-report";
import { sendMail } from "@/lib/portal/mail";
import { readStorageJson } from "@/lib/portal/forum";
import { resolveCourseAccess, type Course } from "@/lib/portal/course-access";
import { buildSatWeek } from "@/lib/sat/coach/parent-report";
import { composeParentEmail, runBeforeDeadline, sectionsOrPhysics, type SatWeek } from "@/lib/sat/coach/parent-report-core";

const BUCKET = "portal-data";
// No new student is started after this long from the run's start: the route
// has 300 s, and one student (Physics stats, SAT data, a guardian or two)
// fits comfortably in the minute left. Progress is checkpointed after EVERY
// completed student, so a run stopped here -- or killed anyway -- resumes
// where it stopped and a re-run never re-emails a family already done.
const DEADLINE_MS = 240_000;
// The SAT section's two-line AI summary is asked for only early in the run:
// one call can take ~20 s (plus a retry), so later students get the
// deterministic summary instead.
const AI_WINDOW_MS = 120_000;

type Db = ReturnType<typeof createAdminClient>;

const message = (e: unknown) => (e instanceof Error ? e.message : e);

/** The student's courses (the portal's own course access). Strict: a failed
 *  enrolment, registry or subject-grants read throws. */
async function coursesOf(uid: string): Promise<Course[]> {
  return (await resolveCourseAccess({ id: uid, email: "", fullName: "", roles: ["student"], status: "active" }, { strict: true })).allowed;
}

/** The Physics stats exactly as before the SAT section existed; null when the
 *  student has no edu_students row. */
async function physicsStats(db: Db, uid: string, name: string): Promise<ProgressStats | null> {
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
  if (!student?.id) return null;
  const { data: enrolment } = await db.from("edu_enrolments").select("edu_classes(name)").eq("student_id", student.id).eq("status", "active").limit(1).maybeSingle();
  const cls = (enrolment as unknown as { edu_classes?: { name?: string } } | null)?.edu_classes?.name || "Physics";
  return buildStats(uid, student.id, name, cls);
}

/** The student's SAT week (null: SAT not set up yet), or "unavailable" when
 *  its data couldn't be read -- logged, and the email says so. */
async function satWeekOf(uid: string, weekKey: string, fullName: string, ai: boolean): Promise<SatWeek | "unavailable" | null> {
  try {
    return await buildSatWeek(uid, weekKey, { ai, fullName, accessChecked: true });
  } catch (e) {
    console.error("saturday-parent-reports: SAT section failed", uid, message(e));
    return "unavailable";
  }
}

/**
 * One email per guardian with a section per subject (SAT Coach spec 9):
 * Physics exactly as before for every student who isn't SAT-only (a
 * physics-only email is unchanged), then Digital SAT; SAT-only students get
 * the SAT section alone. When the student's courses can't be read, the old
 * Physics-only email goes out. A student with no guardian email is skipped;
 * an SAT-only student whose SAT data can't be read counts as failed and stays
 * unsent, so a re-run retries them. `partial`: the run stopped at the
 * deadline with `remaining` students still to do (a re-run carries on).
 */
export async function sendSaturdayParentReports(weekKey: string) {
  const startedAt = Date.now();
  const db = createAdminClient();
  const markerPath = `weekly-parent-reports/${weekKey}.json`;
  // Cache-busted read; a failed read (not a missing marker) throws and aborts
  // the run rather than treating everyone as unsent and emailing them again.
  const marker = await readStorageJson<{ completed?: string[] }>(BUCKET, markerPath);
  const completed = new Set<string>(marker?.completed || []);
  const saveProgress = async () => {
    const body = new Blob([JSON.stringify({ week: weekKey, completed: [...completed], updated_at: new Date().toISOString() })], { type: "application/json" });
    await db.storage.from(BUCKET).upload(markerPath, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  };

  const { data: roleRows } = await db.from("edu_user_roles").select("user_id").eq("role", "student");
  const uids = [...new Set((roleRows || []).map((r) => r.user_id as string).filter(Boolean))];
  // Resolve onboarding concurrently in bounded batches; hundreds of sequential
  // Storage reads would exceed a serverless execution window.
  const eligible: string[] = [];
  for (let i = 0; i < uids.length; i += 25) {
    const batch = uids.slice(i, i + 25);
    const checks = await Promise.all(batch.map(async (uid) => ({ uid, ok: !completed.has(uid) && await isOnboardingComplete(uid) })));
    eligible.push(...checks.filter((x) => x.ok).map((x) => x.uid));
  }
  let sent = 0, queued = 0, skipped = uids.length - eligible.length, failed = 0;

  /** One student's emails; true when every guardian's was sent or queued. */
  async function reportStudent(uid: string): Promise<boolean> {
    if (completed.has(uid)) { skipped++; return false; }
    const [subjects, contacts] = await Promise.all([
      sectionsOrPhysics(() => coursesOf(uid), (e) => console.error("saturday-parent-reports: courses couldn't be read; sending the Physics email as before", uid, message(e))),
      guardianContacts(uid),
    ]);
    if (!contacts.length) { skipped++; return false; }
    const { data: profile } = await db.from("edu_profiles").select("full_name,email").eq("id", uid).maybeSingle();
    const name = profile?.full_name || profile?.email || "Student";
    const [stats, sat] = await Promise.all([
      subjects.physics ? physicsStats(db, uid, name) : Promise.resolve(null),
      // The SAT side never sees the email address: first name only.
      subjects.sat ? satWeekOf(uid, weekKey, profile?.full_name || "", Date.now() - startedAt < AI_WINDOW_MS) : Promise.resolve(null),
    ]);
    if (!stats && sat === "unavailable") { failed++; return false; }
    if (!stats && !sat) { skipped++; return false; }
    const sections = [stats ? "physics" : null, sat && sat !== "unavailable" ? "sat" : null].filter((s): s is string => s !== null);
    let allSent = true;
    for (const contact of contacts) {
      const physics = stats ? await composeProgressEmail(stats, true, contact.name, { ai: false }) : null;
      const email = composeParentEmail({ studentName: name, guardianName: contact.name, physics, sat });
      if (!email) { allSent = false; continue; }
      const result = await sendMail({ to: [contact.email], subject: email.subject, text: email.text, html: email.html, by: "system", byName: "Saturday progress service", kind: "progress", meta: { studentUid: uid, guardianName: contact.name, week: weekKey, sections } });
      if (result.status === "sent") sent++;
      else if (result.status === "queued") queued++;
      else allSent = false;
    }
    return allSent;
  }

  const run = await runBeforeDeadline(eligible, {
    now: Date.now,
    deadlineAt: startedAt + DEADLINE_MS,
    handle: reportStudent,
    onComplete: async (uid) => {
      completed.add(uid);
      await saveProgress();
    },
  });
  await saveProgress();
  return {
    ok: true, students: uids.length, completed: completed.size, sent, queued, skipped, failed,
    partial: run.partial, remaining: eligible.length - run.processed,
  };
}
