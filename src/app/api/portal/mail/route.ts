import { NextResponse } from "next/server";
import { getPortalUser, canAccessGlobalStaffData } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, sendMailBatched, listMail, type MailStatus } from "@/lib/portal/mail";
import { guardianEmails, EMAIL_RE } from "@/lib/portal/onboarding";

export const runtime = "nodejs";
// A class broadcast is one message per family, so allow for a few dozen sends.
export const maxDuration = 60;

function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${esc.replace(/\n/g, "<br>")}</div>`;
}

// Resolve a class broadcast into one address list PER FAMILY (the student
// and/or their guardians), so no family sees another family's addresses.
async function classFamilies(classId: string, audience: "students" | "parents" | "both"): Promise<string[][]> {
  const supabase = createAdminClient();
  const { data: enr } = await supabase
    .from("edu_enrolments")
    .select("edu_students(profile_id, edu_profiles!edu_students_profile_id_fkey(email))")
    .eq("class_id", classId)
    .eq("status", "active");
  type Row = { edu_students?: { profile_id: string; edu_profiles?: { email?: string } } };
  const rows = (enr || []) as unknown as Row[];
  const seen = new Set<string>();
  const families: string[][] = [];
  for (const r of rows) {
    const uid = r.edu_students?.profile_id;
    if (!uid) continue;
    const family = new Set<string>();
    if (audience === "students" || audience === "both") {
      const e = r.edu_students?.edu_profiles?.email;
      if (e && EMAIL_RE.test(e.trim())) family.add(e.trim());
    }
    if (audience === "parents" || audience === "both") {
      for (const g of await guardianEmails(uid)) family.add(g);
    }
    // An address shared by siblings' families is only mailed once.
    const fresh = [...family].filter((e) => !seen.has(e.toLowerCase()));
    fresh.forEach((e) => seen.add(e.toLowerCase()));
    if (fresh.length) families.push(fresh);
  }
  return families;
}

/** One status for a batch: "sent" only when every message went out. */
function overallStatus(statuses: MailStatus[]): MailStatus {
  if (statuses.every((s) => s === "sent")) return "sent";
  return statuses.some((s) => s === "queued") ? "queued" : "failed";
}

export async function GET() {
  const user = await getPortalUser();
  if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Global mail access is not permitted for class-scoped staff." }, { status: 403 });
  return NextResponse.json({ items: await listMail(200) }, { status: 200 });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Global mail access is not permitted for class-scoped staff." }, { status: 403 });

  const b = (await req.json().catch(() => null)) as {
    mode?: "emails" | "class";
    to?: string[]; classId?: string; audience?: "students" | "parents" | "both";
    subject?: string; body?: string;
  } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const subject = (b.subject || "").trim();
  const body = (b.body || "").trim();
  if (!subject || !body) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });

  const base = { subject, text: body, html: textToHtml(body), by: user.id, byName: user.fullName || user.email, kind: "manual" as const };

  if (b.mode === "class" && b.classId) {
    const families = await classFamilies(b.classId, b.audience || "both");
    if (families.length === 0) return NextResponse.json({ error: "No valid recipients." }, { status: 400 });
    const results = await sendMailBatched(
      families.map((to) => ({ ...base, to, meta: { classId: b.classId, audience: b.audience } })),
    );
    const count = (s: MailStatus) => results.filter((r) => r.status === s).length;
    return NextResponse.json({
      ok: true,
      status: overallStatus(results.map((r) => r.status)),
      recipients: families.reduce((n, f) => n + f.length, 0),
      messages: results.length, sent: count("sent"), queued: count("queued"), failed: count("failed"),
    }, { status: 200 });
  }

  const to = (b.to || []).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e));
  if (to.length === 0) return NextResponse.json({ error: "No valid recipients." }, { status: 400 });
  const res = await sendMail({ ...base, to });
  return NextResponse.json({ ok: true, ...res, recipients: to.length }, { status: 200 });
}
