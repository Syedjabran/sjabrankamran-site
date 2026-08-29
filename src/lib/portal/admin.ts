/**
 * Admin command-center helpers. SERVER-ONLY (service-role).
 *
 * These power the owner/super-admin console: full user lifecycle (create,
 * password, suspend/reactivate, delete, roles, enrolment) plus authoring of
 * assignments & tests. Every mutation is service-role (bypasses RLS) but is
 * gated behind `requireAdmin()` and written to edu_audit_logs.
 */
import { getPortalUser, isAdmin, isStaff, ROLE_LABELS, type EduRole, type PortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/portal/mail";

export const ALL_ROLES = Object.keys(ROLE_LABELS) as EduRole[];
export const STUDENT_STATUSES = ["active", "archived", "invited"] as const;

/** Long ban == suspended (GoTrue blocks new logins & token refresh). */
export const SUSPEND_DURATION = "876000h"; // ~100 years

export async function requireAdmin(): Promise<PortalUser | null> {
  const u = await getPortalUser();
  if (!u || !isAdmin(u.roles)) return null;
  return u;
}

/** Staff gate (teachers/TAs/counsellors/etc. + admins) — for read surfaces
 * like analytics, rankings and presence that all staff may view. */
export async function requireStaff(): Promise<PortalUser | null> {
  const u = await getPortalUser();
  if (!u || !isStaff(u.roles)) return null;
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
  return "Phy-" + s;
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

/** Welcome / credentials email (same voice as the student welcome blast). */
export function credentialsEmail(name: string, email: string, password: string, isReset = false) {
  const subject = isReset
    ? "Your Physics portal password has been reset"
    : "Your Physics portal login - sjabrankamran.com";
  const intro = isReset
    ? "Your Physics portal password has been reset. Here are your current sign-in details."
    : "Welcome to your A-Level Physics learning portal. You now have your own account where you can sit real CAIE 9702 past papers, take timed topic drills with instant marking and feedback, and track your progress through the year.";
  const text = `Dear ${name},

${intro}

YOUR LOGIN
Portal: https://sjabrankamran.com/portal/login
Email: ${email}
${isReset ? "New password" : "Temporary password"}: ${password}

${isReset ? "" : `FIRST LOGIN - please do this first
On your first sign-in you will be asked to complete a short profile form (about two minutes). It asks for your details and a valid PARENT / GUARDIAN email and WhatsApp number, so we can send progress updates. You only do this once, and the rest of the portal unlocks after you submit it.

`}Please keep your password private. You can change it any time using "Forgot password?" on the login page.

NEED HELP?
For anything at all, reply to this email (physics@sjabrankamran.com) or visit https://www.sjabrankamran.com .

Warm regards,
Syed Jabran Ali Kamran
Physics | sjabrankamran.com`;
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${esc.replace(/\n/g, "<br>")}</div>`;
  return { subject, text, html };
}

export async function emailCredentials(
  actorId: string,
  to: string,
  name: string,
  password: string,
  isReset = false
): Promise<{ status: string; error?: string }> {
  const { subject, text, html } = credentialsEmail(name, to, password, isReset);
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
