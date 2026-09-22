/**
 * Course-access guardrail.
 *
 * A student may only ever reach the awarding-body course they are enrolled
 * into: an A Level (9702) student can never open the O Level (5054) platform
 * and vice-versa, and a portal user with no course enrolment can access no
 * course at all. Exam-lab staff (teacher/coordinator/facilitator/admin) teach
 * across both, so they keep full access to both tracks.
 *
 * The student's course is derived from the `year` of their active class
 * enrolment(s) — the same signal study-plan's courseStage already uses — so no
 * new data model is required; assigning a student to an O-Level class in the
 * registry is what grants (and limits) their access.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistry } from "@/lib/portal/institutions";
import { isExamLabStaff, type PortalUser } from "@/lib/edu/auth";

export type Course = "9702" | "5054";

/** Map a class `year` label to an awarding-body course, or null if it names none. */
export function courseFromYear(year: string): Course | null {
  const y = (year || "").toUpperCase();
  if (y.includes("O LEVEL") || y.includes("O-LEVEL") || y.includes("OLEVEL") || y.includes("5054") || /^O[\s-]?\d/.test(y)) return "5054";
  if (
    y.includes("A LEVEL") || y.includes("A-LEVEL") || y.includes("9702") ||
    y === "AS" || y === "A2" || y.includes("YEAR 1") || y.includes("YEAR 2")
  ) return "9702";
  return null;
}

/** The single awarding-body course a student is enrolled into, or null. */
export async function studentCourse(uid: string): Promise<Course | null> {
  try {
    const db = createAdminClient();
    const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (!student?.id) return null;
    const { data: enrolments } = await db
      .from("edu_enrolments")
      .select("class_id")
      .eq("student_id", student.id)
      .eq("status", "active");
    const ids = new Set((enrolments || []).map((e) => e.class_id as string));
    if (!ids.size) return null;
    const registry = await getRegistry();
    const courses = new Set<Course>();
    for (const c of registry.classes) {
      if (!ids.has(c.id)) continue;
      const co = courseFromYear(c.year);
      if (co) courses.add(co);
    }
    // Enrolled but no class year names a course => default to A Level (9702),
    // the existing behaviour, so a real enrolment is never locked out over an
    // unrecognised label. Only a student with NO active enrolment gets null.
    if (courses.size === 0) return "9702";
    // O-Level precedence when a student is (unusually) in both, matching courseStage.
    if (courses.has("5054")) return "5054";
    return "9702";
  } catch {
    return null;
  }
}

export type CourseAccess = {
  /** Courses this user may open. Empty = no course access (hard gate). */
  allowed: Course[];
  /** The course to show first. */
  primary: Course | null;
  /** True when the user cannot switch course (a single-course student). */
  locked: boolean;
  isStaff: boolean;
};

/**
 * Resolve which course track(s) a portal user may access.
 * - Exam-lab staff: both tracks, switchable.
 * - Student: exactly their enrolled course, locked; none if unenrolled.
 * - Anyone else (e.g. parent): no course access.
 */
export async function resolveCourseAccess(user: PortalUser): Promise<CourseAccess> {
  if (isExamLabStaff(user.roles)) {
    return { allowed: ["9702", "5054"], primary: "9702", locked: false, isStaff: true };
  }
  if (user.roles.includes("student")) {
    const c = await studentCourse(user.id);
    return { allowed: c ? [c] : [], primary: c, locked: true, isStaff: false };
  }
  return { allowed: [], primary: null, locked: true, isStaff: false };
}

export const COURSE_LABEL: Record<Course, string> = {
  "9702": "Cambridge A Level Physics · 9702",
  "5054": "Cambridge O Level Physics · 5054",
};
