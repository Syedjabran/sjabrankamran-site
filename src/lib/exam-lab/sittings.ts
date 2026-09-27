// src/lib/exam-lab/sittings.ts
//
// SERVER-ONLY. Opening an Exam Lab sitting and checking what its later calls
// may do. The browser never selects questions from the bank or grades them:
// it asks for a sitting (a practice paper / drill / daily challenge / focus
// drill, or one of its allocations) and gets the questions in their
// client-safe shape (paper-meta.ts SafeQuestion), their signed images, and a
// signed sitting token (answer-rules.ts SittingToken) that every later call
// of that sitting -- images, mark scheme, Maxwell, the attempt, the review --
// carries.
import "server-only";
import { imageUrls, imagesOf } from "@/lib/sat/signed-images";
import { formatPk } from "@/lib/portal/pk-time";
import {
  LAUNCHABLE_STATUSES, allocationQuestionIds, hasStarted, inPlayIds, sittingTokenOk, type SittingToken,
} from "./answer-rules";
import { freezeAllocationIds, getAllocation, listAllocations, withProctorStatus, type AllocContent, type ExamAllocation } from "./allocations";
import { idsOfPaper, practiceBank, questionById, safeQuestion } from "./bank-all";
import { IMAGE_BANK, type ImgQuestion } from "./image-bank";
import { examLabKey } from "./keys";
import type { ExamCourse, SafeQuestion } from "./paper-meta";
import { legacyDrillPick, pickPractice, type PracticeSpec } from "./practice-pools";
import { newSealId, signToken, verifyToken } from "./seal";

export type SitMode = "practice" | "exam" | "test";

export type SittingOk = {
  ok: true;
  token: string;
  questions: SafeQuestion[];
  /** Signed URLs of the question images (never a mark scheme); may be
   *  partial when signing is slow -- the runner asks for the rest. */
  images: Record<string, string>;
  /** Allocations only: what was assigned, now that it has opened. */
  content?: AllocContent;
};
export type Refusal = { ok: false; status: number; error: string };
export type SittingResult = SittingOk | Refusal;

const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error });
export const UNAVAILABLE = refuse(503, "Exam Lab is temporarily unavailable. Please retry.");

/** A signed sitting token, or null when no signing key is configured. */
export function issueSitting(p: Omit<SittingToken, "v" | "sid" | "iat">, now = Date.now()): string | null {
  const key = examLabKey("sitting");
  if (!key) return null;
  const token: SittingToken = { v: 1, sid: newSealId(), iat: now, ...p };
  return signToken(token, key);
}

/** The caller's own, unexpired sitting token -- or null. */
export function readSitting(token: unknown, uid: string, now = Date.now()): SittingToken | null {
  const key = examLabKey("sitting");
  if (!key) return null;
  const t = verifyToken<SittingToken>(token, key);
  return sittingTokenOk(t, uid, now) ? t : null;
}

/** Question ids held back from `uid` right now: those of their open or
 *  upcoming tests and no-help assignments (optionally except one). Throws
 *  when the allocations cannot be read -- callers refuse rather than guess. */
export async function heldIds(uid: string, now: number, exceptAllocationId: string | null = null): Promise<Set<string>> {
  return inPlayIds(await listAllocations(uid), now, idsOfPaper, exceptAllocationId);
}

function resolve(ids: string[]): ImgQuestion[] {
  return ids.map((id) => questionById(id)).filter((q): q is ImgQuestion => !!q);
}

async function opened(questions: ImgQuestion[], token: string | null, content?: AllocContent): Promise<SittingResult> {
  if (!token) return UNAVAILABLE;
  const images = (await imagesOf(questions.map((q) => q.img))) ?? {};
  return { ok: true, token, questions: questions.map(safeQuestion), images, ...(content ? { content } : {}) };
}

