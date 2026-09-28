/**
 * Attempt persistence for the Exam Lab analytics dashboard. SERVER-ONLY.
 * Stored as one JSON doc per user in the private 'exam-data' bucket
 * (service-role access) — no schema migration required.
 */
import { gradedCount, listAllocations, recordGraded, type ExamAllocation } from "./allocations";
import { allocationSubmissions, holdingIds, studentAttemptView } from "./answer-rules";
import { readFreshJson, writeFreshJson } from "./storage-fresh";

export type AttemptQuestion = {
  id: string;
  topic: string | null;
  level: "LOT" | "HOT";
  paperType: "P1" | "P2" | "P4";
  marks: number;
  earned: number | null; // null = attempted, not auto/AI-scored
  correct: boolean | null; // MCQ only; null = left blank (or not an MCQ)
  spentSec?: number | null; // actual time on this question (viewport-timed)
  expectedSec?: number; // recommended time (paper + difficulty)
  /** The submitted response, retained so the learner can review this script. */
  response?: string | null;
  feedback?: string | null;
  /** SERVER-SET: held back when submitted (in one of the student's open
   *  tests or no-help assignments) -- stored with no answer, no correctness
   *  and no marks, and left out of every score, record and analytics figure,
   *  so a practice paper can't be used to check a held question's answer. */
  held?: true;
  /** SERVER-SET, allocation attempts only: the ids of the student's OTHER
   *  allocations that held this question when it was graded. It is graded and
   *  kept like the rest (staff see it all); the student is shown no
   *  correctness, marks, feedback or mark scheme for it while one of them
   *  still holds it (answer-rules.ts studentAttemptView). */
  withheldFor?: string[];
  /** Student view only (never stored): the result is withheld for now. */
  resultPending?: true;
};

/**
 * Integrity context for an attempt (optional; absent on legacy/practice rows).
 *  - integrity: which guard mode the attempt ran under.
 *  - kind:      practice (self-chosen) | assignment | test.
 *  - help:      whether help (mark scheme / Maxwell) was permitted.
 *  - revealsUsed: how many times the student revealed a mark scheme.
 *  - proctored: camera proctor was active.
 *  - cancelled / lockedReason: terminal integrity failure.
 *  - flags:     count of non-terminal integrity events logged.
 */
export type AttemptContext = {
  integrity: "off" | "standard" | "strict";
  kind: "practice" | "assignment" | "test";
  help: boolean;
  revealsUsed: number;
  proctored: boolean;
  cancelled: boolean;
  lockedReason?: string | null;
  flags: number;
  allocationId?: string | null;
  attemptId?: string | null;
  /** Total seconds the clock was frozen by a staff pause (audit trail). */
  pausedSec?: number;
  /** True when the student continued past the countdown (never blocked). */
  late?: boolean;
  /** "late attempt" (practice) | "late submission" (daily task). */
  lateKind?: string;
  /** SERVER-SET scoring-integrity flag: "unattempted" | "late attempt" | "late submission". */
  status?: string;
  /** Client nonce for one submission; a retried POST with the same value is stored once. */
  submissionId?: string;
  /** SERVER-SET: the sitting (answer-rules.ts SittingToken.sid) this attempt
   *  submitted -- what /api/exam-lab/review finds it by. */
  sittingId?: string;
};

export type Attempt = {
  /** Stable, shareable-in-the-portal identifier for the review HTML page. */
  id: string;
  ts: number;
  mode: "paper" | "drill";
  paperType: "P1" | "P2" | "P4" | "mixed";
  code?: string;
  ref?: string;
  score: number; // marks earned (scored questions)
  total: number; // marks available among scored questions
  qCount: number;
  scoredCount: number;
  /** SERVER-COMPUTED (attempt route): questions with a real answer recorded.
   *  Zero = entirely blank submission → status "unattempted", zero credit.
   *  Absent on legacy rows — consumers fall back to deriving it. */
  attemptedCount?: number;
  durationSec?: number;
  questions: AttemptQuestion[];
  context?: AttemptContext; // integrity / mode metadata (optional)
};

/** True when an attempt contains at least one genuinely attempted question.
 *  A cancelled / locked sitting stays on record but never counts. */
export function isGenuineAttempt(at: Attempt): boolean {
  if (at.context?.cancelled) return false;
  if (typeof at.attemptedCount === "number") return at.attemptedCount > 0;
  // Legacy rows: derive from what was recorded.
  return at.questions.some((q) => (q.response && q.response.trim()) || q.correct !== null || q.earned !== null);
}

const BUCKET = "exam-data";
/** The attempt history keeps this many, newest last. */
export const MAX_ATTEMPTS = 800;

const docPath = (userId: string) => `${userId}.json`;

/** The user's attempts, read fresh. THROWS when the doc exists but could not be
 *  read, so callers that act on the result never mistake "unreadable" for "none". */
