import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit, genPassword, emailCredentials, ALL_ROLES, SUSPEND_DURATION } from "@/lib/portal/admin";
import type { EduRole } from "@/lib/edu/auth";
import { setStaffSchool } from "@/lib/portal/staff-school";

export const runtime = "nodejs";

async function ensureStudentId(sb: ReturnType<typeof createAdminClient>, uid: string, actorId: string): Promise<string | null> {
  const { data: st } = await sb.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
  if (st?.id) return st.id as string;
  const { data: created } = await sb.from("edu_students").insert({ profile_id: uid, created_by: actorId }).select("id").maybeSingle();
  return created?.id ?? null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const b = (await req.json().catch(() => null)) as {
    op?: string; password?: string; role?: string; class_id?: string; enrolment_id?: string; send_email?: boolean; school?: string;
  } | null;
  if (!b?.op) return NextResponse.json({ error: "Missing op." }, { status: 400 });
  const sb = createAdminClient();

  switch (b.op) {
    case "password": {
      const password = (b.password || "").trim() || genPassword();
      const { error } = await sb.auth.admin.updateUserById(uid, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit(admin.id, "user.password_reset", "auth.users", uid, {});
      let emailStatus: string | undefined;
      if (b.send_email) {
        const { data: p } = await sb.from("edu_profiles").select("full_name, email").eq("id", uid).maybeSingle();
        if (p?.email) emailStatus = (await emailCredentials(admin.id, p.email, p.full_name || "Student", password, true)).status;
      }
      return NextResponse.json({ ok: true, password, emailStatus }, { status: 200 });
    }
    case "suspend": {
      const { error } = await sb.auth.admin.updateUserById(uid, { ban_duration: SUSPEND_DURATION });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await sb.from("edu_profiles").update({ status: "archived" }).eq("id", uid);
      await audit(admin.id, "user.suspend", "auth.users", uid, {});
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "reactivate": {
      const { error } = await sb.auth.admin.updateUserById(uid, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await sb.from("edu_profiles").update({ status: "active" }).eq("id", uid);
      await audit(admin.id, "user.reactivate", "auth.users", uid, {});
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "set_school": {
      // School assignment for coordinator / facilitator (Storage-as-DB).
      const ok = await setStaffSchool(uid, b.school || "", admin.id);
      if (!ok) return NextResponse.json({ error: "Could not save the school." }, { status: 400 });
      await audit(admin.id, "user.set_school", "edu_profiles", uid, { school: b.school || "" });
      break;
    }
    case "grant_role": {
      const role = b.role as EduRole;
      if (!ALL_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      const { error: grantErr } = await sb.from("edu_user_roles").upsert({ user_id: uid, role, granted_by: admin.id }, { onConflict: "user_id,role" });
      if (grantErr) {
        // 'coordinator'/'facilitator' need a one-time enum migration first.
        if (/invalid input value for enum|enum edu_role/i.test(grantErr.message)) {
          return NextResponse.json({ error: `The “${role}” role needs a one-time DB migration first (ALTER TYPE edu_role ADD VALUE '${role}'). Ask the developer to run it, then try again.` }, { status: 400 });
        }
        return NextResponse.json({ error: grantErr.message }, { status: 400 });
      }
      if (role === "student") await ensureStudentId(sb, uid, admin.id);
      await audit(admin.id, "role.grant", "edu_user_roles", uid, { role });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "revoke_role": {
      const role = b.role as EduRole;
      if (!ALL_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      await sb.from("edu_user_roles").delete().eq("user_id", uid).eq("role", role);
      await audit(admin.id, "role.revoke", "edu_user_roles", uid, { role });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "enrol": {
      if (!b.class_id) return NextResponse.json({ error: "class_id required." }, { status: 400 });
      const sid = await ensureStudentId(sb, uid, admin.id);
      if (!sid) return NextResponse.json({ error: "Could not resolve student record." }, { status: 400 });
      const { error } = await sb.from("edu_enrolments").upsert({ class_id: b.class_id, student_id: sid, status: "active" }, { onConflict: "class_id,student_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit(admin.id, "enrolment.add", "edu_enrolments", uid, { class_id: b.class_id });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "unenrol": {
      if (b.enrolment_id) await sb.from("edu_enrolments").delete().eq("id", b.enrolment_id);
      else if (b.class_id) {
        const { data: st } = await sb.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
        if (st?.id) await sb.from("edu_enrolments").delete().eq("student_id", st.id).eq("class_id", b.class_id);
      } else return NextResponse.json({ error: "enrolment_id or class_id required." }, { status: 400 });
      await audit(admin.id, "enrolment.remove", "edu_enrolments", uid, { class_id: b.class_id || null });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "email_credentials": {
      const password = (b.password || "").trim() || genPassword();
      const { error } = await sb.auth.admin.updateUserById(uid, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const { data: p } = await sb.from("edu_profiles").select("full_name, email").eq("id", uid).maybeSingle();
      if (!p?.email) return NextResponse.json({ error: "No email on file." }, { status: 400 });
      const r = await emailCredentials(admin.id, p.email, p.full_name || "Student", password, true);
      await audit(admin.id, "user.email_credentials", "edu_profiles", uid, { status: r.status });
      return NextResponse.json({ ok: true, emailStatus: r.status, password }, { status: 200 });
    }
    default:
      return NextResponse.json({ error: "Unknown op." }, { status: 400 });
  }
}
