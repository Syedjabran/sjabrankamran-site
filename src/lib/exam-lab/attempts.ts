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
};

export type Attempt = {
  ts: number;
  mode: "paper" | "drill";
  paperType: "P1" | "P2" | "P4" | "mixed";
  code?: string;
  ref?: string;
  score: number; // marks earned (scored questions)
  total: number; // marks available among scored questions
  qCount: number;
  scoredCount: number;
  durationSec?: number;
  questions: AttemptQuestion[];
  context?: AttemptContext; // integrity / mode metadata (optional)
};

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
