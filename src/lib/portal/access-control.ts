import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PortalUser } from "@/lib/edu/auth";
import { getStaffSchool } from "@/lib/portal/staff-school";
import { getRegistry } from "@/lib/portal/institutions";
import {
  ACCESS_CONTROL_BUCKET,
  ACCESS_CONTROL_PATH,
  classScopeKey,
  emptyAccessControl,
  findApplicableRestriction,
  isRestrictionActive,
  type AccessControlDocument,
  type AccessContext,
  type AccessRestriction,
} from "@/lib/portal/access-shared";

function normaliseDocument(value: unknown): AccessControlDocument {
  const raw = value as Partial<AccessControlDocument> | null;
  if (!raw || raw.version !== 1 || !Array.isArray(raw.restrictions)) return emptyAccessControl();
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    restrictions: raw.restrictions.filter((r): r is AccessRestriction => {
      if (!r || typeof r !== "object") return false;
      const x = r as AccessRestriction;
      return !!x.id && ["user", "school", "class", "group"].includes(x.scopeType)
        && ["locked", "suspended"].includes(x.mode) && typeof x.message === "string";
    }).map((r) => ({ ...r, classIds: Array.isArray(r.classIds) ? r.classIds : [] })),
  };
}

export async function getAccessControlDocument(strict = false): Promise<AccessControlDocument> {
  try {
    const { data, error } = await createAdminClient().storage
      .from(ACCESS_CONTROL_BUCKET)
      .download(ACCESS_CONTROL_PATH);
    if (error || !data) {
      const status = Number((error as { statusCode?: string | number } | null)?.statusCode || 0);
      const missing = [400, 404].includes(status) || /not found|does not exist/i.test(error?.message || "");
      if (strict && !missing) throw new Error(error?.message || "Could not read portal access controls.");
      return emptyAccessControl();
    }
    return normaliseDocument(JSON.parse(await data.text()));
  } catch (error) {
    if (strict) throw error;
    return emptyAccessControl();
  }
}

export async function saveAccessControlDocument(doc: AccessControlDocument): Promise<void> {
  const next: AccessControlDocument = {
    version: 1,
    updatedAt: new Date().toISOString(),
    restrictions: doc.restrictions.slice(-1000),
  };
  const body = new Blob([JSON.stringify(next)], { type: "application/json" });
  const { error } = await createAdminClient().storage
    .from(ACCESS_CONTROL_BUCKET)
    .upload(ACCESS_CONTROL_PATH, body, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });
  if (error) throw new Error(error.message || "Could not save portal access controls.");
}

export async function getAccessContext(user: PortalUser): Promise<AccessContext> {
  const db = createAdminClient();
  const [{ data: students }, { data: teachers }, { data: guardians }] = await Promise.all([
    db.from("edu_students")
      .select("id, school, edu_enrolments(class_id, status, edu_classes(room))")
      .eq("profile_id", user.id),
    db.from("edu_teachers")
      .select("id, edu_classes(id, room)")
      .eq("profile_id", user.id),
    db.from("edu_guardians")
      .select("id, edu_student_guardians(edu_students(school, edu_enrolments(class_id, status, edu_classes(room))))")
      .eq("profile_id", user.id),
  ]);

  type EnrolmentRow = { class_id: string; status: string; edu_classes?: { room?: string | null } | null };
  type StudentRow = {
    id: string;
    school: string | null;
    edu_enrolments?: EnrolmentRow[];
  };
  const rows = (students || []) as unknown as StudentRow[];
  const classIds = new Set<string>();
  const schools = new Set<string>();
  const absorbStudent = (student: StudentRow | null | undefined) => {
    if (!student) return;
    if (student.school?.trim()) schools.add(student.school.trim());
    for (const enrolment of student.edu_enrolments || []) {
      if (enrolment.status !== "active") continue;
      if (enrolment.class_id) classIds.add(enrolment.class_id);
      if (enrolment.edu_classes?.room?.trim()) schools.add(enrolment.edu_classes.room.trim());
    }
  };
  rows.forEach(absorbStudent);

  type TeacherRow = { edu_classes?: { id: string; room?: string | null }[] };
  for (const teacher of (teachers || []) as unknown as TeacherRow[]) {
    for (const cls of teacher.edu_classes || []) {
      if (cls.id) classIds.add(cls.id);
      if (cls.room?.trim()) schools.add(cls.room.trim());
    }
  }

  type GuardianRow = { edu_student_guardians?: { edu_students?: StudentRow | null }[] };
  for (const guardian of (guardians || []) as unknown as GuardianRow[]) {
    for (const link of guardian.edu_student_guardians || []) absorbStudent(link.edu_students);
  }

  // School-scoped staff may not have an edu_students.school value. Their
  // explicit staff-school pin must still inherit a school-wide restriction.
  const staffSchool = await getStaffSchool(user.id);
  if (staffSchool) schools.add(staffSchool);

  const registry = classIds.size ? await getRegistry() : null;
  const classKeys = [...new Set((registry?.classes || [])
    .filter((c) => classIds.has(c.id))
    .map((c) => classScopeKey(c.school, c.year)))];

  return { userId: user.id, roles: user.roles, classIds: [...classIds], classKeys, schools: [...schools] };
}

export async function getPortalRestriction(user: PortalUser): Promise<AccessRestriction | null> {
  if (user.roles.includes("super_admin")) return null;
  const doc = await getAccessControlDocument();
  if (!doc.restrictions.some((r) => isRestrictionActive(r))) return null;
  return findApplicableRestriction(doc, await getAccessContext(user));
}

export async function getDirectUserRestriction(userId: string): Promise<AccessRestriction | null> {
  const doc = await getAccessControlDocument();
  return doc.restrictions
    .filter((r) => r.scopeType === "user" && r.scopeKey === userId && isRestrictionActive(r))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
}

export async function releaseDirectUserRestrictions(userId: string, actorId: string): Promise<number> {
  const doc = await getAccessControlDocument(true);
  const now = new Date().toISOString();
  let count = 0;
  doc.restrictions = doc.restrictions.map((r) => {
    if (r.scopeType !== "user" || r.scopeKey !== userId || !isRestrictionActive(r)) return r;
    count++;
    return { ...r, releasedAt: now, releasedBy: actorId };
  });
  if (count) await saveAccessControlDocument(doc);
  return count;
}
