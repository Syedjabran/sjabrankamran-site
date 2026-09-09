/**
 * Role-aware Physics timetable. SERVER-ONLY (service role).
 *
 * The same class visibility rule powers the timetable page, reminders and
 * calendar feed so students/staff cannot see different schedules through
 * different surfaces.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isSchoolScopedStaff, type EduRole } from "@/lib/edu/auth";
import { getRegistry, type ClassMeta } from "@/lib/portal/institutions";
import { getStaffScope } from "@/lib/portal/staff-school";

export const PK_TZ = "Asia/Karachi";
export const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type TimetableSlot = {
  id: string;
  classId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  classMeta: ClassMeta;
};

export type ExtraClass = {
  id: string;
  classId: string;
  lessonDate: string;
  startsAt: string | null;
  endsAt: string | null;
  title: string | null;
  status: string;
  classMeta: ClassMeta;
};

async function rolesFor(uid: string): Promise<EduRole[]> {
  const { data } = await createAdminClient().from("edu_user_roles").select("role").eq("user_id", uid);
  return (data || []).map((r) => r.role as EduRole);
}

/** Exact class ids visible to a user. Admins get the whole ecosystem. */
export async function visibleClassIdsForUid(uid: string, suppliedRoles?: EduRole[]): Promise<string[]> {
  const db = createAdminClient();
  const roles = suppliedRoles || await rolesFor(uid);
  const registry = await getRegistry();
  if (isAdmin(roles)) return registry.classes.map((c) => c.id);

  if (isSchoolScopedStaff(roles)) return (await getStaffScope(uid))?.classIds || [];

  const ids = new Set<string>();

  // Student records are also the explicit class-assignment relation used for
  // staff without a dedicated teacher row.
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
  if (student?.id) {
    const { data } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
    for (const r of data || []) if (r.class_id) ids.add(r.class_id as string);
  }

  // Teacher-owned classes.
  if (roles.includes("teacher") || roles.includes("teaching_assistant")) {
    const { data: teacher } = await db.from("edu_teachers").select("id").eq("profile_id", uid).maybeSingle();
    if (teacher?.id) {
      const { data } = await db.from("edu_classes").select("id").eq("teacher_id", teacher.id).eq("active", true);
      for (const r of data || []) if (r.id) ids.add(r.id as string);
    }
  }

  // Parent/guardian: union of every linked child's active classes.
  if (roles.includes("parent")) {
    const { data: guardian } = await db.from("edu_guardians").select("id").eq("profile_id", uid).maybeSingle();
    if (guardian?.id) {
      const { data: links } = await db.from("edu_student_guardians").select("student_id").eq("guardian_id", guardian.id);
      const studentIds = (links || []).map((r) => r.student_id as string).filter(Boolean);
      if (studentIds.length) {
        const { data } = await db.from("edu_enrolments").select("class_id").in("student_id", studentIds).eq("status", "active");
        for (const r of data || []) if (r.class_id) ids.add(r.class_id as string);
      }
    }
  }

  const known = new Set(registry.classes.map((c) => c.id));
  return [...ids].filter((id) => known.has(id));
}

export async function timetableForUid(uid: string, suppliedRoles?: EduRole[]): Promise<{
  classIds: string[];
  classes: ClassMeta[];
  slots: TimetableSlot[];
  extras: ExtraClass[];
}> {
  const db = createAdminClient();
  const [registry, classIds] = await Promise.all([getRegistry(), visibleClassIdsForUid(uid, suppliedRoles)]);
  const allowed = new Set(classIds);
  const classes = registry.classes.filter((c) => allowed.has(c.id));
  const byId = new Map(classes.map((c) => [c.id, c] as const));
  if (!classIds.length) return { classIds, classes, slots: [], extras: [] };

  const todayPk = new Intl.DateTimeFormat("en-CA", { timeZone: PK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [{ data: scheduleRows }, { data: lessonRows }] = await Promise.all([
    db.from("edu_schedules").select("id,class_id,weekday,starts_at,ends_at").in("class_id", classIds).order("weekday").order("starts_at"),
    db.from("edu_lessons").select("id,class_id,lesson_date,starts_at,ends_at,title,status").in("class_id", classIds).gte("lesson_date", todayPk).neq("status", "cancelled").order("lesson_date").order("starts_at"),
  ]);

  const slots = ((scheduleRows || []) as { id: string; class_id: string; weekday: number; starts_at: string; ends_at: string }[])
    .flatMap((r) => byId.has(r.class_id) ? [{ id: r.id, classId: r.class_id, weekday: r.weekday, startsAt: r.starts_at, endsAt: r.ends_at, classMeta: byId.get(r.class_id)! }] : []);
  const recurring = new Set(slots.map((s) => `${s.classId}:${s.weekday}:${s.startsAt.slice(0, 5)}`));
  const extras = ((lessonRows || []) as { id: string; class_id: string; lesson_date: string; starts_at: string | null; ends_at: string | null; title: string | null; status: string }[])
    .flatMap((r) => {
      const cls = byId.get(r.class_id);
      if (!cls || !r.starts_at) return [];
      const weekday = new Date(`${r.lesson_date}T12:00:00+05:00`).getUTCDay();
      if (recurring.has(`${r.class_id}:${weekday}:${r.starts_at.slice(0, 5)}`)) return [];
      return [{ id: r.id, classId: r.class_id, lessonDate: r.lesson_date, startsAt: r.starts_at, endsAt: r.ends_at, title: r.title, status: r.status, classMeta: cls }];
    });
  return { classIds, classes, slots, extras };
}
