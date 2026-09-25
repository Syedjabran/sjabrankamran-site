/**
 * Onboarding rules shared by the edge middleware and the server portal. No
 * server-only imports, so middleware.ts can use it: both gates must agree on
 * what "complete" means, or a student cleared by one is bounced by the other
 * straight back to the form.
 */

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
  photo_path?: string; // REQUIRED — object path in the private portal-data bucket
  school?: string; // read-only, from enrolment
  class_label?: string; // read-only, from enrolment
  guardians: Guardian[];
  emergency_name?: string;
  emergency_phone?: string;
  consent: boolean;
  updated_at?: string;
};

export const PORTAL_BUCKET = "portal-data";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Student photo upload constraints. Vercel rejects function request bodies
// over 4.5 MB before our code runs, so the cap sits below that; the form
// downscales photos in the browser first.
export const PHOTO_PREFIX = "photos";
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function onboardingPath(uid: string): string {
  return `onboarding/${uid}.json`;
}

/**
 * A unique query string forces a storage CDN miss. Plain object reads can be
 * served stale long after a write (see forum.ts readJson), which re-gated
 * students who had just re-submitted the form.
 */
export function cacheBuster(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Server-side required-field validation. Returns list of problems ([] = ok). */
export function validateOnboarding(o: Partial<Onboarding>): string[] {
  const errs: string[] = [];
  if (!o.full_name || o.full_name.trim().length < 2) errs.push("Full name is required.");
  if (!o.date_of_birth || !/^\d{4}-\d{2}-\d{2}$/.test(o.date_of_birth)) errs.push("A valid date of birth is required.");
  if (!o.phone || o.phone.replace(/\D/g, "").length < 7) errs.push("A valid phone number is required.");
  if (!o.whatsapp || o.whatsapp.replace(/\D/g, "").length < 7) errs.push("A valid WhatsApp number is required.");
  if (!o.city || o.city.trim().length < 2) errs.push("City is required.");
  if (!o.photo_path || !o.photo_path.startsWith(`${PHOTO_PREFIX}/`)) errs.push("A student profile photo is required.");
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

/** The single definition of a completed onboarding record, used by every gate. */
export function isOnboardingDocComplete(o: Partial<Onboarding> | null | undefined): boolean {
  return !!(o && o.completed_at && validateOnboarding(o).length === 0);
}
