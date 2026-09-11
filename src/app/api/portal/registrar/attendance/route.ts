import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalUser, isStaff, isAdmin, isAttendanceRegistrar, isSchoolScopedStaff } from "@/lib/edu/auth";
import { getStaffScope } from "@/lib/portal/staff-school";
import { getRegistry, staffRoleMap } from "@/lib/portal/institutions";
import { allowsReason, normaliseReason } from "@/lib/edu/attendance";

export const runtime = "nodejs";

/**
 * READ-ONLY daily attendance view.
 *
 * Attendance Registrars may ONLY see attendance for the school assigned to
 * them (Storage-as-DB, staff-schools/<uid>.json). Full admins may pass any
 * ?school= to inspect; a registrar's assigned school always wins.
 *
 * GET ?date=YYYY-MM-DD[&school=<name>][&classId=<id>]
 *   → { date, school, schools, classes:[{id,name,section,year}],
 *       register:[{ classId, className, present, late, online, absent, excused,
 *                   leave, exempt, total, marked,
 *                   students:[{name,status,reason}] }] }
 *
 * `reason` replays the official lesson-exemption reason recorded by staff
 * (edu_attendance.note) so it "reappears in the report".
 */
export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const registrar = isAttendanceRegistrar(user.roles);
  const admin = isAdmin(user.roles);
  // Full staff (teachers etc.) already have the richer voice-attendance tool;
  // this read-only surface is for registrars and admins.
  if (!registrar && !isStaff(user.roles)) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = (url.searchParams.get("date") || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const reg = await getRegistry();

  // Resolve the school scope. A registrar is HARD-pinned to their assigned
  // school; only admins can freely choose (or view all).
  let school: string | null = null;
  const scoped = isSchoolScopedStaff(user.roles);
  const scope = scoped ? await getStaffScope(user.id) : null;
  if (scoped) {
    if (!scope) {
      return NextResponse.json({ error: "Both a school and class must be assigned to your account." }, { status: 403 });
    }
    school = scope.school;
  } else {
    school = url.searchParams.get("school") || null;
  }

  const allowedIds = scope ? new Set(scope.classIds) : null;
  const classesForSchool = reg.classes.filter((c) => (!school || c.school === school) && (!allowedIds || allowedIds.has(c.id)));
  const onlyClassId = url.searchParams.get("classId") || "";
  const targetClasses = onlyClassId ? classesForSchool.filter((c) => c.id === onlyClassId) : classesForSchool;

  const sb = createAdminClient();
  const STATUS_KEYS = ["present", "late", "online", "absent", "excused", "leave", "exempt"] as const;

  const register = await Promise.all(
    targetClasses.map(async (cl) => {
      // Find the lesson for (class, date) — do NOT create one (read-only).
      const { data: lesson } = await sb
        .from("edu_lessons")
        .select("id")
        .eq("class_id", cl.id)
        .eq("lesson_date", date)
        .limit(1)
        .maybeSingle();

      // Roster (active enrolments) with names.
      const { data: enr } = await sb
        .from("edu_enrolments")
        .select("student_id, edu_students(id, profile_id, edu_profiles!edu_students_profile_id_fkey(full_name))")
        .eq("class_id", cl.id)
        .eq("status", "active");
      type ERow = { student_id: string; edu_students?: { profile_id?: string; edu_profiles?: { full_name?: string } } };
      const enrolments = (enr || []) as unknown as ERow[];
      const roleMap = await staffRoleMap(enrolments.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x));
      const roster = enrolments.filter((r) => !r.edu_students?.profile_id || !roleMap.has(r.edu_students.profile_id)).map((r) => ({
        studentId: r.student_id,
        name: r.edu_students?.edu_profiles?.full_name || "Student",
      }));

      const marks: Record<string, string> = {};
      const reasons: Record<string, string> = {};
      if (lesson?.id) {
        const { data: att } = await sb.from("edu_attendance").select("student_id, status, note").eq("lesson_id", lesson.id);
        for (const a of att || []) {
          const sid = a.student_id as string;
          const status = a.status as string;
          marks[sid] = status;
          const note = normaliseReason(a.note);
          // Only show a note where it is an official leave/exemption reason.
          if (note && allowsReason(status)) reasons[sid] = note;
        }
      }

      const counts: Record<string, number> = { present: 0, late: 0, online: 0, absent: 0, excused: 0, leave: 0, exempt: 0 };
      const students = roster
        .map((s) => {
          const status = marks[s.studentId] || "unmarked";
          if (status in counts) counts[status] += 1;
          return { name: s.name, status, reason: reasons[s.studentId] || null };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const marked = STATUS_KEYS.reduce((n, k) => n + counts[k], 0);
      return {
        classId: cl.id,
        className: cl.name,
        section: cl.section,
        year: cl.year,
        total: roster.length,
        marked,
        present: counts.present,
        late: counts.late,
        online: counts.online,
        absent: counts.absent,
        excused: counts.excused,
        leave: counts.leave,
        exempt: counts.exempt,
        students,
      };
    })
  );

  return NextResponse.json(
    {
      date,
      school,
      canChooseSchool: admin && !registrar,
      schools: scope ? [scope.school] : reg.schools,
      register: register.sort((a, b) => a.className.localeCompare(b.className)),
    },
    { status: 200 }
  );
}
