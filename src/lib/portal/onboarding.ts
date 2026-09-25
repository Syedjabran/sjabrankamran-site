/**
 * Mandatory first-login onboarding. SERVER-ONLY.
 *
 * A student must complete a required profile (including at least one valid
 * parent/guardian email) before they can use any portal activity. State is kept
 * as one JSON doc per user in the private `portal-data` bucket (Storage-as-DB,
 * no schema migration) at onboarding/<uid>.json.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EMAIL_RE, PORTAL_BUCKET, cacheBuster, isOnboardingDocComplete, onboardingPath, type Onboarding,
} from "@/lib/portal/onboarding-shared";

// The rules and types live in onboarding-shared.ts so the edge middleware can
// apply the exact same definition of "complete"; re-exported for existing callers.
export {
  EMAIL_RE, PHOTO_MAX_BYTES, PHOTO_PREFIX, PHOTO_TYPES, PORTAL_BUCKET, validateOnboarding,
  type Guardian, type Onboarding,
} from "@/lib/portal/onboarding-shared";

type ReadResult = { status: "found"; doc: Onboarding } | { status: "missing" } | { status: "error" };

/**
 * Cache-busted read that tells a missing record apart from a failed read. A
 * failed read must never be mistaken for "not onboarded": that is what sent
 * students who had already completed the form back to it.
 */
async function readOnboarding(uid: string): Promise<ReadResult> {
  try {
    const key = onboardingPath(uid).split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${PORTAL_BUCKET}/${key}?cb=${cacheBuster()}`, {
      cache: "no-store",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
    if (res.status === 404) return { status: "missing" };
    // Storage reports a missing object as 400 with a not-found body; any other
    // 400 (bad key, bad request) is a failure, not a missing record.
    if (res.status === 400) return /not.?found/i.test(await res.text().catch(() => "")) ? { status: "missing" } : { status: "error" };
    if (!res.ok) return { status: "error" };
    return { status: "found", doc: (await res.json()) as Onboarding };
  } catch {
    return { status: "error" };
  }
}

export async function getOnboarding(uid: string): Promise<Onboarding | null> {
  const r = await readOnboarding(uid);
  return r.status === "found" ? r.doc : null;
}

export async function saveOnboarding(uid: string, o: Onboarding): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const body = new Blob([JSON.stringify(o)], { type: "application/json" });
    const { error } = await supabase.storage
      .from(PORTAL_BUCKET)
      .upload(onboardingPath(uid), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Gate decision for the portal layout and the onboarding page. "unknown" means
 * storage could not be read; callers fail open, like the middleware does.
 */
export async function onboardingStatus(uid: string): Promise<"complete" | "incomplete" | "unknown"> {
  const r = await readOnboarding(uid);
  if (r.status === "error") return "unknown";
  return r.status === "found" && isOnboardingDocComplete(r.doc) ? "complete" : "incomplete";
}

/** True only when the record was read and is complete (jobs skip anyone else). */
export async function isOnboardingComplete(uid: string): Promise<boolean> {
  return (await onboardingStatus(uid)) === "complete";
}

/** All guardian emails on record for a student uid (used by the progress-email agent). */
export async function guardianEmails(uid: string): Promise<string[]> {
  const o = await getOnboarding(uid);
  if (!o) return [];
  return (o.guardians || []).map((g) => (g.email || "").trim()).filter((e) => EMAIL_RE.test(e));
}

/** Named contacts used to address each Saturday report personally. */
export async function guardianContacts(uid: string): Promise<{ name: string; email: string; phone: string; relationship: string }[]> {
  const o = await getOnboarding(uid);
  if (!o) return [];
  return (o.guardians || [])
    .filter((g) => EMAIL_RE.test((g.email || "").trim()))
    .map((g) => ({ name: (g.name || "Parent/Guardian").trim(), email: g.email.trim(), phone: (g.phone || "").trim(), relationship: (g.relationship || "Guardian").trim() }));
}
