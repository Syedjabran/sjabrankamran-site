/**
 * Mandatory first-login onboarding. SERVER-ONLY.
 *
 * A student must complete a required profile (including at least one valid
 * parent/guardian email) before they can use any portal activity. State is kept
 * as one JSON doc per user in the private `portal-data` bucket (Storage-as-DB,
 * no schema migration) at onboarding/<uid>.json.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export const PORTAL_BUCKET = "portal-data";

export type Guardian = {
  relationship: string;
  name: string;
  email: string;
  phone: string;
  is_primary?: boolean;
};

export type Onboarding = {
  completed_at: string | null;
  full_name: string;
  preferred_name?: string;
  date_of_birth: string; // YYYY-MM-DD
  gender?: string;
  phone: string;
  whatsapp: string; // REQUIRED — at least the student's WhatsApp number
  city: string;
  address?: string;
  photo_path?: string; // OPTIONAL — object path in the private portal-data bucket
  school?: string; // read-only, from enrolment
  class_label?: string; // read-only, from enrolment
  guardians: Guardian[];
  emergency_name?: string;
  emergency_phone?: string;
  consent: boolean;
  updated_at?: string;
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Student photo upload constraints (optional field).
export const PHOTO_PREFIX = "photos";
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Server-side required-field validation. Returns list of problems ([] = ok). */
export function validateOnboarding(o: Partial<Onboarding>): string[] {
  const errs: string[] = [];
  if (!o.full_name || o.full_name.trim().length < 2) errs.push("Full name is required.");
  if (!o.date_of_birth || !/^\d{4}-\d{2}-\d{2}$/.test(o.date_of_birth)) errs.push("A valid date of birth is required.");
  if (!o.phone || o.phone.replace(/\D/g, "").length < 7) errs.push("A valid phone number is required.");
  if (!o.whatsapp || o.whatsapp.replace(/\D/g, "").length < 7) errs.push("A valid WhatsApp number is required.");
  if (!o.city || o.city.trim().length < 2) errs.push("City is required.");
  const gs = (o.guardians || []).filter((g) => g && (g.name || g.email || g.phone));
  if (gs.length < 1) errs.push("At least one parent/guardian is required.");
  const primary = gs.find((g) => g.is_primary) || gs[0];
  if (primary) {
    if (!primary.name || primary.name.trim().length < 2) errs.push("Parent/guardian name is required.");
    if (!primary.email || !EMAIL_RE.test(primary.email.trim())) errs.push("A valid parent/guardian email is required.");
    if (!primary.phone || primary.phone.replace(/\D/g, "").length < 7) errs.push("A valid parent/guardian phone is required.");
  }
  // any provided guardian email must be valid
  for (const g of gs) {
    if (g.email && !EMAIL_RE.test(g.email.trim())) errs.push(`Guardian email "${g.email}" is not valid.`);
  }
  if (!o.consent) errs.push("Please confirm the details are correct and give consent.");
  return errs;
}

export async function getOnboarding(uid: string): Promise<Onboarding | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(PORTAL_BUCKET).download(`onboarding/${uid}.json`);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as Onboarding;
  } catch {
    return null;
  }
}

export async function saveOnboarding(uid: string, o: Onboarding): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const body = new Blob([JSON.stringify(o)], { type: "application/json" });
    const { error } = await supabase.storage
      .from(PORTAL_BUCKET)
      .upload(`onboarding/${uid}.json`, body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch {
    return false;
  }
}

/** Fast gate used by the portal layout — true when the student is cleared to proceed. */
export async function isOnboardingComplete(uid: string): Promise<boolean> {
  const o = await getOnboarding(uid);
  return !!(o && o.completed_at);
}

/** All guardian emails on record for a student uid (used by the progress-email agent). */
export async function guardianEmails(uid: string): Promise<string[]> {
  const o = await getOnboarding(uid);
  if (!o) return [];
  return (o.guardians || []).map((g) => (g.email || "").trim()).filter((e) => EMAIL_RE.test(e));
}
