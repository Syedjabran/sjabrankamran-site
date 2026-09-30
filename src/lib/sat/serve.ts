// src/lib/sat/serve.ts
//
// SERVER-ONLY. Owns the answer key: resolves any question id (bank or
// practice test) and turns sessions into what the browser may see. Nothing
// here is imported by client code — see client-types.ts.
import { loadQuestionBank, loadPracticeTests, practiceTest } from "./bank.ts";
import { ROUTING_DISCLOSURE } from "./adaptive.ts";
import { answerText, isCorrect } from "./grade.ts";
import { isCompleteTable, scoreEstimated, scoreOfficial } from "./scoring.ts";
import {
  STAGES, currentStage, domainBreakdown, isOnBreak, practiceQuestionId, rawBySection, sectionOf, stageDeadline,
  type SATSession, type SATStageKey, type StageResult,
} from "./session.ts";
import type { SATDrill } from "./drills.ts";
import { analyticsItemsFromDoc, type AnalyticsItem, type AnalyticsLookupEntry } from "./analytics.ts";
import type { PublicQuestion, ReviewItem, SATReport, SessionState, DrillState, SessionSummary } from "./client-types.ts";
import type { SATAnswer, SATDifficulty, SATSection } from "./types.ts";

type Entry = {
  id: string; img: string; answer: SATAnswer; section: SATSection;
  domain: string | null; skill: string | null; difficulty: SATDifficulty | null;
  rationale: string | null; rationaleImg: string | null;
};

let INDEX: Map<string, Entry> | null = null;

function index(): Map<string, Entry> {
  if (INDEX) return INDEX;
  const m = new Map<string, Entry>();
  for (const q of loadQuestionBank()) {
    m.set(q.id, {
      id: q.id, img: q.img, answer: q.answer, section: q.section, domain: q.domain, skill: q.skill,
      difficulty: q.difficulty, rationale: q.rationale || null, rationaleImg: q.rationaleImg ?? null,
    });
  }
  for (const t of loadPracticeTests()) {
    for (const q of t.questions) {
      const id = practiceQuestionId(t.testNo, q.section, q.module, q.qnum);
      m.set(id, { id, img: q.img, answer: q.answer, section: q.section, domain: null, skill: null, difficulty: null, rationale: null, rationaleImg: null });
    }
  }
  INDEX = m;
  return m;
}

export function answerOf(id: string): SATAnswer | null {
  return index().get(id)?.answer ?? null;
}

export function publicQuestion(id: string, n: number): PublicQuestion | null {
  const e = index().get(id);
  if (!e) return null;
  return { id, n, img: e.img, kind: e.answer.kind, section: e.section, domain: e.domain, skill: e.skill, difficulty: e.difficulty };
}

/** Labels + grader for one question id, for analytics (no answer text leaves
 *  here -- only a correct/incorrect verdict on a stored response). */
function analyticsLookup(id: string): AnalyticsLookupEntry | null {
  const e = index().get(id);
  if (!e) return null;
  return { section: e.section, domain: e.domain, skill: e.skill, difficulty: e.difficulty, correct: (response) => isCorrect(e.answer, response) };
}

/** A sitting's or drill's finished items for analytics (SAT Coach spec 7):
 *  checked drill questions and submitted modules only -- see
 *  analyticsItemsFromDoc. Practice-test items carry null labels. */
export function itemsOf(doc: SATSession | SATDrill): AnalyticsItem[] {
  return analyticsItemsFromDoc(doc, analyticsLookup);
}

export function reviewItem(id: string, n: number, response: string | null): ReviewItem | null {
  const e = index().get(id);
  const pub = publicQuestion(id, n);
  if (!e || !pub) return null;
  return { ...pub, response, correct: isCorrect(e.answer, response), answer: answerText(e.answer), rationale: e.rationale, rationaleImg: e.rationaleImg };
}

