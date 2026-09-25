// src/lib/sat/access.ts
//
// SERVER-ONLY. The SAT Lab is gated exactly like the physics tracks (spec 9):
// enrolment in a class whose year label names SAT grants it; staff always have it.
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isExamLabStaff, isSchoolScopedStaff, type EduRole, type PortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { getStaffScope } from "@/lib/portal/staff-school";

export async function satAccess(user: PortalUser): Promise<{ ok: boolean; isStaff: boolean }> {
  const access = await resolveCourseAccess(user);
  return { ok: access.isStaff || access.allowed.includes("SAT"), isStaff: access.isStaff };
}

/**
 * The classes an exam-lab staff member actually teaches or is scoped to.
 *
 * Deliberately NOT `visibleClassIdsForUid` (src/lib/portal/timetable.ts):
 * that function's general branch unions the caller's OWN active class
 * enrolments -- looked up by uid against `edu_students`, unconditionally,
 * regardless of which roles are passed in -- plus, for a "parent" role,
 * every linked child's classes. Passing a roles array with "parent"/
 * "student" filtered out does not close the enrolment branch: it is not
 * gated on `roles` at all, so a staff member who happens to also have an
 * `edu_students` row would still have those classes unioned in. This
 * mirrors only the two branches that are genuine staff-teaching scope --
 * the school-scoped lookup (`getStaffScope`, the same helper the
 * drill-records routes rely on via `visibleClassIdsForUid`'s
 * `isSchoolScopedStaff` branch) and the teacher-owned classes lookup --
 * and skips the own-enrolment and parent branches entirely.
 */
async function teachingClassIds(uid: string, roles: EduRole[]): Promise<string[]> {
  if (isSchoolScopedStaff(roles)) return (await getStaffScope(uid))?.classIds ?? [];
  if (!roles.includes("teacher")) return [];
  const db = createAdminClient();
  const { data: teacher } = await db.from("edu_teachers").select("id").eq("profile_id", uid).maybeSingle();
  if (!teacher?.id) return [];
  const { data } = await db.from("edu_classes").select("id").eq("teacher_id", teacher.id).eq("active", true);
  return (data ?? []).map((r) => r.id as string).filter(Boolean);
}

/**
 * Staff may open a student's sittings only for students in a class they
 * teach or are scoped to -- restricted to `isExamLabStaff` (spec 9), not
 * the much wider `isStaff` (which also admits attendance registrars,
 * finance managers, content managers and counsellors -- none of whom
 * conduct or review SAT Lab sittings).
 */
export async function canViewStudent(user: PortalUser, studentUid: string): Promise<boolean> {
  if (user.id === studentUid) return true;
  if (!isExamLabStaff(user.roles)) return false;
  if (isAdmin(user.roles)) return true;
  const classIds = new Set(await teachingClassIds(user.id, user.roles));
  if (!classIds.size) return false;
  const db = createAdminClient();
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", studentUid).maybeSingle();
  if (!student?.id) return false;
  const { data } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
  return (data ?? []).some((r) => classIds.has(r.class_id as string));
}
