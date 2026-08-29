import { createClient } from "@/lib/supabase/server";

export type AttendanceSummary = { total: number; present: number; late: number; absent: number; pct: number };
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

    const [{ data: att }, { data: results }] = await Promise.all([
      supabase.from("edu_attendance").select("status, recorded_at, edu_lessons(lesson_date, title)").eq("student_id", student.id).order("recorded_at", { ascending: false }).limit(120),
      supabase
        .from("edu_results")
        .select("score, grade, breakdown, created_at, edu_assessments(title, kind, total_marks, starts_at)")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    let attendance: AttendanceSummary | null = null;
    let attendanceLog: AttendanceLogRow[] = [];
    if (att && att.length) {
      const present = att.filter((r) => r.status === "present").length;
      const late = att.filter((r) => r.status === "late").length;
      const absent = att.filter((r) => r.status === "absent" || r.status === "excused").length;
      const total = att.length;
      attendance = { total, present, late, absent, pct: total ? Math.round(((present + late) / total) * 100) : 0 };
      attendanceLog = att.map((r) => {
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
