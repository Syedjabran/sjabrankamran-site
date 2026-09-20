/**
 * Attempt persistence for the Exam Lab analytics dashboard. SERVER-ONLY.
 * Stored as one JSON doc per user in the private 'exam-data' bucket
 * (service-role access) — no schema migration required.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type AttemptQuestion = {
  id: string;
  topic: string | null;
  level: "LOT" | "HOT";
  paperType: "P1" | "P2" | "P4";
  marks: number;
  earned: number | null; // null = attempted, not auto/AI-scored
  correct: boolean | null; // MCQ only
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

/** True when an attempt contains at least one genuinely attempted question. */
export function isGenuineAttempt(at: Attempt): boolean {
  if (typeof at.attemptedCount === "number") return at.attemptedCount > 0;
  // Legacy rows: derive from what was recorded.
  return at.questions.some((q) => (q.response && q.response.trim()) || q.correct !== null || q.earned !== null);
}

const BUCKET = "exam-data";

export async function getAttempts(userId: string): Promise<Attempt[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(`${userId}.json`);
    if (error || !data) return [];
    const txt = await data.text();
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed?.attempts) ? parsed.attempts : [];
  } catch {
    return [];
  }
}

export async function appendAttempt(userId: string, attempt: Attempt): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const existing = await getAttempts(userId);
    existing.push(attempt);
    // keep the most recent 800 attempts
    const trimmed = existing.slice(-800);
    const body = new Blob([JSON.stringify({ attempts: trimmed })], { type: "application/json" });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${userId}.json`, body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch {
    return false;
  }
}
