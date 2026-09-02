import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalUser, isStaff, isAdmin, isAttendanceRegistrar } from "@/lib/edu/auth";
import { getStaffSchool } from "@/lib/portal/staff-school";
import { getRegistry } from "@/lib/portal/institutions";

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
 *                   total, marked, students:[{name,status}] }] }
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
  const assigned = await getStaffSchool(user.id);
  if (registrar && !admin) {
    if (!assigned) {
      return NextResponse.json({ error: "No school has been assigned to your account yet. Please contact the administrator." }, { status: 403 });
    }
    school = assigned;
  } else {
    school = url.searchParams.get("school") || assigned || null;
  }

  const classesForSchool = reg.classes.filter((c) => !school || c.school === school);
  const onlyClassId = url.searchParams.get("classId") || "";
  const targetClasses = onlyClassId ? classesForSchool.filter((c) => c.id === onlyClassId) : classesForSchool;

  const sb = createAdminClient();
  const STATUS_KEYS = ["present", "late", "online", "absent", "excused"] as const;

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
        .select("student_id, edu_students(id, edu_profiles!edu_students_profile_id_fkey(full_name))")
        .eq("class_id", cl.id)
        .eq("status", "active");
      type ERow = { student_id: string; edu_students?: { edu_profiles?: { full_name?: string } } };
      const roster = ((enr || []) as unknown as ERow[]).map((r) => ({
        studentId: r.student_id,
        name: r.edu_students?.edu_profiles?.full_name || "Student",
      }));

      const marks: Record<string, string> = {};
      if (lesson?.id) {
        const { data: att } = await sb.from("edu_attendance").select("student_id, status").eq("lesson_id", lesson.id);
        for (const a of att || []) marks[a.student_id as string] = a.status as string;
      }

      const counts: Record<string, number> = { present: 0, late: 0, online: 0, absent: 0, excused: 0 };
      const students = roster
        .map((s) => {
          const status = marks[s.studentId] || "unmarked";
          if (status in counts) counts[status] += 1;
          return { name: s.name, status };
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
        students,
      };
    })
  );

  return NextResponse.json(
    {
      date,
      school,
      canChooseSchool: admin && !registrar,
      schools: reg.schools,
      register: register.sort((a, b) => a.className.localeCompare(b.className)),
    },
    { status: 200 }
  );
}
