/**
 * Every Exam Lab image question across both courses — Cambridge 9702 past
 * papers, the staff-written secure bank, and O Level 5054 — keyed by id.
 *
 * Resolve assigned, marked or re-scored questions through here. Looking ids up
 * in FULL_BANK alone (9702 + secure) silently rejects every O Level question,
 * which is why O Level drills could never be assigned or AI-marked.
 *
 * SERVER-ONLY: the entries carry answers and mark-scheme paths. `safeQuestion`
 * is the only shape of a question that may leave the server for a student.
 */
import "server-only";
import { FULL_BANK, IMAGE_BANK, SECURE_BANK, type ImgQuestion } from "./image-bank";
import { OLEVEL_IMAGE_BANK } from "./image-bank-olevel";
import type { ExamCourse, SafeQuestion } from "./paper-meta";

export type BankCourse = "9702" | "5054";

export const ALL_QUESTIONS: ImgQuestion[] = [...FULL_BANK, ...OLEVEL_IMAGE_BANK];

const BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));
const OLEVEL_IDS = new Set(OLEVEL_IMAGE_BANK.map((q) => q.id));
const SECURE_IDS = new Set(SECURE_BANK.map((q) => q.id));

export function questionById(id: string): ImgQuestion | undefined {
  return BY_ID.get(id);
}

export function courseOfQuestion(id: string): BankCourse | null {
  if (!BY_ID.has(id)) return null;
  return OLEVEL_IDS.has(id) ? "5054" : "9702";
}

/** A staff-written class-test question: reachable only through an allocation. */
export function isSecureQuestion(id: string): boolean {
  return SECURE_IDS.has(id);
}

/** The practice bank of one course (never the secure bank). */
export function practiceBank(course: ExamCourse): ImgQuestion[] {
  return course === "5054" ? OLEVEL_IMAGE_BANK : IMAGE_BANK;
}

const PAPER_IDS = new Map<string, string[]>();
for (const q of [...ALL_QUESTIONS].sort((a, b) => a.qnum - b.qnum)) {
  const list = PAPER_IDS.get(q.code);
  if (list) list.push(q.id);
  else PAPER_IDS.set(q.code, [q.id]);
}

/** A paper's question ids in question order ([] for an unknown code). */
export function idsOfPaper(code: string): string[] {
  return PAPER_IDS.get(code) ?? [];
}

/** A question as a student's browser may hold it: no answer, no mark-scheme path. */
export function safeQuestion(q: ImgQuestion): SafeQuestion {
  return {
    id: q.id, course: OLEVEL_IDS.has(q.id) ? "5054" : "9702", paperType: q.paperType, code: q.code, qnum: q.qnum,
    topic: q.topic, level: q.level, marks: q.marks, img: q.img, ref: q.ref, duration: q.duration, hasMs: !!q.ms_img,
  };
}
