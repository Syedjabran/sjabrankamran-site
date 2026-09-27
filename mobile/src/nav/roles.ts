/** Ported verbatim from the website's src/lib/edu/auth.ts. */

export type EduRole =
  | 'super_admin'
  | 'admin'
  | 'teacher'
  | 'teaching_assistant'
  | 'student'
  | 'parent'
  | 'counsellor'
  | 'content_manager'
  | 'finance_manager'
  | 'coordinator'
  | 'facilitator'
  | 'attendance_registrar';

export const ROLE_LABELS: Record<EduRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  teacher: 'Teacher',
  teaching_assistant: 'Teaching Assistant',
  student: 'Student',
  parent: 'Parent / Guardian',
  counsellor: 'Counsellor',
  content_manager: 'Content Manager',
  finance_manager: 'Finance Manager',
  coordinator: 'Coordinator',
  facilitator: 'Facilitator',
  attendance_registrar: 'Attendance Registrar',
};

/** Roles that belong to a specific school (a school dropdown is shown for them). */
export const SCHOOL_SCOPED_ROLES: EduRole[] = ['coordinator', 'facilitator', 'attendance_registrar'];

const STAFF_ROLES: EduRole[] = [
  'super_admin',
  'admin',
  'teacher',
  'teaching_assistant',
  'counsellor',
  'content_manager',
  'finance_manager',
  'coordinator',
  'facilitator',
  'attendance_registrar',
];

export function isStaff(roles: EduRole[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

export function isAdmin(roles: EduRole[]): boolean {
  return roles.some((r) => r === 'super_admin' || r === 'admin');
}

/**
 * School-scoped roles are never allowed to inherit global staff visibility.
 * An explicit admin/super-admin grant is the only bypass.
 */
export function isSchoolScopedStaff(roles: EduRole[]): boolean {
  return roles.some((r) => SCHOOL_SCOPED_ROLES.includes(r)) && !isAdmin(roles);
}

/** Generic staff surfaces contain network-wide data and are unsafe for scoped staff. */
export function canAccessGlobalStaffData(roles: EduRole[]): boolean {
  return isStaff(roles) && !isSchoolScopedStaff(roles);
}

/**
 * Attendance Registrar: a restricted, school-scoped role that may ONLY view
 * daily attendance for its assigned school — nothing else. When a user has this
 * role and is NOT also a fuller staff/admin role, the portal shows them a
 * cut-down navigation (Dashboard + Attendance view only).
 */
export function isAttendanceRegistrar(roles: EduRole[]): boolean {
  return roles.includes('attendance_registrar');
}

/** True when the user's ONLY staff-granting role is attendance_registrar. */
export function isRegistrarOnly(roles: EduRole[]): boolean {
  return (
    roles.includes('attendance_registrar') &&
    !roles.includes('coordinator') &&
    !roles.includes('facilitator') &&
    !isAdmin(roles)
  );
}

/** Coordinators and facilitators use only the school-and-class scoped desk. */
export function isCoordinatorOnly(roles: EduRole[]): boolean {
  return (roles.includes('coordinator') || roles.includes('facilitator')) && !isAdmin(roles);
}

/** "Admin · Student", or the website's fallback when no role is assigned. */
export function roleBadges(roles: EduRole[]): string {
  return roles.length
    ? roles.map((r) => ROLE_LABELS[r] ?? r).join(' · ')
    : 'Awaiting role assignment';
}
