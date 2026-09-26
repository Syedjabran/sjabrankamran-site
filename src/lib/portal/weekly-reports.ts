import { createAdminClient } from "@/lib/supabase/admin";
import { guardianContacts, isOnboardingComplete } from "@/lib/portal/onboarding";
import { buildStats, composeProgressEmail, type ProgressStats } from "@/lib/portal/progress-report";
import { sendMail } from "@/lib/portal/mail";
import { readStorageJson } from "@/lib/portal/forum";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { buildSatWeek } from "@/lib/sat/coach/parent-report";
import { composeParentEmail, type SatWeek } from "@/lib/sat/coach/parent-report-core";

const BUCKET = "portal-data";
// Progress is checkpointed every N finished students (and at the end), so a
// run cut short by the serverless time limit resumes where it stopped and a
// re-run never re-emails families that already have this week's report.
const CHECKPOINT_EVERY = 5;
// The SAT section's two-line AI summary is asked for only early in the run:
// one call can take ~20 s (plus a retry) and the route has 300 s for every
// student, so later students get the deterministic summary instead.
const AI_WINDOW_MS = 120_000;

type Db = ReturnType<typeof createAdminClient>;
type Subjects = { physics: boolean; sat: boolean };

/** The sections a student's email has, from the portal's own course access:
 *  Physics for a 9702/5054 course, Digital SAT for SAT. Strict: a failed
 *  enrolment, registry or subject-grants read throws -- never "no subjects". */
async function subjectsOf(uid: string): Promise<Subjects> {
  const { allowed } = await resolveCourseAccess({ id: uid, email: "", fullName: "", roles: ["student"], status: "active" }, { strict: true });
  return { physics: allowed.includes("9702") || allowed.includes("5054"), sat: allowed.includes("SAT") };
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
    console.error("saturday-parent-reports: SAT section failed", uid, e instanceof Error ? e.message : e);
    return "unavailable";
  }
}

/**
 * One email per guardian with a section per subject the student has (SAT
 * Coach spec 9): Physics exactly as before (a physics-only email is
 * unchanged), then Digital SAT; SAT-only students get the SAT section alone.
 * A student with neither subject, or no guardian email, is skipped. A
 * student whose subjects -- or, for an SAT-only student, whose SAT data --
 * can't be read counts as failed and stays unsent, so a re-run retries them.
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
  let sent = 0, queued = 0, skipped = uids.length - eligible.length, failed = 0, unsaved = 0;
  for (const uid of eligible) {
    if (completed.has(uid)) { skipped++; continue; }
    let subjects: Subjects;
    let contacts: Awaited<ReturnType<typeof guardianContacts>>;
    try {
      [subjects, contacts] = await Promise.all([subjectsOf(uid), guardianContacts(uid)]);
    } catch (e) {
      failed++;
      console.error("saturday-parent-reports: subjects couldn't be read", uid, e instanceof Error ? e.message : e);
      continue;
    }
    if (!contacts.length || (!subjects.physics && !subjects.sat)) { skipped++; continue; }
    const { data: profile } = await db.from("edu_profiles").select("full_name,email").eq("id", uid).maybeSingle();
    const name = profile?.full_name || profile?.email || "Student";
    const [stats, sat] = await Promise.all([
      subjects.physics ? physicsStats(db, uid, name) : Promise.resolve(null),
      // The SAT side never sees the email address: first name only.
      subjects.sat ? satWeekOf(uid, weekKey, profile?.full_name || "", Date.now() - startedAt < AI_WINDOW_MS) : Promise.resolve(null),
    ]);
    if (!stats && sat === "unavailable") { failed++; continue; }
    if (!stats && !sat) { skipped++; continue; }
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
    if (allSent) {
      completed.add(uid);
      if (++unsaved >= CHECKPOINT_EVERY) { await saveProgress(); unsaved = 0; }
    }
  }
  await saveProgress();
  return { ok: true, students: uids.length, completed: completed.size, sent, queued, skipped, failed };
}
