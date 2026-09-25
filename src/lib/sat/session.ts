// src/lib/sat/session.ts
//
// A sitting — adaptive mock or official practice test — as pure state
// transitions. Route handlers load a session, apply ONE transition with the
// server's clock, and save it. The browser never decides routing, timing or
// correctness: it only proposes answers.
import { BLUEPRINT } from "./forms.ts";
import { routeModule2 } from "./adaptive.ts";
import { isCorrect } from "./grade.ts";
import { practiceTestTitle } from "./client-types.ts";
import type { SATAnswer, SATForm, SATFormKey, SATPracticeTest, SATScore, SATSection } from "./types.ts";

export type SATStageKey = "rw.m1" | "rw.m2" | "math.m1" | "math.m2";
export const STAGES: SATStageKey[] = ["rw.m1", "rw.m2", "math.m1", "math.m2"];

/** Submissions up to this long after a module's deadline (a slow network, a
 *  suspended tab) are accepted normally; later ones are accepted and marked
 *  overtime. Nothing is ever rejected: the student's work is kept. */
export const GRACE_MS = 90_000;

/** A response is truncated to this many characters before it is stored — for
 *  both a module answer and a drill answer. */
export const MAX_RESPONSE_CHARS = 12;

export type StageResult = { correct: number; total: number; answered: number; overtime: boolean; submittedAt: number };

export type SATSession = {
  version: 1;
  id: string;
  uid: string;
  kind: "adaptive" | "practice";
  title: string;
  testNo: number | null;
  createdAt: number;
  /** Question ids per stage. An adaptive Module 2 is filled in at routing time. */
  plan: Partial<Record<SATStageKey, string[]>>;
  /** Adaptive only: both Module 2 variants, fixed when the form was assembled. */
  variants: Partial<Record<SATSection, { lower: string[]; upper: string[] }>>;
  routed: Partial<Record<SATSection, "lower" | "upper">>;
  minutes: Record<SATStageKey, number>;
  /** Index into STAGES; STAGES.length once finished. */
  current: number;
  /** When the current module's clock started; null during the break and once finished. */
  stageStartedAt: number | null;
  breakUntil: number | null;
  answers: Record<string, string>;
  flagged: string[];
  results: Partial<Record<SATStageKey, StageResult>>;
  score: SATScore | null;
  /** Why no score is shown, when score is null after finishing. */
  scoreNote: string | null;
  finishedAt: number | null;
  assignmentId: string | null;
};

type Ids = { id: string; uid: string; now: number; assignmentId?: string | null };

export const sectionOf = (k: SATStageKey): SATSection => (k.startsWith("rw") ? "rw" : "math");

/** Practice-test items have no College Board Question ID; their identity is their place in the paper. */
export function practiceQuestionId(testNo: number, section: SATSection, module: 1 | 2, qnum: number): string {
  return `pt${testNo}-${section}-m${module}-q${qnum}`;
}

function base(ids: Ids, kind: SATSession["kind"], title: string, testNo: number | null,
  plan: SATSession["plan"], variants: SATSession["variants"], minutes: SATSession["minutes"]): SATSession {
  return {
    version: 1, id: ids.id, uid: ids.uid, kind, title, testNo, createdAt: ids.now,
    plan, variants, routed: {}, minutes, current: 0, stageStartedAt: ids.now, breakUntil: null,
    answers: {}, flagged: [], results: {}, score: null, scoreNote: null, finishedAt: null,
    assignmentId: ids.assignmentId ?? null,
  };
}

export function startAdaptive(form: SATForm, ids: Ids): SATSession {
  const pick = (k: SATFormKey) => form.sets[k].map((q) => q.id);
  return base(ids, "adaptive", "Adaptive mock exam", null,
    { "rw.m1": pick("rw.m1"), "math.m1": pick("math.m1") },
    {
      rw: { lower: pick("rw.m2.lower"), upper: pick("rw.m2.upper") },
      math: { lower: pick("math.m2.lower"), upper: pick("math.m2.upper") },
    },
    { "rw.m1": BLUEPRINT.rw.minutes, "rw.m2": BLUEPRINT.rw.minutes, "math.m1": BLUEPRINT.math.minutes, "math.m2": BLUEPRINT.math.minutes });
}

export type TimedPracticeTest = SATPracticeTest & { minutes: Record<SATSection, [number, number]> };

export function startPractice(test: TimedPracticeTest, ids: Ids): SATSession {
  const plan: SATSession["plan"] = {};
  for (const k of STAGES) {
    const section = sectionOf(k);
    const module: 1 | 2 = k.endsWith("m1") ? 1 : 2;
    plan[k] = test.questions
      .filter((q) => q.section === section && q.module === module)
      .sort((a, b) => a.qnum - b.qnum)
      .map((q) => practiceQuestionId(test.testNo, section, module, q.qnum));
  }
  return base(ids, "practice", practiceTestTitle(test.testNo), test.testNo, plan, {}, {
    "rw.m1": test.minutes.rw[0], "rw.m2": test.minutes.rw[1],
    "math.m1": test.minutes.math[0], "math.m2": test.minutes.math[1],
  });
}

