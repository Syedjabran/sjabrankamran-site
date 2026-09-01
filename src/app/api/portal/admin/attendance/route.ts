import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, audit } from "@/lib/portal/admin";

export const runtime = "nodejs";

const STATUSES = ["present", "absent", "late", "excused", "online"] as const;

/** Ensure a lesson exists for (class, date) so attendance rows have a parent. */
async function ensureLesson(sb: ReturnType<typeof createAdminClient>, classId: string, date: string): Promise<string | null> {
  const { data: found } = await sb.from("edu_lessons").select("id").eq("class_id", classId).eq("lesson_date", date).limit(1).maybeSingle();
  if (found?.id) return found.id as string;
  const { data: created } = await sb.from("edu_lessons").insert({ class_id: classId, lesson_date: date, title: "Attendance", status: "done" }).select("id").maybeSingle();
  return created?.id ?? null;
}

/** GET ?classId=&date=YYYY-MM-DD — roster + existing marks + the lesson id. */
export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const url = new URL(req.url);
  const classId = url.searchParams.get("classId") || "";
  const date = (url.searchParams.get("date") || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!classId) return NextResponse.json({ error: "classId required." }, { status: 400 });
  const sb = createAdminClient();

  const lessonId = await ensureLesson(sb, classId, date);
  if (!lessonId) return NextResponse.json({ error: "Could not open a lesson for this date." }, { status: 400 });

  const { data: enr } = await sb
    .from("edu_enrolments")
    .select("student_id, edu_students(id, edu_profiles!edu_students_profile_id_fkey(full_name))")
    .eq("class_id", classId)
    .eq("status", "active");
  type Row = { student_id: string; edu_students?: { edu_profiles?: { full_name?: string } } };
  const roster = ((enr || []) as unknown as Row[])
    .map((r) => {
      const name = r.edu_students?.edu_profiles?.full_name || "Student";
      return { studentId: r.student_id, name, firstName: name.trim().split(/\s+/)[0] || name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: existing } = await sb.from("edu_attendance").select("student_id, status").eq("lesson_id", lessonId);
  const marks: Record<string, string> = {};
  for (const e of existing || []) marks[e.student_id as string] = e.status as string;

  return NextResponse.json({ lessonId, date, roster, marks }, { status: 200 });
}

/** POST { lessonId, marks:[{studentId,status}] } — save attendance. */
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { lessonId?: string; marks?: { studentId: string; status: string }[] } | null;
  if (!b?.lessonId || !Array.isArray(b.marks)) return NextResponse.json({ error: "lessonId and marks required." }, { status: 400 });
  const rows = b.marks
    .filter((m) => m.studentId && (STATUSES as readonly string[]).includes(m.status))
    .map((m) => ({ lesson_id: b.lessonId, student_id: m.studentId, status: m.status, recorded_by: staff.id, recorded_at: new Date().toISOString() }));
  if (!rows.length) return NextResponse.json({ error: "No valid marks." }, { status: 400 });
  const sb = createAdminClient();
  const { error } = await sb.from("edu_attendance").upsert(rows, { onConflict: "lesson_id,student_id" });
  if (error) {
    // 'online' is a new enum value that needs a one-time DB migration
    // (ALTER TYPE edu_attendance_status ADD VALUE 'online'). Until it's run,
    // still save the present/late/absent/excused marks rather than lose them.
    const hasOnline = rows.some((r) => r.status === "online");
    if (hasOnline) {
      const safe = rows.filter((r) => r.status !== "online");
      if (safe.length) {
        const retry = await sb.from("edu_attendance").upsert(safe, { onConflict: "lesson_id,student_id" });
        if (!retry.error) {
          await audit(staff.id, "attendance.save", "edu_lessons", b.lessonId, { count: safe.length, online_skipped: rows.length - safe.length });
          return NextResponse.json({ ok: true, saved: safe.length, warning: "‘Online’ needs a one-time DB migration before it can be saved — other marks were saved." }, { status: 200 });
        }
      }
      return NextResponse.json({ error: "‘Online’ attendance needs a one-time DB migration (ALTER TYPE edu_attendance_status ADD VALUE 'online')." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await audit(staff.id, "attendance.save", "edu_lessons", b.lessonId, { count: rows.length });
  return NextResponse.json({ ok: true, saved: rows.length }, { status: 200 });
}
