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
import { getRegistry } from "@/lib/portal/institutions";

const BUCKET = "portal-data";
const keyFor = (uid: string) => `staff-schools/${uid}.json`;

export type StaffSchool = { school: string; updated_at: string; by: string };
export type StaffScope = { school: string; classIds: string[] };

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

/**
 * Active class assignments for a scoped staff account. Staff reuse the existing
 * enrolment relation, but their role keeps them out of student rosters.
 */
export async function getStaffClassIds(uid: string): Promise<string[]> {
  try {
    const db = createAdminClient();
    const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (!student?.id) return [];
    const { data } = await db
      .from("edu_enrolments")
      .select("class_id")
      .eq("student_id", student.id)
      .eq("status", "active");
    return [...new Set((data || []).map((r) => r.class_id as string).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Default-deny scope: both a school pin and at least one class are required. */
export async function getStaffScope(uid: string): Promise<StaffScope | null> {
  const [school, classIds, registry] = await Promise.all([getStaffSchool(uid), getStaffClassIds(uid), getRegistry()]);
  if (!school) return null;
  const validIds = new Set(registry.classes.filter((c) => c.school === school).map((c) => c.id));
  const scopedClassIds = classIds.filter((id) => validIds.has(id));
  return scopedClassIds.length ? { school, classIds: scopedClassIds } : null;
}
