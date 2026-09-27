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

export type SubjectId = "physics" | "sat" | "practical-lab";

export interface SubjectDef {
  id: SubjectId;
  label: string;
  grant: "class" | "direct";
  /** The courses a grant opens. Empty for a tool that lives inside another
   *  subject: switching it on opens no course (no Exam Lab, no timetable). */
  courses: Course[];
  /** The subject whose space shows this one (Practical Lab lives inside Physics). */
  partOf?: SubjectId;
  /** Where a student finishes setting the subject up, when it needs it. */
  setupPath?: string;
}

export const SUBJECTS: readonly SubjectDef[] = [
  { id: "physics", label: "Physics", grant: "class", courses: ["9702", "5054"] },
  { id: "sat", label: "Digital SAT", grant: "direct", courses: ["SAT"], setupPath: "/portal/sat-lab/setup" },
  // The 9702 virtual practicals (public/lab). Switched on per student by an
  // admin, no teacher; shown inside Physics but never a physics course itself.
  { id: "practical-lab", label: "Practical Lab", grant: "direct", courses: [], partOf: "physics" },
];

/** The registry entry for an id, or null for anything that isn't a subject. */
export function subjectOf(id: string): SubjectDef | null {
  return SUBJECTS.find((s) => s.id === id) ?? null;
}

/** The label an admin reads next to a switch: "Practical Lab (Physics)" for a
 *  subject that lives inside another, the plain label otherwise. */
export function subjectSwitchLabel(subject: SubjectDef): string {
  const parent = subject.partOf ? subjectOf(subject.partOf) : null;
  return parent ? `${subject.label} (${parent.label})` : subject.label;
}

/** The subjects an admin switches on per student (Digital SAT, Practical Lab). */
export const DIRECT_SUBJECTS: readonly SubjectDef[] = SUBJECTS.filter((s) => s.grant === "direct");

/** The registry entry for a direct-grant subject id; null for a
 *  class-granted subject, an unknown id or a non-string. */
export function directSubjectOf(id: unknown): SubjectDef | null {
  const subject = typeof id === "string" ? subjectOf(id) : null;
  return subject?.grant === "direct" ? subject : null;
}

/** "A", "A and B", "A, B and C". */
function listed(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const labels = (grant: SubjectDef["grant"]) => listed(SUBJECTS.filter((s) => s.grant === grant).map((s) => s.label));

/** The plain sentence for a request naming anything but a direct subject. */
export const DIRECT_SUBJECT_ONLY = `Only ${labels("direct")} can be added directly; ${labels("class")} comes from class enrolment.`;

export type DirectGrant = { by: string; at: string };

/** Where a student's direct grants live in the portal-data bucket. */
export const grantsDocPath = (uid: string) => `subjects/${uid}.json`;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The well-formed direct grants in a stored subjects doc's `grants` field:
 *  only direct-grant subjects with a text `by` and `at` survive; anything
 *  else (a class subject, an unknown id, a malformed row) is dropped. The one
 *  rule behind subject-grants.ts and the middleware's /lab gate. */
export function directGrantsIn(stored: unknown): Partial<Record<SubjectId, DirectGrant>> {
  const grants: Partial<Record<SubjectId, DirectGrant>> = {};
  if (!isRecord(stored)) return grants;
  for (const subject of DIRECT_SUBJECTS) {
    const grant = stored[subject.id];
    if (isRecord(grant) && typeof grant.by === "string" && typeof grant.at === "string") {
      grants[subject.id] = { by: grant.by, at: grant.at };
    }
  }
  return grants;
}

/** The courses a student's direct grants open, in registry order. Only
 *  direct-grant subjects count: a class-granted subject (physics) never
 *  becomes a course from a grant record, and Practical Lab opens none. */
export function coursesFromGrants(grants: Partial<Record<SubjectId, unknown>>): Course[] {
  const courses: Course[] = [];
  for (const subject of SUBJECTS) {
    if (subject.grant !== "direct" || !grants[subject.id]) continue;
    for (const course of subject.courses) if (!courses.includes(course)) courses.push(course);
  }
  return courses;
}