/** True once at least one official conversion table has been fully ingested
 *  — using scoring's own completeness rule (every raw score on the paper
 *  scale present) so "tables loaded" never disagrees with what scoreOfficial
 *  / scoreEstimated will actually use. */
export function hasConversionTables(): boolean {
  return loadPracticeTests().some((t) => isCompleteTable(t.conversion?.rw, "rw") && isCompleteTable(t.conversion?.math, "math"));
}

export function practiceTestList(): { testNo: number; questions: number; timed: boolean; minutes: { rw: [number, number]; math: [number, number] } | null }[] {
  return loadPracticeTests().map((t) => {
    const minutes = (t as typeof t & { minutes?: { rw: [number, number]; math: [number, number] } }).minutes ?? null;
    return { testNo: t.testNo, questions: t.questions.length, timed: !!minutes, minutes };
  });
}

const STAGE_LABEL: Record<SATStageKey, string> = {
  "rw.m1": "Reading and Writing · Module 1", "rw.m2": "Reading and Writing · Module 2",
  "math.m1": "Math · Module 1", "math.m2": "Math · Module 2",
};

/** Score a finished sitting. Official only from that test's own table (spec
 *  10.5) — a "practice" sitting is ALWAYS official-or-null-with-a-note, even
 *  in the (structurally possible but should-never-happen) case its testNo is
 *  null: it must never fall through to an adaptive-form estimate. */
export function finishSession(s: SATSession): SATSession {
  if (s.finishedAt === null || s.score) return s;
  const raw = rawBySection(s);
  if (s.kind === "practice") {
    const official = s.testNo !== null ? scoreOfficial(s.testNo, raw) : null;
    return official
      ? { ...s, score: official, scoreNote: null }
      : { ...s, score: null, scoreNote: "This test's official conversion table is not loaded, so no score can be given." };
  }
  if (!hasConversionTables()) {
    return { ...s, score: null, scoreNote: "Estimated scores appear once the official conversion tables are loaded." };
  }
  return { ...s, score: scoreEstimated(raw), scoreNote: null };
}

function report(s: SATSession): SATReport {
  const review: ReviewItem[] = [];
  for (const k of STAGES) {
    (s.plan[k] ?? []).forEach((id, i) => {
      const item = reviewItem(id, i + 1, s.answers[id] ?? null);
      if (item) review.push(item);
    });
  }
  const sections: SATReport["sections"] = { rw: { correct: 0, total: 0 }, math: { correct: 0, total: 0 } };
  for (const k of STAGES) {
    const r = s.results[k];
    if (!r) continue;
    sections[sectionOf(k)].correct += r.correct;
    sections[sectionOf(k)].total += r.total;
  }
  return {
    kind: s.kind, title: s.title, score: s.score, scoreNote: s.scoreNote, sections, routed: s.routed,
    routingDisclosure: s.kind === "adaptive" ? ROUTING_DISCLOSURE : null,
    overtime: STAGES.some((k) => s.results[k]?.overtime),
    domains: domainBreakdown(
      review
        .filter((r): r is ReviewItem & { domain: string } => r.domain !== null)
        .map((r) => ({ domain: r.domain, correct: r.correct })),
    ),
    review,
  };
}

export function sessionState(s: SATSession, now: number): SessionState {
  const k = currentStage(s);
  const base = { id: s.id, kind: s.kind, title: s.title, serverNow: now, answers: s.answers, flagged: s.flagged };
  if (!k) return { ...base, status: "finished", stage: null, breakUntil: null, report: report(s) };
  if (isOnBreak(s)) return { ...base, status: "break", stage: null, breakUntil: s.breakUntil, report: null };
  const ids = s.plan[k] ?? [];
  return {
    ...base, status: "running", breakUntil: null, report: null,
    stage: {
      key: k, label: STAGE_LABEL[k], index: s.current, minutes: s.minutes[k], deadline: stageDeadline(s)!,
      // Domain, skill and difficulty are all hidden while a module is
      // running: the real digital SAT shows none of them, and on Module 2
      // difficulty in particular would reveal which route (lower/upper) the
      // student was sent down. Drills (drillState, below) keep all three —
      // the student chose that filter themselves.
      questions: ids.map((id, i) => publicQuestion(id, i + 1))
        .filter((q): q is PublicQuestion => !!q)
        .map((q) => ({ ...q, domain: null, skill: null, difficulty: null })),
    },
  };
}

