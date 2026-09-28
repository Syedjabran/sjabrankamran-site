/**
 * Which subject and course the Exam Lab opens on. Pure (plain Node tests).
 *
 * The context is carried in the query string -- /portal/exam-lab?course=5054,
 * or ?subject=physics -- so every existing Exam Lab link (?allocation=,
 * ?focus=, ?run=1, the review page, emails, notifications and the mobile app)
 * keeps working unchanged, and a page that knows its subject can link
 * straight into it. Without a query the Exam Lab opens on the student's own
 * course, exactly as before. The query only ever chooses among courses the
 * user may already open: it never widens access (the sitting API re-checks
 * course access on every paper anyway).
 */
import type { Course } from "./course-labels.ts";
import {
  SUBJECTS, courseBoardLabel, courseOf, portalItem, practiceItemOf, subjectOf, type PortalItem, type SubjectDef,
} from "./subjects.ts";

/** The course access the page resolved (course-access.ts CourseAccess). */
export type ExamLabAccess = { allowed: readonly Course[]; primary: Course | null };

/** The Exam Lab query, as Next passes searchParams. */
export type ExamLabQuery = { subject?: string | string[]; course?: string | string[] };

export type ExamLabContext =
  /** Papers to show: `courses` are the subject's courses this user may open
   *  (course-choice order), `course` the one to open on; `choice` when there
   *  is more than one (staff) -- a one-course student never sees a choice. */
  | { kind: "papers"; subject: SubjectDef; courses: Course[]; course: Course; choice: boolean }
  /** No papers for this user, but their subjects practise elsewhere. */
  | { kind: "elsewhere"; places: { subject: SubjectDef; item: PortalItem }[] }
  /** No course at all. */
  | { kind: "none" };

/** The subjects whose Exam Lab has papers, in registry order. */
export const EXAM_LAB_SUBJECTS: readonly SubjectDef[] = SUBJECTS.filter((s) => s.examLab);

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** The subject's Exam Lab courses this user may open, in its own order. */
function openCourses(subject: SubjectDef, allowed: readonly Course[]): Course[] {
  return (subject.examLab?.courses ?? []).filter((c) => allowed.includes(c));
}

export function examLabContext(access: ExamLabAccess, query: ExamLabQuery = {}): ExamLabContext {
  const asked = one(query.course);
  const askedSubject = subjectOf(one(query.subject) ?? "");
  const openAll = EXAM_LAB_SUBJECTS
    .map((subject) => ({ subject, courses: openCourses(subject, access.allowed) }))
    .filter((c) => c.courses.length);
  // A subject named in the query narrows the choice to it when it has papers
  // this user may open; any other value (unknown, a subject without an Exam
  // Lab, or one they don't take) is ignored.
  const narrowed = openAll.filter((c) => c.subject.id === askedSubject?.id);
  const open = narrowed.length ? narrowed : openAll;

  if (open.length) {
    const has = (c: { courses: Course[] }, course: string | null | undefined) => !!course && c.courses.some((x) => x === course);
    // The course asked for, else the student's own (primary) course, else
    // the first subject with papers for them.
    const pick = open.find((c) => has(c, asked)) ?? open.find((c) => has(c, access.primary)) ?? open[0];
    const course = pick.courses.find((c) => c === asked) ?? pick.courses.find((c) => c === access.primary) ?? pick.courses[0];
    return { kind: "papers", subject: pick.subject, courses: pick.courses, course, choice: pick.courses.length > 1 };
  }

  // No papers: point each of the user's own subjects to where it practises.
  const places = SUBJECTS
    .filter((s) => s.courses.some((c) => access.allowed.includes(c)))
    .map((subject) => ({ subject, item: practiceItemOf(subject) }))
    .filter((p): p is { subject: SubjectDef; item: PortalItem } => !!p.item);
  return places.length ? { kind: "elsewhere", places } : { kind: "none" };
}

/**
 * How a user's Exam Lab work is named: "CAIE 5054" for an O Level student,
 * "CAIE 9702" for an A Level one (the course the Exam Lab opens on for them),
 * and the Exam Lab's own name when none of their courses has papers.
 */
export function examLabWorkLabel(access: ExamLabAccess): string {
  const context = examLabContext(access);
  const course = context.kind === "papers" ? courseOf(context.course) : null;
  return course ? courseBoardLabel(course) : portalItem("exam-lab").name;
}
