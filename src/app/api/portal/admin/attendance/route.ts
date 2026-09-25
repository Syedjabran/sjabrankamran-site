import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, audit } from "@/lib/portal/admin";
import { isAdmin, type PortalUser } from "@/lib/edu/auth";
import { notify } from "@/lib/portal/notifications";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { pkToday } from "@/lib/portal/pk-time";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_MIGRATION_FILE,
  allowsReason,
  isAttendanceStatus,
  needsEnumMigration,
  normaliseReason,
  requiresReason,
} from "@/lib/edu/attendance";
import { staffRoleMap, isDemoStudentName } from "@/lib/portal/institutions";

export const runtime = "nodejs";

/** Tell each newly-absent student — only for marks that actually changed to
 * 'absent' in this save, so re-saving a register doesn't re-notify. */
async function notifyAbsent(
  sb: ReturnType<typeof createAdminClient>,
  lessonId: string,
  savedRows: { student_id: string; status: string }[],
  prev: Record<string, string>,
) {
  try {
    const absentIds = savedRows
      .filter((r) => r.status === "absent" && prev[r.student_id] !== "absent")
      .map((r) => r.student_id);
    if (!absentIds.length) return;
    const [{ data: lesson }, { data: stus }] = await Promise.all([
      sb.from("edu_lessons").select("lesson_date").eq("id", lessonId).maybeSingle(),
      sb.from("edu_students").select("id, profile_id").in("id", absentIds),
    ]);
    const dateTxt = lesson?.lesson_date
      ? new Date(lesson.lesson_date as string).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
      : "today";
    const uids = (stus || []).map((s) => s.profile_id as string).filter(Boolean);
    if (!uids.length) return;
    await notify({ uids }, {
      type: "attendance",
      title: `You were marked absent on ${dateTxt}`,
      body: "If you believe this is wrong, contact your teacher.",
      href: "/portal/learn",
    });
  } catch { /* best effort */ }
}

type Sb = ReturnType<typeof createAdminClient>;
type Lesson = { id: string; class_id: string; lesson_date: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The lesson holding the (class, date) register, or null. Deterministic when
 * a class has several lessons that day: the earliest-created one that already
 * carries marks, else the earliest-created one. Throws on a query error so a
 * failed lookup is never mistaken for "no lesson" (which would create another).
 */
async function findLesson(sb: Sb, classId: string, date: string): Promise<Lesson | null> {
  const { data, error } = await sb
    .from("edu_lessons")
    .select("id, class_id, lesson_date, created_at, edu_attendance(count)")
    .eq("class_id", classId)
    .eq("lesson_date", date)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data || []) as unknown as (Lesson & { edu_attendance?: { count: number }[] })[];
  const pick = rows.find((r) => (r.edu_attendance?.[0]?.count ?? 0) > 0) || rows[0];
  return pick ? { id: pick.id, class_id: pick.class_id, lesson_date: pick.lesson_date } : null;
}

/** POST only: find or create the lesson so attendance rows have a parent. */
async function ensureLesson(sb: Sb, classId: string, date: string): Promise<Lesson | null> {
  const found = await findLesson(sb, classId, date);
  if (found) return found;
  const { error } = await sb.from("edu_lessons").insert({ class_id: classId, lesson_date: date, title: "Attendance", status: "done" });
  if (error) throw new Error(error.message);
  // Re-read rather than trust our own insert: a concurrent save may have
  // created one too, and every saver must converge on the same lesson.
  return findLesson(sb, classId, date);
}

/** Admins see every class; other staff only the classes assigned to them. */
async function canUseClass(staff: PortalUser, classId: string): Promise<boolean> {
  if (isAdmin(staff.roles)) return true;
  return (await visibleClassIdsForUid(staff.id, staff.roles)).includes(classId);
}

/**
 * GET ?classId=&date=YYYY-MM-DD — roster + existing marks + the lesson.
 * READ-ONLY: browsing a date never creates a lesson (it would surface in
 * students' upcoming lessons); `lesson` is null until the first save.
 */
