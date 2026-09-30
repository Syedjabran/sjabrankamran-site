// src/lib/sat/coach/profile-store.ts
//
// SERVER-ONLY. One SAT profile per student at portal-data/sat/profile/<uid>.json.
// Reads fail closed (storage-fresh.ts): a failed or unreadable read throws
// and is never treated as "no profile" followed by a write.
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import type { PortalUser } from "@/lib/edu/auth";
import { satAccess } from "../access.ts";
import { profileInputSchema, type SATProfile } from "./profile.ts";

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const docPath = (uid: string) => `sat/profile/${uid}.json`;

const unreadable = () => new Error("The SAT profile couldn't be read.");
const isText = (v: unknown): v is string => typeof v === "string";

/** A stored doc as a profile: the profile rules without the date window
 *  (an exam date that has since passed still loads), plus its log fields. */
function asProfile(raw: unknown): SATProfile {
  const input = profileInputSchema.safeParse(raw);
  const doc = raw as Partial<SATProfile> | null;
  if (!input.success || !doc || !isText(doc.createdAt) || !isText(doc.updatedAt) || !Array.isArray(doc.changes)) throw unreadable();
  return { ...input.data, createdAt: doc.createdAt, updatedAt: doc.updatedAt, changes: doc.changes };
}

/** The student's profile, or null when they have none yet. Throws when it can't be read. */
export async function readProfile(uid: string): Promise<SATProfile | null> {
  if (!SAFE_UID.test(uid)) throw unreadable();
  const fresh = await readFreshJson<unknown>(BUCKET, docPath(uid));
  if (!fresh.ok) throw unreadable();
  return fresh.data == null ? null : asProfile(fresh.data);
}

export async function writeProfile(uid: string, p: SATProfile): Promise<boolean> {
  if (!SAFE_UID.test(uid)) return false;
  return writeFreshJson(BUCKET, docPath(uid), p);
}

/** Where a signed-in user stands with SAT setup: SAT not enabled, staff
 *  (who have no profile), a failed access or profile read, or a student
 *  with their profile (null = setup not done yet). */
export type OwnSatProfile =
  | { status: "no-access" }
  | { status: "staff" }
  | { status: "unavailable" }
  | { status: "student"; profile: SATProfile | null };

export async function ownSatProfile(user: PortalUser): Promise<OwnSatProfile> {
  let access;
  try {
    access = await satAccess(user);
  } catch {
    return { status: "unavailable" };
  }
  if (!access.ok) return { status: "no-access" };
  if (access.isStaff) return { status: "staff" };
  try {
    return { status: "student", profile: await readProfile(user.id) };
  } catch {
    return { status: "unavailable" };
  }
}
