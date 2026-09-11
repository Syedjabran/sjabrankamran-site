import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, audit } from "@/lib/portal/admin";
import { notify } from "@/lib/portal/notifications";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_MIGRATION_FILE,
  allowsReason,
  isAttendanceStatus,
  needsEnumMigration,
  normaliseReason,
  requiresReason,
} from "@/lib/edu/attendance";

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

  // `note` carries the official exemption reason, so a reload re-hydrates it
  // and the comment box can stay collapsed.
  const { data: existing } = await sb.from("edu_attendance").select("student_id, status, note").eq("lesson_id", lessonId);
  const marks: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const e of existing || []) {
    const sid = e.student_id as string;
    const status = e.status as string;
    marks[sid] = status;
    // Only surface a reason for the status it was recorded against.
    const note = normaliseReason(e.note);
    if (note && allowsReason(status)) notes[sid] = note;
  }

  return NextResponse.json({ lessonId, date, roster, marks, notes }, { status: 200 });
}

/** POST { lessonId, marks:[{studentId,status,note?}] } — save attendance. */
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { lessonId?: string; marks?: { studentId: string; status: string; note?: string }[] } | null;
  if (!b?.lessonId || !Array.isArray(b.marks)) return NextResponse.json({ error: "lessonId and marks required." }, { status: 400 });
  const rows = b.marks
    .filter((m) => m.studentId && isAttendanceStatus(m.status))
    .map((m) => {
      // A reason is only stored for the statuses that allow one, so moving a
      // student off 'exempt'/'leave' clears the old reason instead of leaving
      // a stale one attached to e.g. 'present'.
      const note = allowsReason(m.status) ? normaliseReason(m.note) : "";
      return { lesson_id: b.lessonId, student_id: m.studentId, status: m.status, note: note || null, recorded_by: staff.id, recorded_at: new Date().toISOString() };
    });
  if (!rows.length) return NextResponse.json({ error: "No valid marks." }, { status: 400 });
  // A lesson exemption is an official act: it cannot be saved without a reason.
  const missingReason = rows.filter((r) => requiresReason(r.status) && !r.note).length;
  if (missingReason) {
    return NextResponse.json(
      { error: `${missingReason} student${missingReason === 1 ? "" : "s"} marked Exempt still need${missingReason === 1 ? "s" : ""} an official reason. Record the reason in the comment box, then save.` },
      { status: 400 },
    );
  }
  const sb = createAdminClient();
  // Snapshot existing marks first so we only notify NEWLY-absent students.
  const prevMarks: Record<string, string> = {};
  try {
    const { data: prevRows } = await sb.from("edu_attendance").select("student_id, status").eq("lesson_id", b.lessonId);
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
          await audit(staff.id, "attendance.save", "edu_lessons", b.lessonId, { count: safe.length, skipped: rows.length - safe.length, blocked });
          await notifyAbsent(sb, b.lessonId, safe, prevMarks);
          return NextResponse.json({
            ok: true,
            saved: safe.length,
            warning: `${names} could not be saved yet — run ${ATTENDANCE_MIGRATION_FILE} in the Supabase SQL Editor. All other marks were saved.`,
          }, { status: 200 });
        }
      }
      return NextResponse.json({ error: `${names} attendance needs a one-time DB migration — run ${ATTENDANCE_MIGRATION_FILE} in the Supabase SQL Editor.` }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await audit(staff.id, "attendance.save", "edu_lessons", b.lessonId, { count: rows.length });
  await notifyAbsent(sb, b.lessonId, rows, prevMarks);
  return NextResponse.json({ ok: true, saved: rows.length }, { status: 200 });
}
