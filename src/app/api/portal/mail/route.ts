import { NextResponse } from "next/server";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, listMail } from "@/lib/portal/mail";
import { guardianEmails, EMAIL_RE } from "@/lib/portal/onboarding";

export const runtime = "nodejs";

function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${esc.replace(/\n/g, "<br>")}</div>`;
}

// Resolve recipient emails for a class broadcast.
async function classRecipients(classId: string, audience: "students" | "parents" | "both") {
  const supabase = createAdminClient();
  const { data: enr } = await supabase
    .from("edu_enrolments")
    .select("edu_students(profile_id, edu_profiles(email))")
    .eq("class_id", classId)
    .eq("status", "active");
  type Row = { edu_students?: { profile_id: string; edu_profiles?: { email?: string } } };
  const rows = (enr || []) as unknown as Row[];
  const out = new Set<string>();
  for (const r of rows) {
    const uid = r.edu_students?.profile_id;
    if (!uid) continue;
    if (audience === "students" || audience === "both") {
      const e = r.edu_students?.edu_profiles?.email;
      if (e && EMAIL_RE.test(e)) out.add(e.trim());
    }
    if (audience === "parents" || audience === "both") {
      for (const g of await guardianEmails(uid)) out.add(g);
    }
  }
  return [...out];
}

export async function GET() {
  const user = await getPortalUser();
  if (!user || !isStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  return NextResponse.json({ items: await listMail(200) }, { status: 200 });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user || !isStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });

  const b = (await req.json().catch(() => null)) as {
    mode?: "emails" | "class";
    to?: string[]; classId?: string; audience?: "students" | "parents" | "both";
    subject?: string; body?: string;
  } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const subject = (b.subject || "").trim();
  const body = (b.body || "").trim();
  if (!subject || !body) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });

  let to: string[] = [];
  if (b.mode === "class" && b.classId) {
    to = await classRecipients(b.classId, b.audience || "both");
  } else {
    to = (b.to || []).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e));
  }
  if (to.length === 0) return NextResponse.json({ error: "No valid recipients." }, { status: 400 });

  const res = await sendMail({
    to, subject, text: body, html: textToHtml(body),
    by: user.id, byName: user.fullName || user.email, kind: "manual",
    meta: b.mode === "class" ? { classId: b.classId, audience: b.audience } : undefined,
  });
  return NextResponse.json({ ok: true, ...res, recipients: to.length }, { status: 200 });
}
