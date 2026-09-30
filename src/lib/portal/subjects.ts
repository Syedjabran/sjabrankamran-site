/**
 * The subject registry. Pure and isomorphic (no server imports, no `@/`
 * alias) so plain Node tests and client components can import it.
 *
 * A subject is what an admin adds to a student account. `grant: "class"`
 * subjects come from class enrolment exactly as before (physics: the class
 * `year` label names the course); `grant: "direct"` subjects are switched on
 * per student by an admin and stored in subject-grants.ts. Adding a subject
 * later is one entry here, plus its own area of the portal.
 */
import type { Course } from "./course-labels.ts";

export type SubjectId = "physics" | "sat";

export interface SubjectDef {
  id: SubjectId;
  label: string;
  grant: "class" | "direct";
  courses: Course[];
  /** Where a student finishes setting the subject up, when it needs it. */
  setupPath?: string;
}

export const SUBJECTS: readonly SubjectDef[] = [
  { id: "physics", label: "Physics", grant: "class", courses: ["9702", "5054"] },
  { id: "sat", label: "Digital SAT", grant: "direct", courses: ["SAT"], setupPath: "/portal/sat-lab/setup" },
];

/** The registry entry for an id, or null for anything that isn't a subject. */
export function subjectOf(id: string): SubjectDef | null {
  return SUBJECTS.find((s) => s.id === id) ?? null;
}

/** The subjects an admin switches on per student (Digital SAT). */
export const DIRECT_SUBJECTS: readonly SubjectDef[] = SUBJECTS.filter((s) => s.grant === "direct");

/** The registry entry for a direct-grant subject id; null for a
 *  class-granted subject, an unknown id or a non-string. */
export function directSubjectOf(id: unknown): SubjectDef | null {
  const subject = typeof id === "string" ? subjectOf(id) : null;
  return subject?.grant === "direct" ? subject : null;
}

const labels = (grant: SubjectDef["grant"]) => SUBJECTS.filter((s) => s.grant === grant).map((s) => s.label).join(", ");

/** The plain sentence for a request naming anything but a direct subject. */
export const DIRECT_SUBJECT_ONLY = `Only ${labels("direct")} can be added directly; ${labels("class")} comes from class enrolment.`;

/** The courses a student's direct grants open, in registry order. Only
 *  direct-grant subjects count: a class-granted subject (physics) never
 *  becomes a course from a grant record. */
export function coursesFromGrants(grants: Partial<Record<SubjectId, unknown>>): Course[] {
  const courses: Course[] = [];
  for (const subject of SUBJECTS) {
    if (subject.grant !== "direct" || !grants[subject.id]) continue;
    for (const course of subject.courses) if (!courses.includes(course)) courses.push(course);
  }
  return courses;
}
