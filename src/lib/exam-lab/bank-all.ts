/**
 * Every Exam Lab image question across both courses — Cambridge 9702 past
 * papers, the staff-written secure bank, and O Level 5054 — keyed by id.
 *
 * Resolve assigned, marked or re-scored questions through here. Looking ids up
 * in FULL_BANK alone (9702 + secure) silently rejects every O Level question,
 * which is why O Level drills could never be assigned or AI-marked.
 */
import { FULL_BANK, type ImgQuestion } from "./image-bank";
import { OLEVEL_IMAGE_BANK } from "./image-bank-olevel";

export type BankCourse = "9702" | "5054";

export const ALL_QUESTIONS: ImgQuestion[] = [...FULL_BANK, ...OLEVEL_IMAGE_BANK];

const BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));
const OLEVEL_IDS = new Set(OLEVEL_IMAGE_BANK.map((q) => q.id));

export function questionById(id: string): ImgQuestion | undefined {
  return BY_ID.get(id);
}

export function courseOfQuestion(id: string): BankCourse | null {
  if (!BY_ID.has(id)) return null;
  return OLEVEL_IDS.has(id) ? "5054" : "9702";
}
