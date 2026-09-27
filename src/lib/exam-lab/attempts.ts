/**
 * Attempt persistence for the Exam Lab analytics dashboard. SERVER-ONLY.
 * Stored as one JSON doc per user in the private 'exam-data' bucket
 * (service-role access) — no schema migration required.
 */
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
  /** SERVER-SET: a legacy randomised allocation sat from a browser that chose
   *  its own questions (a tab opened before specs were frozen on the server);
   *  they were checked against the spec's pool, then frozen. For staff audit. */
  browserChosenPaper?: boolean;
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

export async function appendAttempt(userId: string, attempt: Attempt): Promise<boolean> {
  const r = await appendAttemptChecked(userId, attempt, () => false);
  return r === "stored" || r === "duplicate";
}

/**
 * Stores `attempt` unless it is a retry of one already stored ("duplicate",
 * same submission nonce) or `refuse(existing)` says the sitting it belongs to
 * already has its submission ("refused"). "failed": the history could not be
 * read or written -- nothing was changed.
 */
export async function appendAttemptChecked(
  userId: string, attempt: Attempt, refuse: (existing: Attempt[]) => boolean,
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
  if (refuse(existing)) return "refused";
  existing.push(attempt);
  // keep the most recent 800 attempts
  return (await writeFreshJson(BUCKET, docPath(userId), { attempts: existing.slice(-800) })) ? "stored" : "failed";
}
