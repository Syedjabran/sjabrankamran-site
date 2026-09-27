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
  LAUNCHABLE_STATUSES, SITTING_MAX_AGE_MS, allocationQuestionIds, hasStarted, inPlayIds, isInPlay, pausedPaperTypes, revealScope, sittingTokenOk,
  type SittingToken,
} from "./answer-rules";
import {
  freezeAllocationIds, getAllocation, listAllocations, withFrozenSets, withProctorStatus, type AllocContent, type ExamAllocation,
} from "./allocations";
import { idsOfPaper, isSecureQuestion, practiceBank, questionById, safeQuestion } from "./bank-all";
import { IMAGE_BANK, type ImgQuestion } from "./image-bank";
import { examLabKey } from "./keys";
import type { ExamCourse, SafeQuestion } from "./paper-meta";
import { legacyDrillPick, pickPractice, practiceRefusal, type PracticeSpec } from "./practice-pools";
import { readReveals } from "./reveals";
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
  /** Help-allowed allocations only: the answers frozen by mark-scheme
   *  reveals in an earlier opening (qid -> answer), so the runner shows them
   *  locked again after a reload. */
  reveals?: Record<string, string>;
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

/** The caller's own sitting token, younger than `maxAgeMs` (a day by
 *  default; the attempt route accepts older ones) -- or null. */
export function readSitting(token: unknown, uid: string, now = Date.now(), maxAgeMs = SITTING_MAX_AGE_MS): SittingToken | null {
  const key = examLabKey("sitting");
  if (!key) return null;
  const t = verifyToken<SittingToken>(token, key);
  return sittingTokenOk(t, uid, now, maxAgeMs) ? t : null;
}

/** The student's allocations as the holds must see them: every legacy
 *  randomised item in play at one of `moments` carries the set it froze,
 *  even when a stale write dropped it from the doc (allocations.ts
 *  withFrozenSets). Throws when anything can't be read. */
async function holdingAllocations(uid: string, moments: number[], exceptAllocationId: string | null): Promise<ExamAllocation[]> {
  const allocs = await listAllocations(uid);
  return withFrozenSets(uid, allocs, (a) => a.id !== exceptAllocationId && moments.some((t) => isInPlay(a, t)));
}

/** Question ids held back from `uid` at any of `moments` (a past moment for
 *  a review or a submission: as of its sitting's opening): those of their
 *  open or upcoming tests and no-help assignments (optionally except one).
 *  One read of the allocations. Throws when they cannot be read -- callers
 *  refuse rather than guess. */
export async function heldIdsAt(uid: string, moments: number[], exceptAllocationId: string | null = null): Promise<Set<string>> {
  const allocs = await holdingAllocations(uid, moments, exceptAllocationId);
  const out = new Set<string>();
  for (const t of moments) for (const id of inPlayIds(allocs, t, idsOfPaper, exceptAllocationId)) out.add(id);
  return out;
}

/** Question ids held back from `uid` at `now` (see heldIdsAt). */
export async function heldIds(uid: string, now: number, exceptAllocationId: string | null = null): Promise<Set<string>> {
  return heldIdsAt(uid, [now], exceptAllocationId);
}

/** What a new practice sitting must keep from `uid` now: the held question
 *  ids, and per course the paper types whose whole papers are paused (a
 *  teacher-set whole-paper test in play). Throws when unreadable. */
export async function practiceHolds(uid: string, now: number): Promise<{ held: Set<string>; paused: Record<ExamCourse, Set<string>> }> {
  const allocs = await holdingAllocations(uid, [now], null);
  const held = inPlayIds(allocs, now, idsOfPaper);
  const paused: Record<ExamCourse, Set<string>> = { "9702": new Set(), "5054": new Set() };
  // Only PAST-paper questions can make a "whole paper": a staff-written
  // class test (the secure bank) is in no practice paper, so it pauses none.
  const pastPaper = (id: string) => (isSecureQuestion(id) ? undefined : questionById(id));
  for (const key of pausedPaperTypes(allocs, now, idsOfPaper, pastPaper)) {
    const [course, type] = key.split("|") as [ExamCourse, string];
    paused[course]?.add(type);
  }
  return { held, paused };
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
 * questions (empty for staff): never drawn into a drill; a whole paper
 * holding one opens, with those answers withheld. `paused` = this course's
 * paper types with a teacher-set whole-paper test in play: every whole paper
 * of such a type is refused with one refusal (practice-pools.ts
 * pickPractice). `mode` "test" (a proctored preview) is staff-only.
 */
export async function openPractice(
  uid: string, course: ExamCourse, spec: PracticeSpec, mode: SitMode, held: ReadonlySet<string>, paused: ReadonlySet<string> = new Set(),
): Promise<SittingResult> {
  const pick = pickPractice(spec, practiceBank(course), held, Math.random, paused);
  if (!pick.ok) {
    const r = practiceRefusal(pick.reason, spec.type);
    return refuse(r.status, r.error);
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
  const help = alloc.mode === "assignment_help";
  const token = issueSitting({ uid, ids: questions.map((q) => q.id), alloc: alloc.id, help, strict: allocStrict(alloc) });
  const result = await opened(questions, token, c);
  // A help-allowed assignment reopened after a reload: the answers its
  // earlier reveals froze come back, so the runner shows them locked.
  if (!result.ok || !help) return result;
  const scope = revealScope({ sid: "", alloc: alloc.id });
  const read = await readReveals(uid, scope, questions.filter((q) => q.ms_img).map((q) => q.id));
  if (read === null) return UNAVAILABLE;
  const reveals = Object.fromEntries(Object.entries(read).map(([qid, r]) => [qid, r.text]));
  return Object.keys(reveals).length ? { ...result, reveals } : result;
}

/** Signed URLs for question images of the sitting's own questions (the
 *  runner's top-up and its one retry of an image that failed to load). */
export async function sittingImages(t: SittingToken, paths: string[] | null, fresh: boolean): Promise<{ ok: true; urls: Record<string, string> } | { ok: false }> {
  const own = new Set(resolve(t.ids).map((q) => q.img));
  const want = (paths ?? [...own]).filter((p) => own.has(p));
  if (!want.length) return { ok: true, urls: {} };
  return imageUrls(want, { fresh });
}
