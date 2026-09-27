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

export type PickResult = { ok: true; ids: string[] } | { ok: false; reason: "empty" | "unavailable" };

export function pickPractice(spec: PracticeSpec, bank: PoolQuestion[], held: ReadonlySet<string>, rng: Rng): PickResult {
  if (spec.type === "paper") {
    const qs = bank.filter((q) => q.code === spec.code).sort((a, b) => a.qnum - b.qnum);
    if (!qs.length) return { ok: false, reason: "empty" };
    // A paper is sat whole or not at all: dropping held questions would both
    // break the paper and point at exactly which ones are held.
    if (qs.some((q) => held.has(q.id))) return { ok: false, reason: "unavailable" };
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

/** The questions a legacy randomised allocation spec resolves to -- the same
 *  fallbacks the hub applied in the browser before (a retired topic label or
 *  an over-narrow level choice still yields a paper of the assigned type). */
export function legacyDrillPick(
  spec: { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number } | { type: "daily" },
  bank: PoolQuestion[],
  rng: Rng,
): string[] {
  if (spec.type === "daily") return shuffled(bank.filter((q) => q.paperType === "P1"), rng).slice(0, DAILY_QUESTIONS).map((q) => q.id);
  const topics = new Set(spec.topics);
  const levels = new Set(spec.levels);
  const ofPaper = bank.filter((q) => q.paperType === spec.paperType);
  const topicOk = (q: PoolQuestion) => !topics.size || (!!q.topic && topics.has(q.topic));
  const exact = ofPaper.filter((q) => topicOk(q) && levels.has(q.level));
  const topicAnyLevel = ofPaper.filter(topicOk);
  const paperAndLevel = ofPaper.filter((q) => levels.has(q.level));
  const pool = exact.length ? exact : topicAnyLevel.length ? topicAnyLevel : paperAndLevel.length ? paperAndLevel : ofPaper;
  return shuffled(pool, rng).slice(0, Math.max(1, spec.count)).map((q) => q.id);
}
