import { bearerToken, createClient } from "@/lib/supabase/server";

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
  | "facilitator";

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
};

/** Roles that belong to a specific school (a school dropdown is shown for them). */
export const SCHOOL_SCOPED_ROLES: EduRole[] = ["coordinator", "facilitator"];

export function isStaff(roles: EduRole[]) {
  return roles.some((r) =>
    ["super_admin", "admin", "teacher", "teaching_assistant", "counsellor", "content_manager", "finance_manager", "coordinator", "facilitator"].includes(r)
  );
}

export function isAdmin(roles: EduRole[]) {
  return roles.some((r) => ["super_admin", "admin"].includes(r));
}

/**
 * Server-side: current signed-in portal user with roles (RLS-scoped).
 *
 * Resolves the caller from the session cookie (the website) or, when there is
 * no cookie session, from an `Authorization: Bearer <access_token>` header
 * (the React Native portal app). Both paths validate the token against the
 * Auth server, and createClient() forwards a bearer token to PostgREST so RLS
 * applies identically either way.
 */
export async function getPortalUser(): Promise<PortalUser | null> {
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
}
