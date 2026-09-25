// src/lib/sat/access.ts
//
// SERVER-ONLY. The SAT Lab is gated exactly like the physics tracks (spec 9):
// enrolment in a class whose year label names SAT grants it; staff always have it.
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isExamLabStaff, type PortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";

export async function satAccess(user: PortalUser): Promise<{ ok: boolean; isStaff: boolean }> {
  const access = await resolveCourseAccess(user);
  return { ok: access.isStaff || access.allowed.includes("SAT"), isStaff: access.isStaff };
}

/**
 * Staff may open a student's sittings only for students in a class they
 * teach or are scoped to -- restricted to `isExamLabStaff` (spec 9), not
 * the much wider `isStaff` (which also admits attendance registrars,
 * finance managers, content managers and counsellors -- none of whom
 * conduct or review SAT Lab sittings).
 *
 * Class scope comes from `visibleClassIdsForUid`, with the caller's own
 * "parent" role filtered out of what is passed to it (timetable.ts's
 * parent branch is gated on `roles.includes("parent")`, so this closes the
 * "sees every linked child's classes" leak). Its `edu_students` /
 * `edu_enrolments` lookup is NOT filtered out and must not be: for
 * exam-lab staff, an active enrolment IS their teaching/class assignment --
 * the admin "enrol" op (src/app/api/portal/admin/users/[id]/action/route.ts)
 * creates exactly that edu_students + edu_enrolments row for ANY user,
 * teacher or otherwise, and `getStaffScope`'s own class list
 * (staff-school.ts) is built on the same lookup. A prior version of this
 * function tried to route around that lookup with a
 * `edu_teachers`-`.teacher_id`-only query; nothing in the codebase ever
 * writes `edu_classes.teacher_id`, so it returned every console-assigned
 * teacher an empty class list and `canViewStudent` refused all of their
 * students. That was wrong and has been reverted.
 */
export async function canViewStudent(user: PortalUser, studentUid: string): Promise<boolean> {
  if (user.id === studentUid) return true;
  if (!isExamLabStaff(user.roles)) return false;
  if (isAdmin(user.roles)) return true;
  const classIds = new Set(await visibleClassIdsForUid(user.id, user.roles.filter((r) => r !== "parent")));
  if (!classIds.size) return false;
  const db = createAdminClient();
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", studentUid).maybeSingle();
  if (!student?.id) return false;
  const { data } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
  return (data ?? []).some((r) => classIds.has(r.class_id as string));
}
