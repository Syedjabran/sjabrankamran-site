import { createClient } from "@/lib/supabase/server";
import { attendancePercent, countedStatuses, isExcludedFromAttendance } from "@/lib/edu/attendance";

/** `total` counts only lessons that affect the percentage; `excluded` is the
 * count of authorised excused/leave/exempt marks held outside that total. */
export type AttendanceSummary = { total: number; present: number; late: number; online: number; absent: number; excluded: number; pct: number };
export type AttendanceLogRow = { date: string | null; status: string; title: string | null };
export type ResultRow = { title: string; kind: string; score: number | null; total: number | null; grade: string | null; pct: number | null; date: string | null };
export type EduPerformance = {
  hasData: boolean;
  attendance: AttendanceSummary | null;
  attendanceLog: AttendanceLogRow[];
  results: ResultRow[];
  averagePct: number | null;
};

/**
 * The signed-in student's own attendance % and recent assessment results.
 * Uses the RLS-scoped server client, so a student can only ever read their
 * own rows. Returns hasData:false gracefully when the user is not a student
 * or the school schema has no data for them.
 */
export async function getMyPerformance(): Promise<EduPerformance> {
  const empty: EduPerformance = { hasData: false, attendance: null, attendanceLog: [], results: [], averagePct: null };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return empty;

    const { data: student } = await supabase
      .from("edu_students")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!student?.id) return empty;

    // Every mark (no row limit), like the learn/family pages, rankings and the
    // Saturday email — a "last 120" window made this % disagree with them.
    const [{ data: att }, { data: results }] = await Promise.all([
      supabase.from("edu_attendance").select("status, recorded_at, edu_lessons(lesson_date, title)").eq("student_id", student.id).order("recorded_at", { ascending: false }),
      supabase
        .from("edu_results")
        .select("score, grade, breakdown, created_at, edu_assessments(title, kind, total_marks, starts_at)")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    let attendance: AttendanceSummary | null = null;
    let attendanceLog: AttendanceLogRow[] = [];
    // Authorised non-attendance (excused / leave / exempt) is removed from the
    // denominator instead of being counted as an absence, so a student on
    // approved leave is not shown as having missed class.
    const counted = countedStatuses((att || []).map((r) => r.status as string));
    const excludedCount = (att || []).filter((r) => isExcludedFromAttendance(r.status as string)).length;
    if (att && att.length && counted.length) {
      const present = counted.filter((s) => s === "present").length;
      const late = counted.filter((s) => s === "late").length;
      const online = counted.filter((s) => s === "online").length;
      const absent = counted.filter((s) => s === "absent").length;
      const total = counted.length;
      attendance = { total, present, late, online, absent, excluded: excludedCount, pct: attendancePercent(counted) ?? 0 };
      attendanceLog = att.slice(0, 120).map((r) => {
        const l = (r as { edu_lessons?: { lesson_date?: string; title?: string } }).edu_lessons || {};
        return { date: l.lesson_date || (r as { recorded_at?: string }).recorded_at || null, status: r.status as string, title: l.title || null };
      });
    }

    const rows: ResultRow[] = (results ?? []).map((r) => {
      const a = (r as { edu_assessments?: { title?: string; kind?: string; total_marks?: number; starts_at?: string } }).edu_assessments || {};
      const score = r.score != null ? Number(r.score) : null;
      const total = a.total_marks != null ? Number(a.total_marks) : null;
      const pct = score != null && total ? Math.round((score / total) * 100) : null;
      return {
        title: a.title ?? "Assessment",
        kind: a.kind ?? "test",
        score,
        total,
        grade: r.grade ?? null,
        pct,
        date: (a.starts_at || r.created_at) ?? null,
      };
    });

    const graded = rows.filter((r) => r.pct != null).map((r) => r.pct as number);
    const averagePct = graded.length ? Math.round(graded.reduce((s, x) => s + x, 0) / graded.length) : null;

    return { hasData: !!(attendance || rows.length), attendance, attendanceLog, results: rows, averagePct };
  } catch {
    return empty;
  }
}
