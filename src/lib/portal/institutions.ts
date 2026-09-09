/**
 * Institutional analytics. SERVER-ONLY (service-role).
 *
 * Groups students by School → Class (year + section) using the registry written
 * by the seed (portal-data/institutions.json) and the relational edu_ tables,
 * then rolls up progress at the individual AND institutional level by reading
 * each student's Exam Lab attempts (exam-data bucket) + attendance/results.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS, type EduRole } from "@/lib/edu/auth";
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { PORTAL_BUCKET } from "@/lib/portal/onboarding";
import { attendancePercent } from "@/lib/edu/attendance";

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
  whatsapp: string | null;
  photoUrl: string | null;
  attempts: number;
  papersSat: number;
  scoredQuestions: number;
  accuracy: number | null; // null = no scored data yet
  level: number;
  attendancePct: number | null;
  lastActive: number | null;
};

/**
 * A staff member assigned to a class (coordinator / facilitator / attendance
 * registrar / teacher …). They are enrolled against the class for access but are
 * NEVER counted or ranked as students; they surface in the class header instead.
 */
export type ClassStaff = { uid: string; name: string; roles: EduRole[]; roleLabel: string };

/** Roles that mean "not a student in this class". */
const NON_STUDENT_ROLES: EduRole[] = ["super_admin", "admin", "teacher", "teaching_assistant", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"];

export type ClassReport = ClassMeta & {
  students: StudentProgress[];
  staff: ClassStaff[];
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

type OnbInfo = { completed: boolean; whatsapp: string | null; photoPath: string | null };

/** Read each student's onboarding doc → completion, WhatsApp, and photo path. */
async function onboardingInfo(uids: string[]): Promise<Map<string, OnbInfo>> {
  const supabase = createAdminClient();
  const out = new Map<string, OnbInfo>();
  await Promise.all(
    uids.map(async (uid) => {
      try {
        const { data } = await supabase.storage.from(PORTAL_BUCKET).download(`onboarding/${uid}.json`);
        if (data) {
          const o = JSON.parse(await data.text());
          out.set(uid, {
            completed: !!o?.completed_at,
            whatsapp: (o?.whatsapp || "").trim() || null,
            photoPath: (o?.photo_path || "").trim() || null,
          });
        }
      } catch {
        /* ignore */
      }
    })
  );
  return out;
}

/** Batch-sign private photo object paths → uid→signed URL (1h). */
async function signPhotos(info: Map<string, OnbInfo>): Promise<Map<string, string>> {
  const supabase = createAdminClient();
  const entries = [...info.entries()].filter(([, v]) => v.photoPath) as [string, OnbInfo][];
  const urls = new Map<string, string>();
  if (!entries.length) return urls;
  const paths = entries.map(([, v]) => v.photoPath as string);
  try {
    const { data } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrls(paths, 3600);
    if (data) {
      const byPath = new Map(data.map((d) => [d.path, d.signedUrl] as const));
      for (const [uid, v] of entries) {
        const u = v.photoPath ? byPath.get(v.photoPath) : null;
        if (u) urls.set(uid, u);
      }
    }
  } catch {
    /* ignore */
  }
  return urls;
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

/**
 * Map each uid to the staff roles it holds (empty when the user is a pure
 * student). One shared query keeps assigned staff out of student rosters.
 */
export async function staffRoleMap(uids: string[]): Promise<Map<string, EduRole[]>> {
  const out = new Map<string, EduRole[]>();
  if (!uids.length) return out;
  const { data } = await createAdminClient()
    .from("edu_user_roles")
    .select("user_id, role")
    .in("user_id", uids);
  for (const r of (data || []) as { user_id: string; role: EduRole }[]) {
    if (!NON_STUDENT_ROLES.includes(r.role)) continue;
    const arr = out.get(r.user_id) || [];
    if (!arr.includes(r.role)) arr.push(r.role);
    out.set(r.user_id, arr);
  }
  return out;
}

const ROLE_RANK: EduRole[] = ["super_admin", "admin", "coordinator", "teacher", "facilitator", "teaching_assistant", "counsellor", "attendance_registrar", "content_manager", "finance_manager"];
function primaryRoleLabel(roles: EduRole[]): string {
  const primary = ROLE_RANK.find((r) => roles.includes(r)) || roles[0];
  return primary ? ROLE_LABELS[primary] : "Staff";
}

/** Roster + per-student progress for one class. */
export async function getClassReport(meta: ClassMeta): Promise<ClassReport> {
  const supabase = createAdminClient();
  const { data: enr } = await supabase
    .from("edu_enrolments")
    .select("student_id, edu_students(id, student_no, profile_id, edu_profiles!edu_students_profile_id_fkey(full_name, email))")
    .eq("class_id", meta.id)
    .eq("status", "active");

  type Row = { student_id: string; edu_students?: { id: string; student_no: string | null; profile_id: string; edu_profiles?: { full_name?: string; email?: string } } };
  const rows = (enr || []) as unknown as Row[];
  const allUids = rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x);
  const roleMap = await staffRoleMap(allUids);
  const studentRows = rows.filter((r) => { const u = r.edu_students?.profile_id; return !!u && !roleMap.has(u); });
  const staff: ClassStaff[] = rows
    .filter((r) => { const u = r.edu_students?.profile_id; return !!u && roleMap.has(u); })
    .map((r) => {
      const roles = roleMap.get(r.edu_students!.profile_id) || [];
      return { uid: r.edu_students!.profile_id, name: r.edu_students?.edu_profiles?.full_name || r.edu_students?.edu_profiles?.email || "Staff", roles, roleLabel: primaryRoleLabel(roles) };
    })
    .sort((a, b) => ROLE_RANK.indexOf(a.roles[0]) - ROLE_RANK.indexOf(b.roles[0]) || a.name.localeCompare(b.name));
  const uids = studentRows.map((r) => r.edu_students!.profile_id);
  const info = await onboardingInfo(uids);
  const photos = await signPhotos(info);

  const students: StudentProgress[] = await Promise.all(
    studentRows.map(async (r) => {
      const s = r.edu_students;
      const uid = s?.profile_id || "";
      const attempts = uid ? await getAttempts(uid) : [];
      const a = analyse(attempts);
      // attendance
      let attendancePct: number | null = null;
      if (s?.id) {
        const { data: att } = await supabase.from("edu_attendance").select("status").eq("student_id", s.id);
        // excused / leave / exempt are excluded from the denominator.
        if (att && att.length) attendancePct = attendancePercent(att.map((x) => x.status as string));
      }
      const lastActive = attempts.length ? Math.max(...attempts.map((x) => x.ts)) : null;
      return {
        studentId: s?.id || "",
        uid,
        name: s?.edu_profiles?.full_name || s?.edu_profiles?.email || "Student",
        email: s?.edu_profiles?.email || "",
        studentNo: s?.student_no ?? null,
        onboarded: info.get(uid)?.completed ?? false,
        whatsapp: info.get(uid)?.whatsapp ?? null,
        photoUrl: photos.get(uid) ?? null,
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
    staff,
    activeStudents: students.filter((s) => s.attempts > 0).length,
    avgAccuracy: avg(students.map((s) => s.accuracy)),
    totalAttempts,
    avgAttendance: avg(students.map((s) => s.attendancePct)),
    onboardedPct: students.length ? Math.round((students.filter((s) => s.onboarded).length / students.length) * 100) : 0,
  };
}

/** Full institutional report: schools → classes → students. */
/** Optional school/class arguments are authorization boundaries for scoped staff. */
export async function getInstitutionReport(onlySchool?: string | null, onlyClassIds?: string[] | null): Promise<SchoolReport[]> {
  const reg = await getRegistry();
  const classSet = onlyClassIds ? new Set(onlyClassIds) : null;
  const allowed = reg.classes.filter((c) => (!onlySchool || c.school === onlySchool) && (!classSet || classSet.has(c.id)));
  const classReports = await Promise.all(allowed.map((c) => getClassReport(c)));
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
