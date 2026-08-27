/**
 * Institutional analytics. SERVER-ONLY (service-role).
 *
 * Groups students by School → Class (year + section) using the registry written
 * by the seed (portal-data/institutions.json) and the relational edu_ tables,
 * then rolls up progress at the individual AND institutional level by reading
 * each student's Exam Lab attempts (exam-data bucket) + attendance/results.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { PORTAL_BUCKET } from "@/lib/portal/onboarding";

export type ClassMeta = {
  id: string; key: string; school: string; year: string;
  section: string | null; subject: string; name: string;
};
export type Registry = { updated_at: string; schools: string[]; classes: ClassMeta[] };

export type StudentProgress = {
  studentId: string;
  uid: string;
  name: string;
  email: string;
  studentNo: string | null;
  onboarded: boolean;
  attempts: number;
  papersSat: number;
  scoredQuestions: number;
  accuracy: number | null; // null = no scored data yet
  level: number;
  attendancePct: number | null;
  lastActive: number | null;
};

export type ClassReport = ClassMeta & {
  students: StudentProgress[];
  activeStudents: number;
  avgAccuracy: number | null;
  totalAttempts: number;
  avgAttendance: number | null;
  onboardedPct: number;
};

export type SchoolReport = {
  school: string;
  classes: ClassReport[];
  students: number;
  activeStudents: number;
  avgAccuracy: number | null;
  totalAttempts: number;
  avgAttendance: number | null;
};

export async function getRegistry(): Promise<Registry> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.storage.from(PORTAL_BUCKET).download("institutions.json");
    if (data) return JSON.parse(await data.text()) as Registry;
  } catch {
    /* fall through */
  }
  return { updated_at: "", schools: [], classes: [] };
}

async function onboardedSet(uids: string[]): Promise<Set<string>> {
  const supabase = createAdminClient();
  const out = new Set<string>();
  await Promise.all(
    uids.map(async (uid) => {
      try {
        const { data } = await supabase.storage.from(PORTAL_BUCKET).download(`onboarding/${uid}.json`);
        if (data) {
          const o = JSON.parse(await data.text());
          if (o?.completed_at) out.add(uid);
        }
      } catch {
        /* ignore */
      }
    })
  );
  return out;
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

/** Roster + per-student progress for one class. */
export async function getClassReport(meta: ClassMeta): Promise<ClassReport> {
  const supabase = createAdminClient();
  const { data: enr } = await supabase
    .from("edu_enrolments")
    .select("student_id, edu_students(id, student_no, profile_id, edu_profiles(full_name, email))")
    .eq("class_id", meta.id)
    .eq("status", "active");

  type Row = { student_id: string; edu_students?: { id: string; student_no: string | null; profile_id: string; edu_profiles?: { full_name?: string; email?: string } } };
  const rows = (enr || []) as unknown as Row[];
  const uids = rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x);
  const onboarded = await onboardedSet(uids);

  const students: StudentProgress[] = await Promise.all(
    rows.map(async (r) => {
      const s = r.edu_students;
      const uid = s?.profile_id || "";
      const attempts = uid ? await getAttempts(uid) : [];
      const a = analyse(attempts);
      // attendance
      let attendancePct: number | null = null;
      if (s?.id) {
        const { data: att } = await supabase.from("edu_attendance").select("status").eq("student_id", s.id);
        if (att && att.length) {
          const good = att.filter((x) => x.status === "present" || x.status === "late").length;
          attendancePct = Math.round((good / att.length) * 100);
        }
      }
      const lastActive = attempts.length ? Math.max(...attempts.map((x) => x.ts)) : null;
      return {
        studentId: s?.id || "",
        uid,
        name: s?.edu_profiles?.full_name || s?.edu_profiles?.email || "Student",
        email: s?.edu_profiles?.email || "",
        studentNo: s?.student_no ?? null,
        onboarded: onboarded.has(uid),
        attempts: a.totalAttempts,
        papersSat: a.papersSat,
        scoredQuestions: a.scoredQuestions,
        accuracy: a.scoredQuestions ? a.overallAccuracy : null,
        level: a.level,
        attendancePct,
        lastActive,
      };
    })
  );

  students.sort((x, y) => (y.accuracy ?? -1) - (x.accuracy ?? -1) || y.attempts - x.attempts);
  const totalAttempts = students.reduce((s, x) => s + x.attempts, 0);
  return {
    ...meta,
    students,
    activeStudents: students.filter((s) => s.attempts > 0).length,
    avgAccuracy: avg(students.map((s) => s.accuracy)),
    totalAttempts,
    avgAttendance: avg(students.map((s) => s.attendancePct)),
    onboardedPct: students.length ? Math.round((students.filter((s) => s.onboarded).length / students.length) * 100) : 0,
  };
}

/** Full institutional report: schools → classes → students. */
export async function getInstitutionReport(): Promise<SchoolReport[]> {
  const reg = await getRegistry();
  const classReports = await Promise.all(reg.classes.map((c) => getClassReport(c)));
  const bySchool = new Map<string, ClassReport[]>();
  for (const cr of classReports) {
    const arr = bySchool.get(cr.school) || [];
    arr.push(cr);
    bySchool.set(cr.school, arr);
  }
  const schools: SchoolReport[] = [...bySchool.entries()].map(([school, classes]) => {
    const allStudents = classes.flatMap((c) => c.students);
    return {
      school,
      classes: classes.sort((a, b) => a.name.localeCompare(b.name)),
      students: allStudents.length,
      activeStudents: allStudents.filter((s) => s.attempts > 0).length,
      avgAccuracy: avg(allStudents.map((s) => s.accuracy)),
      totalAttempts: allStudents.reduce((s, x) => s + x.attempts, 0),
      avgAttendance: avg(allStudents.map((s) => s.attendancePct)),
    };
  });
  return schools.sort((a, b) => a.school.localeCompare(b.school));
}
