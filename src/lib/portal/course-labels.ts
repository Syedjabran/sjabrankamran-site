/**
 * Pure, alias-free course label helpers.
 *
 * Split out of course-access.ts (which re-exports these) so plain Node can
 * import them without a bundler: course-access.ts pulls in `@/lib/...`
 * aliases that only the Next.js/tsconfig build resolves, which breaks
 * `node --experimental-strip-types` in scripts/test-sat-access.mjs.
 */
import { courseOf } from "./subjects.ts";

export type Course = "9702" | "5054" | "SAT";

/** The long-standing default course, A Level (9702): what an enrolment whose
 *  class names no course counts as (coursesForEnrolment), and the course a
 *  progress report falls back to (portal-emails.ts reportCourses). */
export const DEFAULT_COURSE: Course = "9702";

/** Map a class `year` label to an awarding-body course, or null if it names none. */
export function courseFromYear(year: string): Course | null {
  const y = (year || "").toUpperCase();
  if (y.includes("O LEVEL") || y.includes("O-LEVEL") || y.includes("OLEVEL") || y.includes("5054") || /^O[\s-]?\d/.test(y)) return "5054";
  // Word-boundary match: a bare substring test would route "Saturday Batch"
  // to the SAT platform.
  if (/\bSAT\b/.test(y) || y.includes("DIGITAL SAT")) return "SAT";
  if (
    y.includes("A LEVEL") || y.includes("A-LEVEL") || y.includes("9702") ||
    y === "AS" || y === "A2" || y.includes("YEAR 1") || y.includes("YEAR 2")
  ) return "9702";
  return null;
}

/**
 * Every course a student's active enrolments grant: each enrolled class
 * whose registry `year` names a course adds it, in registry order.
 *
 * An enrolment whose class names no course (an unrecognised year label, or
 * a class missing from the registry) falls back to A Level (9702) -- the
 * long-standing default, so a real enrolment is never locked out over a
 * label -- unless a physics course (9702 or 5054) is already recognised.
 * An SAT class does not count as physics here: a student in an SAT class
 * and an unrecognised physics class keeps the 9702 access they had before
 * SAT classes existed. A student whose only classes are recognised SAT
 * classes gets SAT alone.
 *
 * `directCourses` are the courses the student's direct subject grants open
 * (subjects.ts `coursesFromGrants`); they are added after the class-derived
 * ones. The default stays class-based and a grant never switches it off --
 * adding SAT never removes physics. With no classes at all, 9702 applies
 * only when there are no grants either, so an SAT-only account created
 * through subjects gets no physics. (course-access.ts never asks about a
 * student with neither classes nor grants: that student has no course.)
 */
export function coursesForEnrolment(
  enrolledClassIds: ReadonlySet<string>, classes: readonly { id: string; year: string }[],
  { directCourses = [] }: { directCourses?: readonly Course[] } = {},
): Set<Course> {
  const courses = new Set<Course>();
  const recognised = new Set<string>();
  for (const c of classes) {
    if (!enrolledClassIds.has(c.id)) continue;
    const course = courseFromYear(c.year);
    if (!course) continue;
    courses.add(course);
    recognised.add(c.id);
  }
  const unrecognised = [...enrolledClassIds].some((id) => !recognised.has(id));
  const noClasses = enrolledClassIds.size === 0;
  const physics = courses.has("9702") || courses.has("5054");
  if ((unrecognised && !physics) || (noClasses && !directCourses.length)) courses.add(DEFAULT_COURSE);
  for (const course of directCourses) courses.add(course);
  return courses;
}

/** The courses a new student's welcome email is written for: their class's
 *  (`classId`, placed by the registry `classes`) and their direct grants', as
 *  course access counts them; none with neither -- course access gives such
 *  a student no course. */
export function welcomeCourses(
  classId: string | null, classes: readonly { id: string; year: string }[], directCourses: readonly Course[],
): Course[] {
  if (!classId && !directCourses.length) return [];
  return [...coursesForEnrolment(new Set(classId ? [classId] : []), classes, { directCourses })];
}

/** The course to show first: O Level precedence when a student is
 *  (unusually) in both physics courses, matching courseStage; SAT only when
 *  it is the student's only course. null for no enrolment at all. */
export function primaryCourse(courses: ReadonlySet<Course> | null): Course | null {
  if (!courses) return null;
  if (courses.has("5054")) return "5054";
  if (courses.has("9702")) return "9702";
  return "SAT";
}

/** A student's course access from their enrolled courses (null = no active
 *  enrolment): everything enrolled is allowed, `primary` shows first, and a
 *  single-course student cannot switch. */
export function studentCourseAccess(courses: ReadonlySet<Course> | null): { allowed: Course[]; primary: Course | null; locked: boolean } {
  const allowed = courses ? [...courses] : [];
  return { allowed, primary: primaryCourse(courses), locked: allowed.length <= 1 };
}

/** Each course's full name, from the subject registry (subjects.ts COURSES). */
const courseLabel = (id: Course) => courseOf(id)?.label ?? id;

export const COURSE_LABEL: Record<Course, string> = {
  "9702": courseLabel("9702"),
  "5054": courseLabel("5054"),
  "SAT": courseLabel("SAT"),
};