export function drillState(d: SATDrill, now: number): DrillState {
  const checked: DrillState["checked"] = {};
  d.questionIds.forEach((id, i) => {
    if (!(id in d.checked)) return;
    const item = reviewItem(id, i + 1, d.answers[id] ?? null);
    if (item) checked[id] = item;
  });
  return {
    id: d.id, kind: "drill", title: d.title, serverNow: now,
    questions: d.questionIds.map((id, i) => publicQuestion(id, i + 1)).filter((q): q is PublicQuestion => !!q),
    checked, finished: d.finishedAt !== null,
  };
}

/** `correct`/`total` are reported only once the doc is finished — 0/0 before.
 *  A mid-sitting Module 1 count would reveal an adaptive session's routing
 *  (and a mid-drill count is simply not a finished result yet either).
 *  A drill's `checkedCount` is its progress, not a result (the student sees
 *  each check's outcome as it happens), so it is shown throughout: it lets
 *  the analytics cache see an unfinished drill's new checks.
 *  `overtime` follows the same rule: set once a finished sitting has any
 *  module submitted past its limit, so the staff list can flag its score. */
export function summaryOf(doc: SATSession | SATDrill): SessionSummary {
  const finished = doc.finishedAt !== null;
  const plan = doc.planItemId ? { planItemId: doc.planItemId } : {};
  if (doc.kind === "drill") {
    const values = Object.values(doc.checked);
    return { id: doc.id, kind: "drill", ...(doc.purpose ? { purpose: doc.purpose } : {}), title: doc.title, createdAt: doc.createdAt, finishedAt: doc.finishedAt, score: null,
      correct: finished ? values.filter(Boolean).length : 0, total: finished ? doc.questionIds.length : 0, checkedCount: values.length,
      assignmentId: doc.assignmentId, overtime: false, ...plan };
  }
  const results = finished ? STAGES.map((k) => doc.results[k]).filter((r): r is StageResult => !!r) : [];
  return { id: doc.id, kind: doc.kind, title: doc.title, createdAt: doc.createdAt, finishedAt: doc.finishedAt, score: doc.score,
    correct: results.reduce((n, r) => n + r.correct, 0), total: results.reduce((n, r) => n + r.total, 0), assignmentId: doc.assignmentId,
    overtime: results.some((r) => r.overtime), ...plan, ...(doc.kind === "practice" && doc.testNo !== null ? { testNo: doc.testNo } : {}) };
}

/** How many entries a student's session index keeps. */
export const INDEX_CAP = 300;

/** The session index (newest first) within `cap` entries. Past the cap,
 *  entries go oldest first (by start), drills before unfinished sittings,
 *  and those before finished practice tests and adaptive mocks -- the score
 *  history and the record of practice tests taken, kept to the last. Each
 *  daily challenge is its own drill, so an everyday student reaches the cap
 *  within a year; before this, the oldest sittings dropped out. Order kept. */
export function trimIndex(items: SessionSummary[], cap: number = INDEX_CAP): SessionSummary[] {
  if (items.length <= cap) return items;
  const rank = (s: SessionSummary) => (s.kind === "drill" ? 0 : s.finishedAt === null ? 1 : 2);
  const dropOrder = items
    .map((s, i) => ({ i, rank: rank(s), createdAt: s.createdAt }))
    .sort((a, b) => a.rank - b.rank || a.createdAt - b.createdAt || b.i - a.i);
  const dropped = new Set(dropOrder.slice(0, items.length - cap).map((x) => x.i));
  return items.filter((_, i) => !dropped.has(i));
}

export { practiceTest };
