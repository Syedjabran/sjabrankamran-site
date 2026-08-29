/**
 * "View as role" preview. SERVER-ONLY helpers.
 *
 * A super-admin can preview the portal as another role to see exactly what that
 * interface looks like. This is a UI-shell preview only — it changes which
 * nav/dashboard/pages render, NOT the caller's real data permissions (RLS is
 * unchanged; the admin still only ever sees data their own session allows).
 */
import { cookies } from "next/headers";
import { isAdmin, type EduRole, type PortalUser } from "@/lib/edu/auth";

export const VIEW_AS_COOKIE = "pv_role";
export const PREVIEWABLE: EduRole[] = ["student", "teacher", "teaching_assistant", "parent", "counsellor", "finance_manager"];

export async function getViewAsRole(): Promise<EduRole | null> {
  try {
    const v = (await cookies()).get(VIEW_AS_COOKIE)?.value as EduRole | undefined;
    return v && PREVIEWABLE.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** Effective roles for rendering the UI: a super-admin previewing a role renders
 * as that role; everyone else renders as their real roles. */
export async function effectiveRoles(user: PortalUser): Promise<{ roles: EduRole[]; previewing: EduRole | null }> {
  if (!isAdmin(user.roles)) return { roles: user.roles, previewing: null };
  const v = await getViewAsRole();
  return v ? { roles: [v], previewing: v } : { roles: user.roles, previewing: null };
}
