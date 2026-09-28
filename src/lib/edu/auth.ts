import { cache } from "react";
import { bearerToken, createClient } from "@/lib/supabase/server";
import type { EduRole } from "./roles.ts";

// The roles and every pure rule over them live in roles.ts (pure, so the
// subject registry and plain Node tests can use them); re-exported here so
// every existing `@/lib/edu/auth` import keeps working unchanged.
export type { EduRole } from "./roles.ts";
export {
  SCHOOL_SCOPED_ROLES, isSchoolScopedStaff, canAccessGlobalStaffData, isStaff, isAttendanceRegistrar,
  isRegistrarOnly, isCoordinatorOnly, isAdmin, DRILL_ROLES, canConductDrills, EXAM_LAB_STAFF_ROLES,
  isExamLabStaff, canViewDrillRecords,
} from "./roles.ts";

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

/**
 * Server-side: current signed-in portal user with roles (RLS-scoped).
 *
 * Resolves the caller from the session cookie (the website) or, when there is
 * no cookie session, from an `Authorization: Bearer <access_token>` header
 * (the React Native portal app). Both paths validate the token against the
 * Auth server, and createClient() forwards a bearer token to PostgREST so RLS
 * applies identically either way.
 *
 * Memoized per request via React.cache: the portal layout AND the page both
 * call this on every tab navigation; without dedup that doubles the Supabase
 * round-trips (auth.getUser + profile + roles) on each route.
 */
export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const token = await bearerToken();
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    }
  }
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
});
