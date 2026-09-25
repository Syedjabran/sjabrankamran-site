import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit, genPassword, emailCredentials, ALL_ROLES, isSuperAdmin } from "@/lib/portal/admin";
import type { EduRole } from "@/lib/edu/auth";
import { getAccessControlDocument, releaseDirectUserRestrictions, saveAccessControlDocument } from "@/lib/portal/access-control";
import { isRestrictionActive, type AccessRestriction } from "@/lib/portal/access-shared";
import { getStaffSchool, setStaffSchool } from "@/lib/portal/staff-school";
import { SCHOOL_SCOPED_ROLES } from "@/lib/edu/auth";
import { getRegistry } from "@/lib/portal/institutions";

export const runtime = "nodejs";

/** Roles only a super-admin may grant/revoke, and whose holders only a super-admin may re-credential. */
const PRIVILEGED_ROLES: EduRole[] = ["super_admin", "admin"];

async function holdsPrivilegedRole(sb: ReturnType<typeof createAdminClient>, uid: string): Promise<boolean> {
  const { data, error } = await sb.from("edu_user_roles").select("role").eq("user_id", uid);
  if (error) return true; // fail closed
  return (data || []).some((r) => PRIVILEGED_ROLES.includes(r.role as EduRole));
}

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
    op?: string; password?: string; role?: string; class_id?: string; enrolment_id?: string; send_email?: boolean; school?: string; message?: string;
  } | null;
  if (!b?.op) return NextResponse.json({ error: "Missing op." }, { status: 400 });
  const sb = createAdminClient();

  if ((b.op === "password" || b.op === "email_credentials") && !isSuperAdmin(admin) && (await holdsPrivilegedRole(sb, uid))) {
    return NextResponse.json({ error: "Only a super-admin can reset an admin's credentials." }, { status: 403 });
  }
  if (b.op === "grant_role" || b.op === "revoke_role") {
    const privileged = PRIVILEGED_ROLES.includes(b.role as EduRole);
    // Nobody changes their own admin tier (no self-promotion, no owner lock-out);
    // a super-admin may still add ordinary roles such as teacher to themselves.
    if (uid === admin.id && (privileged || !isSuperAdmin(admin))) {
      return NextResponse.json({ error: "You cannot change your own admin roles." }, { status: 403 });
    }
    if (privileged && !isSuperAdmin(admin)) {
      return NextResponse.json({ error: "Only a super-admin can grant or revoke admin roles." }, { status: 403 });
    }
  }

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
      if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can restrict portal access." }, { status: 403 });
      const message = (b.message || "").trim();
      if (message.length < 10 || message.length > 1200) {
        return NextResponse.json({ error: "Write a custom lock message containing 10–1,200 characters." }, { status: 400 });
      }
      const [{ data: profile }, { data: targetRoles }] = await Promise.all([
        sb.from("edu_profiles").select("full_name, email").eq("id", uid).maybeSingle(),
        sb.from("edu_user_roles").select("role").eq("user_id", uid),
      ]);
      if ((targetRoles || []).some((r) => r.role === "super_admin")) {
        return NextResponse.json({ error: "Super-admin accounts are protected from portal locks." }, { status: 400 });
      }
      const doc = await getAccessControlDocument(true);
      if (doc.restrictions.some((r) => r.scopeType === "user" && r.scopeKey === uid && isRestrictionActive(r))) {
        return NextResponse.json({ error: "This user already has an active direct access restriction." }, { status: 409 });
      }
      const now = new Date().toISOString();
      const restriction: AccessRestriction = {
        id: crypto.randomUUID(),
        scopeType: "user",
        scopeKey: uid,
        scopeLabel: profile?.full_name || profile?.email || "Portal user",
        classIds: [],
        mode: "locked",
        message,
        startsAt: now,
        endsAt: null,
        createdAt: now,
        createdBy: admin.id,
        releasedAt: null,
        releasedBy: null,
      };
      doc.restrictions.push(restriction);
      await saveAccessControlDocument(doc);
      // Undo any legacy GoTrue ban/profile archive. Authentication must remain
      // available; the application access layer now performs the restriction.
      await sb.auth.admin.updateUserById(uid, { ban_duration: "none" });
      await sb.from("edu_profiles").update({ status: "active" }).eq("id", uid);
      await audit(admin.id, "user.lock", "portal_access", restriction.id, { user_id: uid });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "reactivate": {
      if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can restore portal access." }, { status: 403 });
      const { error } = await sb.auth.admin.updateUserById(uid, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await sb.from("edu_profiles").update({ status: "active" }).eq("id", uid);
      const released = await releaseDirectUserRestrictions(uid, admin.id);
      await audit(admin.id, "user.reactivate", "portal_access", uid, { released });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "set_school": {
      // School assignment for coordinator / facilitator (Storage-as-DB).
      const ok = await setStaffSchool(uid, b.school || "", admin.id);
      if (!ok) return NextResponse.json({ error: "Could not save the school." }, { status: 400 });
      await audit(admin.id, "user.set_school", "edu_profiles", uid, { school: b.school || "" });
      return NextResponse.json({ ok: true }, { status: 200 });
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
      const { data: roleRows } = await sb.from("edu_user_roles").select("role").eq("user_id", uid);
      const scoped = (roleRows || []).some((r) => SCHOOL_SCOPED_ROLES.includes(r.role as EduRole));
      if (scoped) {
        const [school, registry] = await Promise.all([getStaffSchool(uid), getRegistry()]);
        const targetClass = registry.classes.find((c) => c.id === b.class_id);
        if (!school) return NextResponse.json({ error: "Assign the staff member's school before assigning a class." }, { status: 400 });
        if (!targetClass || targetClass.school !== school) {
          return NextResponse.json({ error: "A school-scoped staff member can only be assigned to a class in their assigned school." }, { status: 403 });
        }
      }
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