/**
 * A self-serve practice sitting in `course`. `held` = the student's in-play
 * questions (empty for staff): never drawn, and a whole paper holding any of
 * them is not offered. `mode` "test" (a proctored preview) is staff-only.
 */
export async function openPractice(
  uid: string, course: ExamCourse, spec: PracticeSpec, mode: SitMode, held: ReadonlySet<string>,
): Promise<SittingResult> {
  const pick = pickPractice(spec, practiceBank(course), held, Math.random);
  if (!pick.ok) {
    return pick.reason === "unavailable"
      ? refuse(409, "This paper isn't available for practice right now. Try another paper.")
      : refuse(404, spec.type === "focus" ? "No practice questions are available for those topics yet." : "No questions match that choice yet. Widen the topics or levels.");
  }
  const questions = resolve(pick.ids);
  const token = issueSitting({ uid, ids: questions.map((q) => q.id), alloc: null, help: mode !== "test", strict: mode === "test" });
  return opened(questions, token);
}

/** The guard an allocation runs under (mirrors allocCfg in the hub). */
function allocStrict(a: ExamAllocation): boolean {
  return (a.integrity ?? (a.mode === "test" ? "strict" : a.mode === "assignment_nohelp" ? "standard" : "off")) === "strict";
}

/** One of the student's own allocations, once it has opened: its exact
 *  paper (a legacy randomised spec is frozen here, at the first open). */
export async function openAllocation(uid: string, allocationId: string, now = Date.now()): Promise<SittingResult> {
  let alloc: ExamAllocation | null;
  try {
    const stored = await getAllocation(uid, allocationId);
    alloc = stored ? await withProctorStatus(uid, stored) : null;
  } catch {
    return UNAVAILABLE;
  }
  if (!alloc) return refuse(404, "This assigned activity is no longer available. Ask your teacher to reassign it.");
  if (!hasStarted(alloc, now)) return refuse(403, `This activity opens ${formatPk(alloc.startsAt!)} (Pakistan time).`);
  if (alloc.status === "submitted") return refuse(409, "You have already submitted this activity.");
  if (alloc.status === "locked") return refuse(423, "This test is locked. Request a review from your teacher.");
  if (!LAUNCHABLE_STATUSES.includes(alloc.status)) return refuse(409, "This activity can't be opened right now.");

  const c = alloc.content;
  let questions: ImgQuestion[];
  if (c.type === "drill" || c.type === "daily") {
    let ids: string[] | null;
    try {
      ids = await freezeAllocationIds(uid, alloc.id, () => legacyDrillPick(c, IMAGE_BANK, Math.random));
    } catch {
      return UNAVAILABLE;
    }
    questions = resolve(ids ?? []);
    if (!questions.length) return refuse(404, `No questions are available for “${alloc.title}”. Contact the teacher.`);
  } else {
    const ids = allocationQuestionIds(alloc, idsOfPaper) ?? [];
    questions = resolve(ids);
    if (c.type === "drillref" && questions.length !== ids.length) {
      return refuse(409, "This stored drill has unavailable questions. Contact the teacher; no replacement paper has been generated.");
    }
    if (!questions.length) return refuse(404, `The questions for “${alloc.title}” are not available. Contact the teacher.`);
  }
  const token = issueSitting({
    uid, ids: questions.map((q) => q.id), alloc: alloc.id, help: alloc.mode === "assignment_help", strict: allocStrict(alloc),
  });
  return opened(questions, token, c);
}

/** Signed URLs for question images of the sitting's own questions (the
 *  runner's top-up and its one retry of an image that failed to load). */
export async function sittingImages(t: SittingToken, paths: string[] | null, fresh: boolean): Promise<{ ok: true; urls: Record<string, string> } | { ok: false }> {
  const own = new Set(resolve(t.ids).map((q) => q.img));
  const want = (paths ?? [...own]).filter((p) => own.has(p));
  if (!want.length) return { ok: true, urls: {} };
  return imageUrls(want, { fresh });
}
