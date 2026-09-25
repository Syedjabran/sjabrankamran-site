/**
 * Pure, alias-free course label helpers.
 *
 * Split out of course-access.ts (which re-exports these) so plain Node can
 * import them without a bundler: course-access.ts pulls in `@/lib/...`
 * aliases that only the Next.js/tsconfig build resolves, which breaks
 * `node --experimental-strip-types` in scripts/test-sat-access.mjs.
 */

export type Course = "9702" | "5054" | "SAT";

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
 */
export function coursesForEnrolment(
  enrolledClassIds: ReadonlySet<string>, classes: readonly { id: string; year: string }[],
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
  if (unrecognised && !courses.has("9702") && !courses.has("5054")) courses.add("9702");
  return courses;
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

export const COURSE_LABEL: Record<Course, string> = {
  "9702": "Cambridge A Level Physics · 9702",
  "5054": "Cambridge O Level Physics · 5054",
  "SAT": "Digital SAT",
};
