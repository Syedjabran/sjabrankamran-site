import { NextResponse } from "next/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { getStaffSchool } from "@/lib/portal/staff-school";
import { getRegistry } from "@/lib/portal/institutions";
import { resolveAudience, notify } from "@/lib/portal/notifications";
import { guardianEmails } from "@/lib/portal/onboarding";
import { sendMail } from "@/lib/portal/mail";
import { audit } from "@/lib/portal/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Coordinator-only school-scoped messages, announcements and show-cause notices. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user || (!user.roles.includes("coordinator") && !isAdmin(user.roles))) return NextResponse.json({ error: "Coordinators only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { classId?: string; studentUid?: string; title?: string; message?: string; sendEmail?: boolean; notice?: boolean } | null;
  const title = (b?.title || "").trim().slice(0, 200);
  const message = (b?.message || "").trim().slice(0, 4000);
  if (!title || !message) return NextResponse.json({ error: "A title and message are required." }, { status: 400 });
  const school = isAdmin(user.roles) ? null : await getStaffSchool(user.id);
  if (!isAdmin(user.roles) && !school) return NextResponse.json({ error: "Your coordinator account has not been assigned to a school yet." }, { status: 403 });
  const registry = await getRegistry();
  const cls = b?.classId ? registry.classes.find((c) => c.id === b.classId) : null;
  if (b?.classId && (!cls || (!!school && cls.school !== school))) return NextResponse.json({ error: "That class is outside your school." }, { status: 403 });
  let uids: string[] = [];
  if (b?.studentUid) {
    const permitted = school ? await resolveAudience({ audience: "school", school }) : await resolveAudience({ audience: "students" });
    if (!permitted.includes(b.studentUid)) return NextResponse.json({ error: "That student is outside your school." }, { status: 403 });
    uids = [b.studentUid];
  } else if (cls) uids = await resolveAudience({ audience: "class", classId: cls.id });
  else if (school) uids = await resolveAudience({ audience: "school", school });
  else return NextResponse.json({ error: "Choose a class or student." }, { status: 400 });
  if (!uids.length) return NextResponse.json({ error: "No active students matched." }, { status: 404 });

  const notice = !!b?.notice;
  await notify({ uids }, { type: "announcement", title: notice ? `Show-cause notice: ${title}` : title, body: message, href: "/portal/notifications" });
  let emails = 0;
  if (b?.sendEmail) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const sb = createAdminClient();
    const { data: profiles } = await sb.from("edu_profiles").select("id,email").in("id", uids);
    for (const p of profiles || []) {
      const recipients = [p.email, ...(await guardianEmails(p.id as string))].filter((e): e is string => !!e);
      if (recipients.length) {
        await sendMail({ to: recipients, subject: notice ? `Show-cause notice: ${title}` : title, text: message, html: `<p>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`, by: user.id, byName: user.fullName || user.email, kind: "announcement", meta: { coordinator: true, notice, school, classId: cls?.id || null } });
        emails += recipients.length;
      }
    }
  }
  await audit(user.id, notice ? "coordinator.show_cause" : "coordinator.communicate", "edu_notifications", null, { school, classId: cls?.id || null, studentUid: b?.studentUid || null, recipients: uids.length, emails });
  return NextResponse.json({ ok: true, recipients: uids.length, emails }, { status: 200 });
}
