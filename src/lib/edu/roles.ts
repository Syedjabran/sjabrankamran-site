/**
 * Portal roles and the pure rules over them. Pure and isomorphic (no server
 * imports, no `@/` alias): auth.ts re-exports every name here unchanged, and
 * the subject registry (portal/subjects.ts), the portal menu and plain Node
 * tests import this file directly.
 */

export type EduRole =
  | "super_admin"
  | "admin"
  | "teacher"
  | "teaching_assistant"
  | "student"
  | "parent"
  | "counsellor"
  | "content_manager"
  | "finance_manager"
  | "coordinator"
  | "facilitator"
  | "attendance_registrar";

/** Roles that belong to a specific school (a school dropdown is shown for them). */
export const SCHOOL_SCOPED_ROLES: EduRole[] = ["coordinator", "facilitator", "attendance_registrar"];

/**
 * School-scoped roles are never allowed to inherit global staff visibility.
 * An explicit admin/super-admin grant is the only bypass.
 */
export function isSchoolScopedStaff(roles: readonly EduRole[]) {
  return roles.some((r) => SCHOOL_SCOPED_ROLES.includes(r)) && !isAdmin(roles);
}

/** Generic staff surfaces contain network-wide data and are unsafe for scoped staff. */
export function canAccessGlobalStaffData(roles: readonly EduRole[]) {
  return isStaff(roles) && !isSchoolScopedStaff(roles);
}

export function isStaff(roles: readonly EduRole[]) {
  return roles.some((r) =>
    ["super_admin", "admin", "teacher", "teaching_assistant", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator", "attendance_registrar"].includes(r)
  );
}

/**
 * Attendance Registrar: a restricted, school-scoped role that may ONLY view
 * daily attendance for its assigned school — nothing else. When a user has this
 * role and is NOT also a fuller staff/admin role, the portal shows them a
 * cut-down navigation (Dashboard + Attendance view only).
 */
export function isAttendanceRegistrar(roles: readonly EduRole[]) {
  return roles.includes("attendance_registrar");
}

/** True when the user's ONLY staff-granting role is attendance_registrar. */
export function isRegistrarOnly(roles: readonly EduRole[]) {
  return roles.includes("attendance_registrar") && !roles.includes("coordinator") && !roles.includes("facilitator") && !isAdmin(roles);
}

/** Coordinators and facilitators use only the school-and-class scoped desk. */
export function isCoordinatorOnly(roles: readonly EduRole[]) {
  return (roles.includes("coordinator") || roles.includes("facilitator")) && !isAdmin(roles);
}

export function isAdmin(roles: readonly EduRole[]) {
  return roles.some((r) => ["super_admin", "admin"].includes(r));
}

/**
 * Roles allowed to conduct an Exam Lab drill and to read back Drill Records.
 *
 * This is deliberately WIDER than the proctored-test permission, which stays
 * restricted to super_admin/admin/teaching_assistant in the exam-allocate
 * route. Coordinators and facilitators are school-scoped: they appear here,
 * but callers must still narrow what they can touch to their own classes via
 * `visibleClassIdsForUid`. Membership of this list is never, on its own,
 * permission to see another school's or another class's data.
 */
export const DRILL_ROLES: EduRole[] = [
  "super_admin", "admin", "teacher", "coordinator", "facilitator", "teaching_assistant",
];

export function canConductDrills(roles: readonly EduRole[]) {
  return roles.some((r) => DRILL_ROLES.includes(r));
}

/**
 * The owner-defined staff set for Exam Lab privileges: pausing timers and
 * assigning / sharing drills. Deliberately excludes students, parents,
 * attendance_registrar and the wider office roles — only these five roles may
 * conduct, assign or share Exam Lab work.
 */
export const EXAM_LAB_STAFF_ROLES: EduRole[] = ["super_admin", "admin", "teacher", "coordinator", "facilitator"];

export function isExamLabStaff(roles: readonly EduRole[]) {
  return roles.some((r) => EXAM_LAB_STAFF_ROLES.includes(r));
}

/** Same population reads Drill Records; the ROWS are then scope-filtered. */
export function canViewDrillRecords(roles: readonly EduRole[]) {
  return canConductDrills(roles);
}