export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const url = new URL(req.url);
  const classId = url.searchParams.get("classId") || "";
  const date = url.searchParams.get("date") || pkToday();
  if (!classId) return NextResponse.json({ error: "classId required." }, { status: 400 });
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  if (!(await canUseClass(staff, classId))) return NextResponse.json({ error: "That class is not one of your assigned classes." }, { status: 403 });
  const sb = createAdminClient();

  let lesson: Lesson | null;
  try { lesson = await findLesson(sb, classId, date); }
  catch (e) { return NextResponse.json({ error: `Could not look up the lesson: ${(e as Error).message}` }, { status: 500 }); }

  const { data: enr } = await sb
    .from("edu_enrolments")
    .select("student_id, edu_students(id, profile_id, edu_profiles!edu_students_profile_id_fkey(full_name))")
    .eq("class_id", classId)
    .eq("status", "active");
  type Row = { student_id: string; edu_students?: { profile_id?: string; edu_profiles?: { full_name?: string } } };
  const rows = (enr || []) as unknown as Row[];
  // Only real students belong on an attendance register: strip any enrolled
  // staff (coordinator / facilitator / attendance_registrar / teacher / admin)
  // and any placeholder demo accounts created during testing.
  const roleMap = await staffRoleMap(rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x));
  const roster = rows
    .filter((r) => {
      const u = r.edu_students?.profile_id;
      // Require a linked profile: orphan edu_students rows (profile_id NULL) are
      // ghost/seed entries that render as "Student" — never on a real roster.
      return !!u && !roleMap.has(u) && !isDemoStudentName(r.edu_students?.edu_profiles?.full_name);
    })
    .map((r) => {
      const name = r.edu_students?.edu_profiles?.full_name || "Student";
      return { studentId: r.student_id, name, firstName: name.trim().split(/\s+/)[0] || name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // `note` carries the official exemption reason, so a reload re-hydrates it
  // and the comment box can stay collapsed.
  const marks: Record<string, string> = {};
  const notes: Record<string, string> = {};
  if (lesson) {
    const { data: existing } = await sb.from("edu_attendance").select("student_id, status, note").eq("lesson_id", lesson.id);
    for (const e of existing || []) {
      const sid = e.student_id as string;
      const status = e.status as string;
      marks[sid] = status;
      // Only surface a reason for the status it was recorded against.
      const note = normaliseReason(e.note);
      if (note && allowsReason(status)) notes[sid] = note;
    }
  }

  return NextResponse.json({
    lessonId: lesson?.id ?? null,
    lesson: lesson ? { id: lesson.id, date: lesson.lesson_date, classId: lesson.class_id } : null,
    date, classId, roster, marks, notes,
  }, { status: 200 });
}

/**
 * POST { lessonId, marks } or { classId, date, marks } — save attendance.
 * marks: [{studentId,status,note?}]. The (class, date) form finds or creates
 * the lesson here, never on GET.
 */
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { lessonId?: string; classId?: string; date?: string; marks?: { studentId: string; status: string; note?: string }[] } | null;
  if (!b || !Array.isArray(b.marks) || !(b.lessonId || (b.classId && b.date))) {
    return NextResponse.json({ error: "marks and either lessonId or classId + date are required." }, { status: 400 });
  }
  const sb = createAdminClient();

  // Resolve the target class first; everything is validated before a lesson
  // is created, so a rejected save leaves nothing behind.
  let lesson: Lesson | null = null;
  let classId: string;
  if (b.lessonId) {
    const { data, error } = await sb.from("edu_lessons").select("id, class_id, lesson_date").eq("id", b.lessonId).maybeSingle();
    if (error) return NextResponse.json({ error: `Could not load the lesson: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    lesson = data as Lesson;
    classId = lesson.class_id;
  } else {
    if (!DATE_RE.test(b.date!)) return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
    if (b.date! > pkToday()) return NextResponse.json({ error: "Attendance cannot be recorded for a future date." }, { status: 400 });
    classId = b.classId!;
  }
  if (!(await canUseClass(staff, classId))) return NextResponse.json({ error: "That class is not one of your assigned classes." }, { status: 403 });

  const marks = b.marks
    .filter((m) => m.studentId && isAttendanceStatus(m.status))
    .map((m) => {
      // A reason is only stored for the statuses that allow one, so moving a
      // student off 'exempt'/'leave' clears the old reason instead of leaving
      // a stale one attached to e.g. 'present'.
      const note = allowsReason(m.status) ? normaliseReason(m.note) : "";
      return { student_id: m.studentId, status: m.status, note: note || null };
    });
  if (!marks.length) return NextResponse.json({ error: "No valid marks." }, { status: 400 });
  // A lesson exemption is an official act: it cannot be saved without a reason.
  const missingReason = marks.filter((r) => requiresReason(r.status) && !r.note).length;
  if (missingReason) {
    return NextResponse.json(
      { error: `${missingReason} student${missingReason === 1 ? "" : "s"} marked Exempt still need${missingReason === 1 ? "s" : ""} an official reason. Record the reason in the comment box, then save.` },
      { status: 400 },
    );
  }
  // Every mark must belong to a student actively enrolled in the lesson's class.
  const ids = [...new Set(marks.map((r) => r.student_id))];
  const { data: enrolled, error: enrError } = await sb
    .from("edu_enrolments")
    .select("student_id")
    .eq("class_id", classId)
    .eq("status", "active")
    .in("student_id", ids);
  if (enrError) return NextResponse.json({ error: `Could not verify enrolments: ${enrError.message}` }, { status: 500 });
  const enrolledIds = new Set((enrolled || []).map((e) => e.student_id as string));
  const outside = ids.filter((id) => !enrolledIds.has(id)).length;
  if (outside) {
    return NextResponse.json({ error: `${outside} student${outside === 1 ? " is" : "s are"} not actively enrolled in this class — reload the register and try again.` }, { status: 400 });
  }

  if (!lesson) {
    try { lesson = await ensureLesson(sb, classId, b.date!); }
    catch (e) { return NextResponse.json({ error: `Could not open a lesson for this date: ${(e as Error).message}` }, { status: 500 }); }
    if (!lesson) return NextResponse.json({ error: "Could not open a lesson for this date." }, { status: 500 });
  }
  const lessonId = lesson.id;
  const lessonInfo = { id: lesson.id, date: lesson.lesson_date, classId: lesson.class_id };
  const recordedAt = new Date().toISOString();
  const rows = marks.map((m) => ({ ...m, lesson_id: lessonId, recorded_by: staff.id, recorded_at: recordedAt }));

  // Snapshot existing marks first so we only notify NEWLY-absent students.
  const prevMarks: Record<string, string> = {};
  try {
    const { data: prevRows } = await sb.from("edu_attendance").select("student_id, status").eq("lesson_id", lessonId);
    for (const p of prevRows || []) prevMarks[p.student_id as string] = p.status as string;
  } catch { /* best effort */ }
  const { error } = await sb.from("edu_attendance").upsert(rows, { onConflict: "lesson_id,student_id" });
  if (error) {
    // 'online', 'leave' and 'exempt' only exist in the enum once edu-002 has
    // been run. Until then, still save every mark the DB does accept rather
    // than lose a whole register — and say exactly what has to be run.
    const blocked = [...new Set(rows.filter((r) => needsEnumMigration(r.status)).map((r) => r.status))];
    if (blocked.length) {
      const names = blocked.map((s) => `‘${ATTENDANCE_LABEL[s as keyof typeof ATTENDANCE_LABEL] ?? s}’`).join(", ");
      const safe = rows.filter((r) => !needsEnumMigration(r.status));
      if (safe.length) {
        const retry = await sb.from("edu_attendance").upsert(safe, { onConflict: "lesson_id,student_id" });
        if (!retry.error) {
          await audit(staff.id, "attendance.save", "edu_lessons", lessonId, { count: safe.length, skipped: rows.length - safe.length, blocked });
          await notifyAbsent(sb, lessonId, safe, prevMarks);
          return NextResponse.json({
            ok: true,
            saved: safe.length,
            lesson: lessonInfo,
            warning: `${names} could not be saved yet — run ${ATTENDANCE_MIGRATION_FILE} in the Supabase SQL Editor. All other marks were saved.`,
          }, { status: 200 });
        }
      }
      return NextResponse.json({ error: `${names} attendance needs a one-time DB migration — run ${ATTENDANCE_MIGRATION_FILE} in the Supabase SQL Editor.` }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await audit(staff.id, "attendance.save", "edu_lessons", lessonId, { count: rows.length });
  await notifyAbsent(sb, lessonId, rows, prevMarks);
  return NextResponse.json({ ok: true, saved: rows.length, lesson: lessonInfo }, { status: 200 });
}
