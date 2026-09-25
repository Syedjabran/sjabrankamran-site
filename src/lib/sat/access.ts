// src/lib/sat/access.ts
//
// SERVER-ONLY. The SAT Lab is gated exactly like the physics tracks (spec 9):
// enrolment in a class whose year label names SAT grants it; staff always have it.
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isExamLabStaff, type PortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess, courseFromYear } from "@/lib/portal/course-access";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { getRegistry, type Registry } from "@/lib/portal/institutions";

export async function satAccess(user: PortalUser): Promise<{ ok: boolean; isStaff: boolean }> {
  const access = await resolveCourseAccess(user);
  return { ok: access.isStaff || access.allowed.includes("SAT"), isStaff: access.isStaff };
}

/**
 * The SAT-track class ids this user may see: every SAT-track class for an
 * admin, or the intersection of `visibleClassIdsForUid` with SAT-track
 * classes (registry classes whose `courseFromYear(year) === "SAT"`) for any
 * other exam-lab staff. Non-exam-lab-staff (including students) get an empty
 * scope -- callers gate on `isExamLabStaff` before this matters.
 *
 * The caller's own "parent" role is filtered out of what is passed to
 * `visibleClassIdsForUid` (timetable.ts's parent branch is gated on
 * `roles.includes("parent")`, so this closes the "sees every linked child's
 * classes" leak). Its `edu_students` / `edu_enrolments` lookup is NOT
 * filtered out and must not be: for exam-lab staff, an active enrolment IS
 * their teaching/class assignment -- the admin "enrol" op
 * (src/app/api/portal/admin/users/[id]/action/route.ts) creates exactly that
 * edu_students + edu_enrolments row for ANY user, teacher or otherwise, and
 * `getStaffScope`'s own class list (staff-school.ts) is built on the same
 * lookup. A prior version tried to route around that lookup with an
 * `edu_teachers`.`teacher_id`-only query; nothing in the codebase ever
 * writes `edu_classes.teacher_id`, so it returned every console-assigned
 * teacher an empty class list. That was wrong and has been reverted.
 *
 * Shared by `canViewStudent` and the staff SAT results route
 * (src/app/api/sat/results/route.ts) so the two can never disagree about
 * which students are in scope -- the results list must never show a student
 * whose sitting `canViewStudent` would then refuse.
 *
 * `registry` is optional: pass an already-fetched one (the results route
 * reads it once, for the class names too, and treats a registry with zero
 * classes as a failed read -- see that route) to avoid a second
 * `getRegistry()` storage round-trip. Every other caller (namely
 * `canViewStudent`) omits it and this fetches its own, unchanged.
 */
export async function satClassScope(user: PortalUser, registry?: Registry): Promise<string[]> {
  if (!isExamLabStaff(user.roles)) return [];
  const reg = registry ?? (await getRegistry());
  const satClassIds = reg.classes.filter((c) => courseFromYear(c.year) === "SAT").map((c) => c.id);
  if (isAdmin(user.roles)) return satClassIds;
  const satSet = new Set(satClassIds);
  const visible = await visibleClassIdsForUid(user.id, user.roles.filter((r) => r !== "parent"));
  return visible.filter((id) => satSet.has(id));
}

/**
 * Staff may open a student's sittings only for students in an SAT-track
 * class they teach or are scoped to -- restricted to `isExamLabStaff` (spec
 * 9), not the much wider `isStaff` (which also admits attendance
 * registrars, finance managers, content managers and counsellors -- none of
 * whom conduct or review SAT Lab sittings).
 */
export async function canViewStudent(user: PortalUser, studentUid: string): Promise<boolean> {
  if (user.id === studentUid) return true;
  if (!isExamLabStaff(user.roles)) return false;
  if (isAdmin(user.roles)) return true;
  const classIds = new Set(await satClassScope(user));
  if (!classIds.size) return false;
  const db = createAdminClient();
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", studentUid).maybeSingle();
  if (!student?.id) return false;
  const { data } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
  return (data ?? []).some((r) => classIds.has(r.class_id as string));
}
