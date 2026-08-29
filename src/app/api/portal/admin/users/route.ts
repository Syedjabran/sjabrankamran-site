import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit, genPassword, isEmail, ALL_ROLES, emailCredentials } from "@/lib/portal/admin";
import type { EduRole } from "@/lib/edu/auth";

export const runtime = "nodejs";

/** GET /api/portal/admin/users?q=&role=&limit= — directory of all portal accounts. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const roleFilter = (url.searchParams.get("role") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 1000);

  const sb = createAdminClient();
  let query = sb
    .from("edu_profiles")
    .select("id, full_name, email, status, created_at, edu_user_roles!edu_user_roles_user_id_fkey(role)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = { id: string; full_name: string | null; email: string | null; status: string; created_at: string; edu_user_roles?: { role: EduRole }[] };
  let users = (data as unknown as Row[]).map((p) => ({
    id: p.id,
    full_name: p.full_name || "",
    email: p.email || "",
    status: p.status,
    created_at: p.created_at,
    roles: (p.edu_user_roles || []).map((r) => r.role),
  }));
  if (roleFilter) users = users.filter((u) => u.roles.includes(roleFilter as EduRole));

  const counts = {
    total: users.length,
    students: users.filter((u) => u.roles.includes("student")).length,
    staff: users.filter((u) => u.roles.some((r) => r !== "student" && r !== "parent")).length,
    suspended: users.filter((u) => u.status === "archived").length,
    noRole: users.filter((u) => u.roles.length === 0).length,
  };
  return NextResponse.json({ users, counts }, { status: 200 });
}

/** POST /api/portal/admin/users — create a new account (any role), optionally enrol + email. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const b = (await req.json().catch(() => null)) as {
    email?: string; full_name?: string; roles?: string[]; password?: string;
    school?: string; student_no?: string; class_id?: string; send_email?: boolean;
  } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const email = (b.email || "").trim().toLowerCase();
  const fullName = (b.full_name || "").trim();
  const roles = (b.roles || []).filter((r) => ALL_ROLES.includes(r as EduRole)) as EduRole[];
  if (!isEmail(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (roles.length === 0) return NextResponse.json({ error: "Assign at least one role." }, { status: 400 });

  const password = (b.password || "").trim() || genPassword();
  const sb = createAdminClient();

  // 1) Create the auth user (email pre-confirmed → no confirmation email sent).
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (cErr || !created?.user) {
    return NextResponse.json({ error: cErr?.message || "Could not create the auth user." }, { status: 400 });
  }
  const uid = created.user.id;

  // 2) Ensure profile fields (trigger creates the row; set name/email/status).
  await sb.from("edu_profiles").update({ full_name: fullName, email, status: "active" }).eq("id", uid);

  // 3) Roles.
  await sb.from("edu_user_roles").insert(roles.map((role) => ({ user_id: uid, role, granted_by: admin.id })));

  // 4) Student record + optional class enrolment.
  let studentId: string | null = null;
  if (roles.includes("student")) {
    const { data: st } = await sb
      .from("edu_students")
      .insert({ profile_id: uid, student_no: (b.student_no || "").trim() || null, school: (b.school || "").trim() || null, created_by: admin.id })
      .select("id")
      .maybeSingle();
    studentId = st?.id ?? null;
    if (studentId && b.class_id) {
      await sb.from("edu_enrolments").insert({ class_id: b.class_id, student_id: studentId, status: "active" });
    }
  }

  await audit(admin.id, "user.create", "edu_profiles", uid, { email, roles, class_id: b.class_id || null });

  let emailStatus: string | undefined;
  if (b.send_email) {
    const r = await emailCredentials(admin.id, email, fullName, password, false);
    emailStatus = r.status;
  }

  return NextResponse.json({ ok: true, id: uid, email, password, studentId, emailStatus }, { status: 200 });
}