export async function getAttemptsStrict(userId: string): Promise<Attempt[]> {
  const r = await readFreshJson<{ attempts?: unknown }>(BUCKET, docPath(userId));
  if (!r.ok) throw new Error("Could not read attempts.");
  return Array.isArray(r.data?.attempts) ? (r.data.attempts as Attempt[]) : [];
}

/** Display-only read: an unreadable doc shows as no attempts. */
export async function getAttempts(userId: string): Promise<Attempt[]> {
  try {
    return await getAttemptsStrict(userId);
  } catch {
    return [];
  }
}

/** An attempt as its STUDENT may see it (`pending`: questions whose result
 *  is withheld for now -- answer-rules.ts studentAttemptView). */
export type StudentAttempt = Attempt & { pending: number };

/** What the student sees of their attempts: a graded question another of
 *  their allocations still holds shows no correctness, marks or feedback,
 *  and its marks are out of the attempt's score. `allocs` null (they could
 *  not be read) withholds every such result. Every student-facing view of
 *  attempts goes through this; staff views read the stored attempts. */
export function studentAttempts(attempts: Attempt[], allocs: ExamAllocation[] | null, now = Date.now()): StudentAttempt[] {
  const holding = holdingIds(allocs, now);
  return attempts.map((a) => studentAttemptView(a, holding));
}

/** Display-only: the student's own attempts as they may see them. */
export async function getStudentAttempts(userId: string, now = Date.now()): Promise<StudentAttempt[]> {
  const [attempts, allocs] = await Promise.all([getAttempts(userId), listAllocations(userId).catch(() => null)]);
  return studentAttempts(attempts, allocs, now);
}

export async function appendAttempt(userId: string, attempt: Attempt): Promise<boolean> {
  const r = await appendAttemptChecked(userId, attempt, () => false);
  return r === "stored" || r === "duplicate";
}

/**
 * What an allocation's submission earns it on the allocation itself: "late"
 * or "unattempted" (no credit), from its last stored attempt. A sitting its
 * browser reported cancelled never counts as real work.
 */
export function submissionFlags(attempts: Attempt[], allocationId: string): { late?: boolean; unattempted?: boolean } {
  const linked = attempts.filter((a) => a.context?.allocationId === allocationId && !a.context?.cancelled);
  const last = linked[linked.length - 1];
  if (!last) return { unattempted: true };
  const attempted = typeof last.attemptedCount === "number"
    ? last.attemptedCount
    : last.questions.filter((q) => (q.response && q.response.trim()) || q.correct !== null || q.earned !== null).length;
  return attempted === 0 ? { unattempted: true } : last.context?.late ? { late: true } : {};
}

/**
 * Stores `attempt` unless it is a retry of one already stored ("duplicate",
 * same submission nonce) or `refuse(existing)` says the sitting it belongs to
 * already has its submission ("refused"). "failed": the history could not be
 * read or written, or `refuse` could not decide (it threw) -- nothing was
 * changed.
 */
export async function appendAttemptChecked(
  userId: string, attempt: Attempt, refuse: (existing: Attempt[]) => boolean | Promise<boolean>,
): Promise<"stored" | "duplicate" | "refused" | "failed"> {
  let existing: Attempt[];
  try {
    existing = await getAttemptsStrict(userId);
  } catch {
    // Never write after a failed read — that would replace the student's whole
    // history with this one attempt. The runner keeps it and offers a retry.
    return "failed";
  }
  const nonce = attempt.context?.submissionId;
  if (nonce && existing.some((a) => a.context?.submissionId === nonce)) return "duplicate"; // retried POST
  let refused: boolean;
  try {
    refused = await refuse(existing);
  } catch {
    return "failed";
  }
  if (refused) return "refused";
  const next = [...existing, attempt];
  // Keep the most recent 800 attempts. An allocation attempt about to be
  // trimmed is first made sure of in its allocation's durable record
  // (allocations.ts gradedCount): trimming never frees a graded submission.
  // The record is brought up to the submissions ALREADY stored (`existing`),
  // never the incoming one: it isn't stored until the write below succeeds,
  // and if that write fails, a record counting it would use up a re-sit that
  // was never stored. The attempt route records the incoming submission once
  // it is stored.
  const dropped = next.slice(0, Math.max(0, next.length - MAX_ATTEMPTS));
  const allocIds = new Set(dropped.map((a) => a.context?.allocationId).filter((id): id is string => !!id));
  try {
    for (const id of allocIds) {
      const n = allocationSubmissions(existing, id);
      if ((await gradedCount(userId, id)) < n && !(await recordGraded(userId, id, n, { backfill: true }))) return "failed";
    }
  } catch {
    return "failed";
  }
  return (await writeFreshJson(BUCKET, docPath(userId), { attempts: next.slice(-MAX_ATTEMPTS) })) ? "stored" : "failed";
}
