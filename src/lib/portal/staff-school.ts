/**
 * School assignment for school-scoped staff (coordinator / facilitator).
 * SERVER-ONLY, Storage-as-DB (no schema migration).
 *
 *   portal-data/staff-schools/<uid>.json  →  { school, updated_at, by }
 *
 * These roles belong to one school; the admin console shows a dropdown to pick
 * it. Stored separately from enrolments (which are student↔class links).
 */
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "portal-data";
const keyFor = (uid: string) => `staff-schools/${uid}.json`;

export type StaffSchool = { school: string; updated_at: string; by: string };

export async function getStaffSchool(uid: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().storage.from(BUCKET).download(keyFor(uid));
    if (error || !data) return null;
    const j = JSON.parse(await data.text()) as StaffSchool;
    return (j.school || "").trim() || null;
  } catch {
    return null;
  }
}

export async function setStaffSchool(uid: string, school: string, by: string): Promise<boolean> {
  try {
    const clean = (school || "").trim().slice(0, 160);
    const sb = createAdminClient();
    if (!clean) {
      // empty = clear the assignment
      await sb.storage.from(BUCKET).remove([keyFor(uid)]).catch(() => {});
      return true;
    }
    const body = new Blob([JSON.stringify({ school: clean, updated_at: new Date().toISOString(), by } as StaffSchool)], { type: "application/json" });
    const { error } = await sb.storage.from(BUCKET).upload(keyFor(uid), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch {
    return false;
  }
}
