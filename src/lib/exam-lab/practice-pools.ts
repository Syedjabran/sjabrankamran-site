// src/lib/exam-lab/practice-pools.ts
//
// Pure question selection for Exam Lab sittings, done on the server so the
// browser never needs the bank (Node-testable: the bank and the random
// source are parameters).
//
//  - pickPractice: a self-serve practice sitting (a whole paper, a topic
//    drill, the daily challenge, a focus drill). Questions held back for the
//    student (answer-rules.ts inPlayIds) are never drawn; a whole paper that
//    holds any of them is not offered.
//  - legacyDrillPick: freezes an allocation saved as a randomised spec
//    before drills were frozen at assignment time (its first open).

export type PoolQuestion = {
  id: string;
  paperType: "P1" | "P2" | "P4";
  code: string;
  qnum: number;
  topic: string | null;
  level: "LOT" | "HOT";
};

export type PracticeSpec =
  | { type: "paper"; code: string }
  | { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number }
  | { type: "daily" }
  | { type: "focus"; topics: string[] };

export const MAX_DRILL_QUESTIONS = 40;
export const DAILY_QUESTIONS = 10;
export const FOCUS_QUESTIONS = 10;

export type Rng = () => number;

function shuffled<T>(list: T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type PickResult = { ok: true; ids: string[] } | { ok: false; reason: "empty" | "paused" };

/**
 * `held`: the student's in-play questions (answer-rules.ts inPlayIds);
 * `paused`: the paper types of this course with a teacher-set whole-paper
 * test in play (answer-rules.ts pausedPaperTypes).
 *
 * WHOLE PAPERS of a paused type are refused, every one, with the same
 * refusal whichever paper is asked for: refusing only the test's own paper
 * would name it (its mark scheme is public). Any other whole paper opens,
 * held questions included -- their answers and mark schemes are withheld
 * while they are held (/review, /reveal, /mark).
 * DRILLS, the daily challenge and focus drills leave held questions out
 * silently.
 */
export function pickPractice(spec: PracticeSpec, bank: PoolQuestion[], held: ReadonlySet<string>, rng: Rng, paused: ReadonlySet<string> = new Set()): PickResult {
  if (spec.type === "paper") {
    const qs = bank.filter((q) => q.code === spec.code).sort((a, b) => a.qnum - b.qnum);
    if (!qs.length) return { ok: false, reason: "empty" };
    if (paused.has(qs[0].paperType)) return { ok: false, reason: "paused" };
    return { ok: true, ids: qs.map((q) => q.id) };
  }
  const open = bank.filter((q) => !held.has(q.id));
  let pool: PoolQuestion[];
  let count: number;
  if (spec.type === "drill") {
    const topics = new Set(spec.topics);
    const levels = new Set(spec.levels);
    pool = open.filter((q) => q.paperType === spec.paperType && (!topics.size || (!!q.topic && topics.has(q.topic))) && levels.has(q.level));
    count = Math.max(1, Math.min(MAX_DRILL_QUESTIONS, Math.floor(spec.count)));
  } else if (spec.type === "daily") {
    pool = open.filter((q) => q.paperType === "P1");
    count = DAILY_QUESTIONS;
  } else {
    const topics = new Set(spec.topics);
    pool = open.filter((q) => !!q.topic && topics.has(q.topic));
    count = FOCUS_QUESTIONS;
  }
  if (!pool.length) return { ok: false, reason: "empty" };
  return { ok: true, ids: shuffled(pool, rng).slice(0, count).map((q) => q.id) };
}

/** The one refusal a whole paper of a paused type gets: the same words and
 *  status for every paper of that type (it must not tell papers apart). */
export const PAPERS_PAUSED = "Full practice papers of this type are paused while you have a test of this type in progress — try a topic drill meanwhile.";

export function practiceRefusal(reason: "empty" | "paused", specType: PracticeSpec["type"]): { status: number; error: string } {
  if (reason === "paused") return { status: 409, error: PAPERS_PAUSED };
  if (specType === "focus") return { status: 404, error: "No practice questions are available for those topics yet." };
  if (specType === "paper") return { status: 404, error: "That paper isn't in the bank." };
  return { status: 404, error: "No questions match that choice yet. Widen the topics or levels." };
}

type LegacySpec = { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number } | { type: "daily" };

/** The pool a legacy randomised allocation spec draws from -- the same
 *  fallbacks the hub applied in the browser before (a retired topic label or
 *  an over-narrow level choice still yields a paper of the assigned type). */
function legacyPool(spec: LegacySpec, bank: PoolQuestion[]): PoolQuestion[] {
  if (spec.type === "daily") return bank.filter((q) => q.paperType === "P1");
  const topics = new Set(spec.topics);
  const levels = new Set(spec.levels);
  const ofPaper = bank.filter((q) => q.paperType === spec.paperType);
  const topicOk = (q: PoolQuestion) => !topics.size || (!!q.topic && topics.has(q.topic));
  const exact = ofPaper.filter((q) => topicOk(q) && levels.has(q.level));
  const topicAnyLevel = ofPaper.filter(topicOk);
  const paperAndLevel = ofPaper.filter((q) => levels.has(q.level));
  return exact.length ? exact : topicAnyLevel.length ? topicAnyLevel : paperAndLevel.length ? paperAndLevel : ofPaper;
}

function legacyCount(spec: LegacySpec): number {
  return spec.type === "daily" ? DAILY_QUESTIONS : Math.max(1, spec.count);
}

/** The questions a legacy randomised allocation spec resolves to, frozen on
 *  the server at the student's first open (sittings.ts openAllocation). */
export function legacyDrillPick(spec: LegacySpec, bank: PoolQuestion[], rng: Rng): string[] {
  return shuffled(legacyPool(spec, bank), rng).slice(0, legacyCount(spec)).map((q) => q.id);
}