export function currentStage(s: SATSession): SATStageKey | null {
  return STAGES[s.current] ?? null;
}

export function stageDeadline(s: SATSession): number | null {
  const k = currentStage(s);
  return k && s.stageStartedAt !== null ? s.stageStartedAt + s.minutes[k] * 60_000 : null;
}

export function isOnBreak(s: SATSession): boolean {
  return currentStage(s) !== null && s.stageStartedAt === null;
}

/** Leave the break early and start the next module's clock now. */
export function beginStage(s: SATSession, now: number): SATSession {
  if (!isOnBreak(s)) return s;
  return { ...s, stageStartedAt: now, breakUntil: null };
}

/** A break that has run out started the next module when it ended — not when the student came back. */
export function settleBreak(s: SATSession, now: number): SATSession {
  if (!isOnBreak(s) || s.breakUntil === null || now < s.breakUntil) return s;
  return beginStage(s, s.breakUntil);
}

/** True when `stage` is not the module the session is currently sitting —
 *  either a stale/duplicate request naming a module already passed (or not
 *  yet reached), or a request arriving while the session is on a break or
 *  finished (both leave `stageStartedAt` null). The route layer answers 409
 *  with the current state rather than silently dropping the request. */
export function isStaleStage(s: SATSession, stage: SATStageKey): boolean {
  return stage !== currentStage(s) || s.stageStartedAt === null;
}

/** Keep only answers to the module being sat; a client cannot write into
 *  another module, and a stale request naming a module the session has
 *  already left (or not yet reached) is a no-op — same reference back. */
export function saveAnswers(
  s: SATSession, stage: SATStageKey, answers: Record<string, string>, flagged: string[],
): SATSession {
  if (isStaleStage(s, stage)) return s;
  const allowed = new Set(s.plan[stage] ?? []);
  const next = { ...s.answers };
  for (const [id, v] of Object.entries(answers)) {
    if (!allowed.has(id)) continue;
    if (typeof v === "string" && v.trim()) next[id] = v.trim().slice(0, MAX_RESPONSE_CHARS);
    else delete next[id];
  }
  return {
    ...s,
    answers: next,
    flagged: [...new Set([...s.flagged.filter((id) => !allowed.has(id)), ...flagged.filter((id) => allowed.has(id))])],
  };
}

export function submitStage(
  s: SATSession, stage: SATStageKey, answers: Record<string, string>, flagged: string[], now: number,
  answerOf: (id: string) => SATAnswer | null,
): SATSession {
  // Finished, on the break, or a stale/duplicate submit (double-click, a
  // retried fetch, a second tab) naming a module the session already left:
  // never score a different module than the one the client named.
  if (isStaleStage(s, stage)) return s;
  const k = stage;
  const saved = saveAnswers(s, stage, answers, flagged);
  const ids = saved.plan[k] ?? [];
  let correct = 0;
  let answered = 0;
  for (const id of ids) {
    const response = saved.answers[id];
    if (response) answered++;
    const key = answerOf(id);
    if (key && isCorrect(key, response)) correct++;
  }
  const deadline = saved.stageStartedAt! + saved.minutes[k] * 60_000;
  const out: SATSession = {
    ...saved,
    plan: { ...saved.plan },
    routed: { ...saved.routed },
    results: { ...saved.results, [k]: { correct, total: ids.length, answered, overtime: now > deadline + GRACE_MS, submittedAt: now } },
    current: s.current + 1,
  };
  const section = sectionOf(k);
  if (s.kind === "adaptive" && k.endsWith("m1")) {
    const route = routeModule2(section, correct);
    out.routed[section] = route;
    out.plan[section === "rw" ? "rw.m2" : "math.m2"] = saved.variants[section]?.[route] ?? [];
  }
  if (!STAGES[out.current]) {
    out.stageStartedAt = null;
    out.finishedAt = now;
  } else if (k === "rw.m2") {
    out.stageStartedAt = null;
    out.breakUntil = now + BLUEPRINT.breakMinutes * 60_000;
  } else {
    out.stageStartedAt = now;
  }
  return out;
}

export function rawBySection(s: SATSession): Record<SATSection, number> {
  const c = (k: SATStageKey) => s.results[k]?.correct ?? 0;
  return { rw: c("rw.m1") + c("rw.m2"), math: c("math.m1") + c("math.m2") };
}

export type DomainRow = { domain: string; correct: number; total: number };

/** Accuracy per College Board domain, in first-seen order. */
export function domainBreakdown(items: { domain: string; correct: boolean }[]): DomainRow[] {
  const rows = new Map<string, DomainRow>();
  for (const it of items) {
    const row = rows.get(it.domain) ?? { domain: it.domain, correct: 0, total: 0 };
    row.total++;
    if (it.correct) row.correct++;
    rows.set(it.domain, row);
  }
  return [...rows.values()];
}
