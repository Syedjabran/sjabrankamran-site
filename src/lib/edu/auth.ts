import { createClient } from "@/lib/supabase/server";

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

export type PortalUser = {
  id: string;
  email: string;
  fullName: string;
  roles: EduRole[];
  status: string;
};

export const ROLE_LABELS: Record<EduRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  teacher: "Teacher",
  teaching_assistant: "Teaching Assistant",
  student: "Student",
  parent: "Parent / Guardian",
  counsellor: "Counsellor",
  content_manager: "Content Manager",
  finance_manager: "Finance Manager",
  coordinator: "Coordinator",
  facilitator: "Facilitator",
  attendance_registrar: "Attendance Registrar",
};

/** Roles that belong to a specific school (a school dropdown is shown for them). */
export const SCHOOL_SCOPED_ROLES: EduRole[] = ["coordinator", "facilitator", "attendance_registrar"];

export function isStaff(roles: EduRole[]) {
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
export function isAttendanceRegistrar(roles: EduRole[]) {
  return roles.includes("attendance_registrar");
}

/** True when the user's ONLY staff-granting role is attendance_registrar. */
export function isRegistrarOnly(roles: EduRole[]) {
  const fullerStaff = ["super_admin", "admin", "teacher", "teaching_assistant", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator"];
  return roles.includes("attendance_registrar") && !roles.some((r) => fullerStaff.includes(r));
}

export function isAdmin(roles: EduRole[]) {
  return roles.some((r) => ["super_admin", "admin"].includes(r));
}

/** Server-side: current signed-in portal user with roles (RLS-scoped). */
export async function getPortalUser(): Promise<PortalUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let fullName = "";
  let roles: EduRole[] = [];
  let status = "active";
  try {
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase.from("edu_profiles").select("full_name, status").eq("id", user.id).maybeSingle(),
      supabase.from("edu_user_roles").select("role").eq("user_id", user.id),
    ]);
    fullName = profile?.full_name ?? "";
    status = profile?.status ?? "active";
    roles = (roleRows ?? []).map((r) => r.role as EduRole);
  } catch {
    // Schema not yet migrated — treat as role-less user.
  }
  return { id: user.id, email: user.email ?? "", fullName, roles, status };
}
