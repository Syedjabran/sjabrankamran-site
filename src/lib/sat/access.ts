// src/lib/sat/access.ts
//
// SERVER-ONLY. The SAT Lab is gated exactly like the physics tracks (spec 9):
// enrolment in a class whose year label names SAT grants it; staff always have it.
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isStaff, type PortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";

export async function satAccess(user: PortalUser): Promise<{ ok: boolean; isStaff: boolean }> {
  const access = await resolveCourseAccess(user);
  return { ok: access.isStaff || access.allowed.includes("SAT"), isStaff: access.isStaff };
}

/** Staff may open a student's sittings only for students in a class they can see. */
export async function canViewStudent(user: PortalUser, studentUid: string): Promise<boolean> {
  if (user.id === studentUid) return true;
  if (!isStaff(user.roles)) return false;
  if (isAdmin(user.roles)) return true;
  const classIds = new Set(await visibleClassIdsForUid(user.id, user.roles));
  if (!classIds.size) return false;
  const db = createAdminClient();
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", studentUid).maybeSingle();
  if (!student?.id) return false;
  const { data } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
  return (data ?? []).some((r) => classIds.has(r.class_id as string));
}
