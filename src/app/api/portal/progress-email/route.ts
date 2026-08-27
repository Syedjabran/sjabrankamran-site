import { NextResponse } from "next/server";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardianEmails, EMAIL_RE } from "@/lib/portal/onboarding";
import { buildStats, composeProgressEmail } from "@/lib/portal/progress-report";
import { sendMail, mailConfigured } from "@/lib/portal/mail";

export const runtime = "nodejs";
export const maxDuration = 300;

function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${esc.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Generate & send AI progress reports for a class (or one student).
 * Auth: a staff portal session (manual button) OR the service-role key in
 * `x-admin-key` (used by the scheduled VPS agent — no extra secret needed).
 * Body: { classId?, studentUid?, toParents?=true, toStudent?=true, dryRun?=false }
 */
export async function POST(req: Request) {
  const keyHeader = req.headers.get("x-admin-key");
  const isSystem = !!keyHeader && !!process.env.SUPABASE_SERVICE_ROLE_KEY && keyHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;
  let actorId = "system";
  let actorName = "Progress agent";
  if (!isSystem) {
    const user = await getPortalUser();
    if (!user || !isStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
    actorId = user.id;
    actorName = user.fullName || user.email;
  }

  const b = (await req.json().catch(() => null)) as {
    classId?: string; studentUid?: string; toParents?: boolean; toStudent?: boolean; dryRun?: boolean;
  } | null;
  if (!b || (!b.classId && !b.studentUid)) return NextResponse.json({ error: "classId or studentUid required." }, { status: 400 });
  const toParents = b.toParents !== false;
  const toStudent = b.toStudent !== false;
  // Auto dry-run when the Gmail relay isn't connected yet, so the scheduled
  // agent never builds a queue backlog before sending is possible.
  const dryRun = !!b.dryRun || !mailConfigured();

  const supabase = createAdminClient();

  // Resolve targets: [{ studentId, uid, name, email, className }]
  type Target = { studentId: string; uid: string; name: string; email: string; className: string };
  const targets: Target[] = [];

  if (b.classId) {
    const [{ data: enr }, { data: cls }] = await Promise.all([
      supabase.from("edu_enrolments").select("edu_students(id, profile_id, edu_profiles(full_name, email))").eq("class_id", b.classId).eq("status", "active"),
      supabase.from("edu_classes").select("name").eq("id", b.classId).maybeSingle(),
    ]);
    const className = (cls as { name?: string } | null)?.name || "Physics";
    type Row = { edu_students?: { id: string; profile_id: string; edu_profiles?: { full_name?: string; email?: string } } };
    for (const r of (enr || []) as unknown as Row[]) {
      const s = r.edu_students;
      if (!s?.id || !s.profile_id) continue;
      targets.push({ studentId: s.id, uid: s.profile_id, name: s.edu_profiles?.full_name || s.edu_profiles?.email || "Student", email: s.edu_profiles?.email || "", className });
    }
  } else if (b.studentUid) {
    const { data: s } = await supabase.from("edu_students").select("id, profile_id, edu_profiles(full_name, email)").eq("profile_id", b.studentUid).maybeSingle();
    const row = s as { id: string; profile_id: string; edu_profiles?: { full_name?: string; email?: string } } | null;
    if (row) {
      const { data: enr } = await supabase.from("edu_enrolments").select("edu_classes(name)").eq("student_id", row.id).eq("status", "active").limit(1).maybeSingle();
      const className = (enr as { edu_classes?: { name?: string } } | null)?.edu_classes?.name || "Physics";
      targets.push({ studentId: row.id, uid: row.profile_id, name: row.edu_profiles?.full_name || "Student", email: row.edu_profiles?.email || "", className });
    }
  }

  if (targets.length === 0) return NextResponse.json({ error: "No students found." }, { status: 404 });

  const results: { name: string; sentTo: string[]; queued: number; sent: number; skipped?: string }[] = [];
  for (const t of targets) {
    const stats = await buildStats(t.uid, t.studentId, t.name, t.className);
    // Skip students with zero activity AND no attendance — nothing to report yet.
    if (stats.attempts === 0 && stats.attendancePct == null) {
      results.push({ name: t.name, sentTo: [], queued: 0, sent: 0, skipped: "no activity yet" });
      continue;
    }

    const sentTo: string[] = [];
    let queued = 0, sent = 0;

    if (toStudent && EMAIL_RE.test(t.email)) {
      const em = await composeProgressEmail(stats, false);
      if (!dryRun) {
        const r = await sendMail({ to: [t.email], subject: em.subject, text: em.body, html: textToHtml(em.body), by: actorId, byName: actorName, kind: "progress", meta: { studentUid: t.uid, audience: "student" } });
        if (r.status === "sent") sent++; else queued++;
      }
      sentTo.push(t.email);
    }
    if (toParents) {
      const parents = await guardianEmails(t.uid);
      if (parents.length) {
        const em = await composeProgressEmail(stats, true);
        if (!dryRun) {
          const r = await sendMail({ to: parents, subject: em.subject, text: em.body, html: textToHtml(em.body), by: actorId, byName: actorName, kind: "progress", meta: { studentUid: t.uid, audience: "parents" } });
          if (r.status === "sent") sent++; else queued++;
        }
        sentTo.push(...parents);
      }
    }
    results.push({ name: t.name, sentTo, queued, sent });
  }

  const summary = {
    students: targets.length,
    emailed: results.filter((r) => r.sentTo.length).length,
    skipped: results.filter((r) => r.skipped).length,
    totalSent: results.reduce((s, r) => s + r.sent, 0),
    totalQueued: results.reduce((s, r) => s + r.queued, 0),
  };
  return NextResponse.json({ ok: true, dryRun, mailConfigured: mailConfigured(), summary, results }, { status: 200 });
}
