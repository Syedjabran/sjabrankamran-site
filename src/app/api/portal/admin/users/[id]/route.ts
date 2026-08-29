import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit, isSuperAdmin, isEmail } from "@/lib/portal/admin";
import type { EduRole } from "@/lib/edu/auth";
import { getRegistry } from "@/lib/portal/institutions";
import { getOnboarding } from "@/lib/portal/onboarding";
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";

export const runtime = "nodejs";

/** GET — full 360 on a single user (identity, access, enrolments, progress, activity). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const sb = createAdminClient();

  const { data: profile } = await sb
    .from("edu_profiles")
    .select("id, full_name, email, phone, status, created_at, edu_user_roles!edu_user_roles_user_id_fkey(role)")
    .eq("id", uid)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const roles = ((profile.edu_user_roles as { role: EduRole }[] | null) || []).map((r) => r.role);

  const { data: authRes } = await sb.auth.admin.getUserById(uid);
  const au = authRes?.user;
  const bannedUntil = (au as unknown as { banned_until?: string } | null)?.banned_until || null;
  const access = {
    banned: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
    bannedUntil,
    lastSignIn: au?.last_sign_in_at || null,
    emailConfirmed: !!au?.email_confirmed_at,
  };

  // Student record + enrolments (+ school/section from the registry).
  const { data: student } = await sb
    .from("edu_students")
    .select("id, student_no, school, admission_status, date_of_birth")
    .eq("profile_id", uid)
    .maybeSingle();

  const reg = await getRegistry();
  const regById = new Map(reg.classes.map((c) => [c.id, c]));
  let enrolments: { id: string; classId: string; status: string; className: string; school: string; section: string | null }[] = [];
  let progress: ReturnType<typeof analyse> | null = null;
  let attendance: { total: number; present: number; late: number; absent: number; pct: number } | null = null;
  let results: { title: string; kind: string; score: number | null; total: number | null; grade: string | null; date: string | null }[] = [];
  let submissions: { title: string; status: string; marks: number | null; submittedAt: string | null }[] = [];

  if (student?.id) {
    const { data: enr } = await sb
      .from("edu_enrolments")
      .select("id, class_id, status, edu_classes(name, room)")
      .eq("student_id", student.id);
    enrolments = (enr || []).map((e) => {
      const meta = regById.get(e.class_id as string);
      const cls = e.edu_classes as unknown as { name?: string; room?: string } | null;
      return {
        id: e.id as string,
        classId: e.class_id as string,
        status: e.status as string,
        className: meta?.name || cls?.name || "Class",
        school: meta?.school || cls?.room || "—",
        section: meta?.section || null,
      };
    });

    const [{ data: att }, { data: res }, { data: subs }] = await Promise.all([
      sb.from("edu_attendance").select("status").eq("student_id", student.id),
      sb.from("edu_results").select("score, grade, created_at, edu_assessments(title, kind, total_marks, starts_at)").eq("student_id", student.id).order("created_at", { ascending: false }).limit(20),
      sb.from("edu_submissions").select("status, marks, submitted_at, edu_assignments(title)").eq("student_id", student.id).order("submitted_at", { ascending: false }).limit(20),
    ]);
    if (att && att.length) {
      const present = att.filter((r) => r.status === "present").length;
      const late = att.filter((r) => r.status === "late").length;
      const absent = att.filter((r) => r.status === "absent" || r.status === "excused").length;
      attendance = { total: att.length, present, late, absent, pct: Math.round(((present + late) / att.length) * 100) };
    }
    results = (res || []).map((r) => {
      const a = (r as { edu_assessments?: { title?: string; kind?: string; total_marks?: number; starts_at?: string } }).edu_assessments || {};
      return { title: a.title || "Assessment", kind: a.kind || "test", score: r.score != null ? Number(r.score) : null, total: a.total_marks != null ? Number(a.total_marks) : null, grade: r.grade || null, date: (a.starts_at || r.created_at) || null };
    });
    submissions = (subs || []).map((s) => {
      const a = (s as { edu_assignments?: { title?: string } }).edu_assignments || {};
      return { title: a.title || "Assignment", status: s.status as string, marks: s.marks != null ? Number(s.marks) : null, submittedAt: s.submitted_at || null };
    });

    const attempts = await getAttempts(uid);
    progress = analyse(attempts);
  }

  const onboarding = await getOnboarding(uid);

  return NextResponse.json({
    profile: { id: profile.id, full_name: profile.full_name || "", email: profile.email || "", phone: profile.phone || "", status: profile.status, created_at: profile.created_at, roles },
    access,
    student: student ? { id: student.id, student_no: student.student_no, school: student.school, admission_status: student.admission_status, date_of_birth: student.date_of_birth } : null,
    enrolments,
    onboarding: onboarding ? { completed: !!onboarding.completed_at, whatsapp: onboarding.whatsapp || null, city: onboarding.city || null, dob: onboarding.date_of_birth || null, guardians: onboarding.guardians || [] } : null,
    progress: progress
      ? { totalAttempts: progress.totalAttempts, papersSat: progress.papersSat, scoredQuestions: progress.scoredQuestions, overallAccuracy: progress.overallAccuracy, level: progress.level, levelLabel: progress.levelLabel, strengths: progress.strengths.slice(0, 3), weaknesses: progress.weaknesses.slice(0, 3), recentAttempts: progress.recentAttempts.slice(0, 8).map((a) => ({ ts: a.ts, mode: a.mode, score: a.score, total: a.total, qCount: a.qCount })) }
      : null,
    attendance,
    results,
    submissions,
  }, { status: 200 });
}

/** PATCH — edit identity (name / email / status). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const b = (await req.json().catch(() => null)) as { full_name?: string; email?: string; status?: string } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const sb = createAdminClient();
  const patch: Record<string, unknown> = {};

  if (typeof b.email === "string" && b.email.trim()) {
    const email = b.email.trim().toLowerCase();
    if (!isEmail(email)) return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    const { error } = await sb.auth.admin.updateUserById(uid, { email, email_confirm: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    patch.email = email;
  }
  if (typeof b.full_name === "string") patch.full_name = b.full_name.trim();
  if (typeof b.status === "string" && ["active", "archived", "invited"].includes(b.status)) patch.status = b.status;

  if (Object.keys(patch).length) await sb.from("edu_profiles").update(patch).eq("id", uid);
  await audit(admin.id, "user.update", "edu_profiles", uid, patch);
  return NextResponse.json({ ok: true }, { status: 200 });
}

/** DELETE — permanently remove the account (super_admin only). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can delete accounts." }, { status: 403 });
  const { id: uid } = await params;
  if (uid === admin.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  const sb = createAdminClient();
  const { error } = await sb.auth.admin.deleteUser(uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await audit(admin.id, "user.delete", "edu_profiles", uid, {});
  return NextResponse.json({ ok: true }, { status: 200 });
}
