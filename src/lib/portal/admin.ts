/**
 * Admin command-center helpers. SERVER-ONLY (service-role).
 *
 * These power the owner/super-admin console: full user lifecycle (create,
 * password, portal lock/restore, delete, roles, enrolment) plus authoring of
 * assignments & tests. Every mutation is service-role (bypasses RLS) but is
 * gated behind `requireAdmin()` and written to edu_audit_logs.
 */
import { getPortalUser, isAdmin, canAccessGlobalStaffData, ROLE_LABELS, type EduRole, type PortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/portal/mail";
import { getRegistry } from "@/lib/portal/institutions";
import { welcomeCourses, type Course } from "@/lib/portal/course-labels";
import { studentCourses } from "@/lib/portal/course-access";
import { coursesFromGrants, type SubjectId } from "@/lib/portal/subjects";
import { GENERATED_PASSWORD_PREFIX } from "@/lib/portal/brand";
import { credentialsEmail, type Courses } from "@/lib/portal/portal-emails";

export const ALL_ROLES = Object.keys(ROLE_LABELS) as EduRole[];
export const STUDENT_STATUSES = ["active", "archived", "invited"] as const;

export async function requireAdmin(): Promise<PortalUser | null> {
  const u = await getPortalUser();
  if (!u || !isAdmin(u.roles)) return null;
  return u;
}

/** Staff gate (teachers/TAs/counsellors/etc. + admins) — for read surfaces
 * like analytics, rankings and presence that all staff may view. */
export async function requireStaff(): Promise<PortalUser | null> {
  const u = await getPortalUser();
  if (!u || !canAccessGlobalStaffData(u.roles)) return null;
  return u;
}

/** Only a super_admin may do irreversible things (delete users, etc.). */
export function isSuperAdmin(u: PortalUser): boolean {
  return u.roles.includes("super_admin");
}

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function genPassword(): string {
  const arr = new Uint32Array(10);
  globalThis.crypto.getRandomValues(arr);
  let s = "";
  for (const n of arr) s += PW_ALPHABET[n % PW_ALPHABET.length];
  return GENERATED_PASSWORD_PREFIX + s;
}

export function isEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await createAdminClient()
      .from("edu_audit_logs")
      .insert({ actor_id: actorId, action, entity, entity_id: entityId, details });
  } catch {
    /* audit is best-effort */
  }
}

/**
 * The courses a new account's welcome email is written for: a student's
 * class (read from the class registry) and directly granted subjects, as
 * course access counts them; none for anyone else, or a student with
 * neither. A failed registry read counts the class as unplaced, which course
 * access treats as A Level (9702).
 */
export async function welcomeCoursesFor(roles: readonly string[], classId: string | null | undefined, subjects: readonly SubjectId[]): Promise<Course[]> {
  if (!roles.includes("student")) return [];
  const directCourses = coursesFromGrants(Object.fromEntries(subjects.map((s) => [s, true])));
  const classes = classId ? (await getRegistry().catch(() => null))?.classes ?? [] : [];
  return welcomeCourses(classId || null, classes, directCourses);
}

/**
 * The courses an existing account's emails are written for (an admin's
 * password reset, "Forgot password?"): a student's courses as course access
 * reads them; none for anyone else. A failed read counts as none, which
 * words the email for the portal itself rather than for a course.
 */
export async function accountCoursesFor(uid: string): Promise<Course[]> {
  try {
    const { data, error } = await createAdminClient().from("edu_user_roles").select("role").eq("user_id", uid);
    if (error || !(data || []).some((r) => r.role === "student")) return [];
    return await studentCourses(uid);
  } catch {
    return [];
  }
}

export async function emailCredentials(
  actorId: string,
  to: string,
  name: string,
  password: string,
  isReset = false,
  courses: Courses = []
): Promise<{ status: string; error?: string }> {
  const { subject, text, html } = credentialsEmail(name, to, password, isReset, courses);
  const r = await sendMail({
    to: [to],
    subject,
    text,
    html,
    by: actorId,
    byName: "Admin console",
    kind: "announcement",
    meta: { credentials: true, reset: isReset },
  });
  return { status: r.status, error: r.error };
}
