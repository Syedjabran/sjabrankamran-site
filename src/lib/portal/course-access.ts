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
import {
  courseFromYear, coursesForEnrolment, primaryCourse, studentCourseAccess, COURSE_LABEL, type Course,
} from "@/lib/portal/course-labels";

export type { Course };
export { courseFromYear, COURSE_LABEL };

/** `strict` (the SAT path): a failed read throws instead of reading as "no
 *  enrolment". Without it -- every physics / Exam Lab caller, unchanged --
 *  a failed read resolves to null, exactly as before. */
export type CourseAccessOptions = { strict?: boolean };

/** Every awarding-body course a student is actively enrolled into, keyed off
 * class `year` labels (see `coursesForEnrolment`), or null when the student
 * has no active enrolment at all. The one enrolment lookup behind
 * `studentCourse`, `studentCourses` and `resolveCourseAccess`.
 *
 * Strict: a Supabase query error throws, and so does an empty registry --
 * `getRegistry()` turns a failed storage read into an empty one, and a live
 * registry always has classes (the same rule /api/sat/results applies).
 * The SAT routes turn that throw into a retryable 503 rather than a 403.
 */
async function enrolledCourses(uid: string, { strict = false }: CourseAccessOptions = {}): Promise<Set<Course> | null> {
  try {
    const db = createAdminClient();
    const { data: student, error: studentError } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (strict && studentError) throw new Error(`The student lookup failed: ${studentError.message}`);
    if (!student?.id) return null;
    const { data: enrolments, error: enrolmentError } = await db
      .from("edu_enrolments")
      .select("class_id")
      .eq("student_id", student.id)
      .eq("status", "active");
    if (strict && enrolmentError) throw new Error(`The enrolment lookup failed: ${enrolmentError.message}`);
    const ids = new Set((enrolments || []).map((e) => e.class_id as string));
    if (!ids.size) return null;
    const registry = await getRegistry();
    if (strict && !registry.classes.length) throw new Error("The class registry couldn't be read.");
    return coursesForEnrolment(ids, registry.classes);
  } catch (e) {
    if (strict) throw e;
    return null;
  }
}

/** The single awarding-body course a student is enrolled into, or null. */
export async function studentCourse(uid: string): Promise<Course | null> {
  return primaryCourse(await enrolledCourses(uid));
}

/** Every awarding-body course this student is enrolled into.
 *
 * An SAT student is very often also a physics student, so course access can
 * no longer collapse to one value without locking them out of a platform
 * they are enrolled in. `studentCourse` keeps returning the single primary
 * for callers that want one.
 */
export async function studentCourses(uid: string): Promise<Course[]> {
  return studentCourseAccess(await enrolledCourses(uid)).allowed;
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
 *   One enrolment lookup serves all three.
 * - Anyone else (e.g. parent): no course access.
 */
export async function resolveCourseAccess(user: PortalUser, options: CourseAccessOptions = {}): Promise<CourseAccess> {
  if (isExamLabStaff(user.roles)) {
    return { allowed: ["9702", "5054", "SAT"], primary: "9702", locked: false, isStaff: true };
  }
  if (user.roles.includes("student")) {
    return { ...studentCourseAccess(await enrolledCourses(user.id, options)), isStaff: false };
  }
  return { allowed: [], primary: null, locked: true, isStaff: false };
}
