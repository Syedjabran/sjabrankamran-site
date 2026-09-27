/**
 * Practical Lab access for the portal page and nav. SERVER-ONLY.
 *
 * The same rule as the middleware's /lab gate (practical-lab-access.ts):
 * lab staff always, anyone else when an admin has switched Practical Lab on
 * for them (subject-grants.ts). Throws when the grants record can't be read,
 * like satAccess, so a failed read is shown as "couldn't be checked" and
 * never as "not switched on" -- and never as access.
 */
import "server-only";
import type { PortalUser } from "@/lib/edu/auth";
import { readGrants } from "@/lib/portal/subject-grants";
import { isLabStaff, labAccess } from "@/lib/portal/practical-lab-access";

export async function practicalLabAccess(user: PortalUser): Promise<{ ok: boolean; isStaff: boolean }> {
  if (isLabStaff(user.roles)) return { ok: true, isStaff: true };
  const { grants } = await readGrants(user.id);
  return { ok: labAccess(user.roles, { ok: true, grants }) === "allow", isStaff: false };
}
