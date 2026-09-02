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
  | 'facilitator';

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
};

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
];

export function isStaff(roles: EduRole[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

export function isAdmin(roles: EduRole[]): boolean {
  return roles.some((r) => r === 'super_admin' || r === 'admin');
}

/** "Admin · Student", or the website's fallback when no role is assigned. */
export function roleBadges(roles: EduRole[]): string {
  return roles.length
    ? roles.map((r) => ROLE_LABELS[r] ?? r).join(' · ')
    : 'Awaiting role assignment';
}
