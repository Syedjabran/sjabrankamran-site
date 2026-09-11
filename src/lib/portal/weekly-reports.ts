import { createAdminClient } from "@/lib/supabase/admin";
import { guardianContacts, isOnboardingComplete } from "@/lib/portal/onboarding";
import { buildStats, composeProgressEmail } from "@/lib/portal/progress-report";
import { sendMail } from "@/lib/portal/mail";

const BUCKET = "portal-data";
const html = (text: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;

export async function sendSaturdayParentReports(weekKey: string) {
  const db = createAdminClient();
  const markerPath = `weekly-parent-reports/${weekKey}.json`;
  let completed = new Set<string>();
  try {
    const { data } = await db.storage.from(BUCKET).download(markerPath);
    if (data) completed = new Set(((JSON.parse(await data.text()) as { completed?: string[] }).completed || []));
  } catch { /* first run */ }

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
  let sent = 0, queued = 0, skipped = uids.length - eligible.length;
  for (const uid of eligible) {
    if (completed.has(uid)) { skipped++; continue; }
    const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (!student?.id) { skipped++; continue; }
    const [{ data: profile }, { data: enrolment }, contacts] = await Promise.all([
      db.from("edu_profiles").select("full_name,email").eq("id", uid).maybeSingle(),
      db.from("edu_enrolments").select("edu_classes(name)").eq("student_id", student.id).eq("status", "active").limit(1).maybeSingle(),
      guardianContacts(uid),
    ]);
    if (!contacts.length) { skipped++; continue; }
    const cls = (enrolment as unknown as { edu_classes?: { name?: string } } | null)?.edu_classes?.name || "Physics";
    const stats = await buildStats(uid, student.id, profile?.full_name || profile?.email || "Student", cls);
    let allSent = true;
    for (const contact of contacts) {
      const email = await composeProgressEmail(stats, true, contact.name, { ai: false });
      const result = await sendMail({ to: [contact.email], subject: email.subject, text: email.body, html: html(email.body), by: "system", byName: "Saturday progress service", kind: "progress", meta: { studentUid: uid, guardianName: contact.name, week: weekKey } });
      if (result.status === "sent") sent++;
      else if (result.status === "queued") queued++;
      else allSent = false;
    }
    if (allSent) completed.add(uid);
  }
  const body = new Blob([JSON.stringify({ week: weekKey, completed: [...completed], updated_at: new Date().toISOString() })], { type: "application/json" });
  await db.storage.from(BUCKET).upload(markerPath, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  return { ok: true, students: uids.length, completed: completed.size, sent, queued, skipped };
}
