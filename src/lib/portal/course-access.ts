/**
 * Course-access guardrail.
 *
 * A student may only ever reach the awarding-body course(s) they are
 * enrolled into: an A Level (9702) student can never open the O Level (5054)
 * platform and vice-versa, and a portal user with no course enrolment can
 * access no course at all. A student enrolled in more than one course (e.g.
 * SAT alongside physics) is granted all of them -- `allowed` no longer
 * collapses to a single value, though `primary` keeps the existing
 * precedence for callers that want one course to show first. Exam-lab staff
 * (teacher/coordinator/facilitator/admin) teach across all tracks, so they
 * keep full access to all three.
 *
 * The student's course(s) are derived from the `year` of their active class
 * enrolment(s) — the same signal study-plan's courseStage already uses — so no
 * new data model is required; assigning a student to an SAT or O-Level class
 * in the registry is what grants (and limits) their access.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistry } from "@/lib/portal/institutions";
import { isExamLabStaff, type PortalUser } from "@/lib/edu/auth";
import { courseFromYear, COURSE_LABEL, type Course } from "@/lib/portal/course-labels";

export type { Course };
export { courseFromYear, COURSE_LABEL };

/** Every awarding-body course a student is actively enrolled into, keyed off
 * class `year` labels, or null when the student has no active enrolment at
 * all. Shared by `studentCourse` and `studentCourses` so the enrolment
 * lookup lives in exactly one place.
 */
async function enrolledCourses(uid: string): Promise<Set<Course> | null> {
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
    // unrecognised label. Only a student with NO active enrolment gets null
    // (checked above, before this default applies).
    if (courses.size === 0) courses.add("9702");
    return courses;
  } catch {
    return null;
  }
}

/** The single awarding-body course a student is enrolled into, or null. */
export async function studentCourse(uid: string): Promise<Course | null> {
  const courses = await enrolledCourses(uid);
  if (!courses) return null;
  // O-Level precedence when a student is (unusually) in both, matching
  // courseStage. SAT is primary only when it is the student's only course --
  // an SAT student who is also enrolled in physics still opens physics first.
  if (courses.has("5054")) return "5054";
  if (courses.has("9702")) return "9702";
  return "SAT";
}

/** Every awarding-body course this student is enrolled into.
 *
 * An SAT student is very often also a physics student, so course access can
 * no longer collapse to one value without locking them out of a platform
 * they are enrolled in. `studentCourse` keeps returning the single primary
 * for callers that want one.
 */
export async function studentCourses(uid: string): Promise<Course[]> {
  const courses = await enrolledCourses(uid);
  return courses ? [...courses] : [];
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
 * - Exam-lab staff: all tracks, switchable.
 * - Student: every course they are enrolled into; `primary` is the existing
 *   precedence (5054 > 9702 > SAT); `locked` when only one course applies.
 * - Anyone else (e.g. parent): no course access.
 */
export async function resolveCourseAccess(user: PortalUser): Promise<CourseAccess> {
  if (isExamLabStaff(user.roles)) {
    return { allowed: ["9702", "5054", "SAT"], primary: "9702", locked: false, isStaff: true };
  }
  if (user.roles.includes("student")) {
    const courses = await studentCourses(user.id);
    const primary = await studentCourse(user.id);
    return { allowed: courses, primary, locked: courses.length <= 1, isStaff: false };
  }
  return { allowed: [], primary: null, locked: true, isStaff: false };
}
