// Tests for the pure analytics engine: recency-weighted mastery (Beta(2,2)
// prior), section/difficulty accuracy, pacing, weak-skill priority ranking
// and score history. Each scenario below is computed in isolation (its own
// computeAnalytics call) so unrelated items never merge into the same
// domain/skill row.
import assert from "node:assert/strict";
import {
  analyticsItemsFromDoc, computeAnalytics, docsToLoad, finishedItemsCache, hasFinishedWork, historyOf, sittingScores,
} from "../src/lib/sat/analytics.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 1); // 2026-10-01T00:00:00Z

function item(overrides) {
  return {
    qid: "q",
    section: "math",
    domain: null,
    skill: null,
    difficulty: null,
    correct: true,
    at: NOW,
    source: "drill",
    ...overrides,
  };
}

// --- 1: one correct algebra item today -> domain mastery = prior 3/5 = 0.6, confidence = 1
{
  const items = [item({ qid: "a1", domain: "algebra", skill: "Linear Equations", difficulty: "M", correct: true, at: NOW })];
  const result = computeAnalytics(items, [], NOW);
  const algebra = result.domains.find((d) => d.key === "algebra");
  assert.ok(algebra, "algebra domain row missing");
  assert.equal(algebra.mastery, 0.6, "algebra domain mastery");
  assert.equal(algebra.confidence, 1, "algebra domain confidence");
}

// --- 2: 10 correct items 28 days ago (w = 0.25 each) + 0 recent -> mastery ~= 0.6923
{
  const at = NOW - 28 * DAY;
  const items = Array.from({ length: 10 }, (_, i) =>
    item({ qid: `b${i}`, domain: "advanced-math", skill: "Nonlinear Functions", difficulty: "H", correct: true, at }));
  const result = computeAnalytics(items, [], NOW);
  const skill = result.skills.find((s) => s.key === "nonlinear functions");
  assert.ok(skill, "nonlinear functions skill row missing");
  assert.equal(skill.mastery.toFixed(4), "0.6923", "recency-weighted mastery to 4dp");
}

// --- 3: skill spelling variants collapse into one row, label = most frequent spelling
{
  const items = [
    ...Array.from({ length: 3 }, (_, i) =>
      item({ qid: `c${i}`, section: "rw", domain: "information-ideas", skill: "Cross-Text Connections", difficulty: "M", correct: true, at: NOW })),
    item({ qid: "c3", section: "rw", domain: "information-ideas", skill: "Cross-text Connections", difficulty: "M", correct: false, at: NOW }),
  ];
  const result = computeAnalytics(items, [], NOW);
  const rows = result.skills.filter((s) => s.key === "cross-text connections");
  assert.equal(rows.length, 1, "spelling variants must collapse into one skill row");
  assert.equal(rows[0].attempts, 4);
  assert.equal(rows[0].label, "Cross-Text Connections");
}

// --- 4: practice item (domain/skill null) counts in sections + totals, not in skills/domains
{
  const items = [item({ qid: "d1", section: "rw", domain: null, skill: null, difficulty: null, correct: true, at: NOW, source: "practice" })];
  const result = computeAnalytics(items, [], NOW);
  assert.equal(result.sections.rw.answered, 1);
  assert.equal(result.sections.rw.correct, 1);
  assert.equal(result.totals.answered, 1);
  assert.equal(result.totals.attempted, 1);
  assert.equal(result.totals.correct, 1);
  assert.equal(result.skills.length, 0, "practice item must not create a skill row");
  assert.equal(result.domains.filter((d) => d.attempts > 0).length, 0, "practice item must not add attempts to any domain row");
}

// --- 5: weakSkills ordering by priority = (1-mastery) * domainWeight * min(1, confidence/5)
{
  const items = [
    // algebra: mastery (2+2)/(4+6) = 0.4, confidence 6 -> priority .35*.6 = .21
    ...Array.from({ length: 6 }, (_, i) =>
      item({ qid: `e-alg-${i}`, domain: "algebra", skill: "Algebra Weak Skill", difficulty: "M", correct: i < 2, at: NOW })),
    // psda: mastery (2+1)/(4+6) = 0.3, confidence 6 -> priority .15*.7 = .105
    ...Array.from({ length: 6 }, (_, i) =>
      item({ qid: `e-psda-${i}`, domain: "psda", skill: "Psda Weak Skill", difficulty: "M", correct: i < 1, at: NOW })),
  ];
  const result = computeAnalytics(items, [], NOW);
  assert.equal(result.weakSkills.length, 2);
  assert.equal(result.weakSkills[0].key, "algebra weak skill");
  assert.equal(result.weakSkills[1].key, "psda weak skill");
  assert.ok(Math.abs(result.weakSkills[0].priority - 0.21) < 1e-9, `algebra priority ${result.weakSkills[0].priority}`);
  assert.ok(Math.abs(result.weakSkills[1].priority - 0.105) < 1e-9, `psda priority ${result.weakSkills[1].priority}`);
}

// --- 6: a skill with 2 attempts is "not enough data", not a weak skill
{
  const items = Array.from({ length: 2 }, (_, i) =>
    item({ qid: `f${i}`, domain: "geometry-trig", skill: "Circle Theorems", difficulty: "H", correct: false, at: NOW }));
  const result = computeAnalytics(items, [], NOW);
  assert.ok(result.notEnoughData.some((s) => s.key === "circle theorems" && s.attempts === 2));
  assert.ok(!result.weakSkills.some((s) => s.key === "circle theorems"));
}

// --- 7: pacing flag - 5 timed math items at 150s, all wrong, same skill
{
  const items = Array.from({ length: 5 }, (_, i) =>
    item({ qid: `g${i}`, domain: "advanced-math", skill: "Slow Skill", difficulty: "H", correct: false, at: NOW, timeMs: 150_000 }));
  const result = computeAnalytics(items, [], NOW);
  assert.equal(result.pacing.math.medianSec, 150);
  assert.equal(result.pacing.math.samples, 5);
  assert.equal(result.pacing.math.targetSec, 95);
  const flag = result.pacingFlags.find((f) => f.skill === "slow skill");
  assert.ok(flag, "expected a pacing flag for slow skill");
  assert.equal(flag.medianSec, 150);
}

// --- 8: trend - 4 wrong 20 days ago, 4 right today -> trend > 0
{
  const items = [
    ...Array.from({ length: 4 }, (_, i) =>
      item({ qid: `h-old-${i}`, domain: "algebra", skill: "Trend Skill", difficulty: "M", correct: false, at: NOW - 20 * DAY })),
    ...Array.from({ length: 4 }, (_, i) =>
      item({ qid: `h-new-${i}`, domain: "algebra", skill: "Trend Skill", difficulty: "M", correct: true, at: NOW })),
  ];
  const result = computeAnalytics(items, [], NOW);
  const skill = result.skills.find((s) => s.key === "trend skill");
  assert.ok(skill, "trend skill row missing");
  assert.ok(skill.trend > 0, `expected trend > 0, got ${skill.trend}`);
}

// --- 9: scores - latestOfficial = newest practice sitting with authority "official";
//        latestEstimate = newest adaptive sitting with authority "estimated"
{
  const sittings = [
    { id: "p1", kind: "practice", title: "Official Practice Test 3", finishedAt: NOW - 10 * DAY, score: { authority: "official", lower: 1000, upper: 1030, testNo: 3 } },
    { id: "p2", kind: "practice", title: "Official Practice Test 5", finishedAt: NOW - 3 * DAY, score: { authority: "official", lower: 1100, upper: 1130, testNo: 5 } },
    { id: "a1", kind: "adaptive", title: "Adaptive Mock 1", finishedAt: NOW - 8 * DAY, score: { authority: "estimated", lower: 1050, upper: 1080, basis: "adaptive routing" } },
    { id: "a2", kind: "adaptive", title: "Adaptive Mock 2", finishedAt: NOW - 1 * DAY, score: { authority: "estimated", lower: 1150, upper: 1180, basis: "adaptive routing" } },
  ];
  const result = computeAnalytics([], sittings, NOW);
  assert.equal(result.scores.latestOfficial?.id, "p2");
  assert.equal(result.scores.latestEstimate?.id, "a2");
  assert.equal(result.scores.history.length, 4);
}

// --- 10-14: analyticsItemsFromDoc -- finished items only, with an injected
// lookup (id -> labels + a grader), so no question bank is needed here.
const LABELS = {
  q1: { section: "math", domain: "algebra", skill: "Linear equations in one variable", difficulty: "E" },
  q2: { section: "math", domain: "algebra", skill: "Linear equations in one variable", difficulty: "M" },
  q3: { section: "math", domain: "psda", skill: "Percentages", difficulty: "H" },
  r1: { section: "rw", domain: "craft-structure", skill: "Words in Context", difficulty: "M" },
  r2: { section: "rw", domain: "craft-structure", skill: "Words in Context", difficulty: "H" },
  r3: { section: "rw", domain: "standard-english", skill: "Boundaries", difficulty: "M" },
  r4: { section: "rw", domain: "standard-english", skill: "Form, Structure, and Sense", difficulty: "E" },
  "pt4-rw-m1-q1": { section: "rw", domain: null, skill: null, difficulty: null },
  "pt4-rw-m1-q2": { section: "rw", domain: null, skill: null, difficulty: null },
};
// Every question's key is "A" in this fixture.
const lookup = (id) => (LABELS[id] ? { ...LABELS[id], correct: (response) => response === "A" } : null);

const T_CREATED = NOW - 3 * DAY;
const T_FINISHED = NOW - 2 * DAY;

function drill(overrides) {
  return {
    version: 1, id: "drill-1", uid: "u-analytics", kind: "drill", title: "Math drill", createdAt: T_CREATED,
    filter: {}, questionIds: ["q1", "q2", "q3"], answers: {}, checked: {}, finishedAt: null, assignmentId: null,
    ...overrides,
  };
}

function sitting(overrides) {
  return {
    version: 1, id: "sit-1", uid: "u-analytics", kind: "adaptive", title: "Adaptive mock exam", testNo: null,
    createdAt: T_CREATED, plan: {}, variants: {}, routed: {},
    minutes: { "rw.m1": 32, "rw.m2": 32, "math.m1": 35, "math.m2": 35 },
    current: 0, stageStartedAt: T_CREATED, breakUntil: null, answers: {}, flagged: [], results: {},
    score: null, scoreNote: null, finishedAt: null, assignmentId: null,
    ...overrides,
  };
}

// 10: a drill with 2 of 3 checked -> exactly those 2 items; correctness is the
//     RECORDED first answer (checked), not a re-grade of the stored response;
//     `at` = createdAt while unfinished; timeMs carried when present.
{
  const doc = drill({
    answers: { q1: "A", q2: "A" },
    checked: { q1: true, q2: false }, // q2's recorded first answer was wrong, whatever `answers` now says
    timeMs: { q1: 42_000 },
  });
  const items = analyticsItemsFromDoc(doc, lookup);
  assert.equal(items.length, 2, "only checked drill questions are items");
  const byId = Object.fromEntries(items.map((it) => [it.qid, it]));
  assert.ok(byId.q1 && byId.q2 && !byId.q3, "q1 and q2 only -- q3 was never checked");
  assert.equal(byId.q1.correct, true);
  assert.equal(byId.q2.correct, false, "a drill item's correctness is the recorded check result");
  assert.equal(byId.q1.source, "drill", "a drill without a purpose is a plain drill");
  assert.equal(byId.q1.at, T_CREATED, "an unfinished drill's items are dated at its creation");
  assert.equal(byId.q1.timeMs, 42_000);
  assert.equal(byId.q2.timeMs, undefined, "no time recorded -> no timeMs");
  assert.equal(byId.q1.domain, "algebra");
  assert.equal(byId.q1.skill, "Linear equations in one variable");
  assert.equal(byId.q1.difficulty, "E");
  assert.equal(byId.q3, undefined);
}

// 11: a finished challenge/diagnostic drill -> source follows the purpose, `at` = finishedAt.
{
  const all = { q1: true, q2: true, q3: false };
  const challenge = analyticsItemsFromDoc(drill({ purpose: "challenge", checked: all, finishedAt: T_FINISHED }), lookup);
  assert.equal(challenge.length, 3);
  assert.ok(challenge.every((it) => it.source === "challenge" && it.at === T_FINISHED), "challenge drill items");
  const diagnostic = analyticsItemsFromDoc(drill({ purpose: "diagnostic", checked: all, finishedAt: T_FINISHED }), lookup);
  assert.ok(diagnostic.every((it) => it.source === "diagnostic"), "diagnostic drill items");
  const plain = analyticsItemsFromDoc(drill({ purpose: "drill", checked: all, finishedAt: T_FINISHED }), lookup);
  assert.ok(plain.every((it) => it.source === "drill"), "an explicit purpose \"drill\" is a plain drill");
}

// 12: an adaptive sitting with rw.m1 submitted and rw.m2 running -> only rw.m1's
//     items (the running module's answers are not finished work), dated at
//     rw.m1's submission, graded through the lookup; a blank answer is wrong.
{
  const T_SUB = NOW - DAY;
  const doc = sitting({
    plan: { "rw.m1": ["r1", "r2", "r3"], "math.m1": ["q1"], "rw.m2": ["r4"] },
    routed: { rw: "upper" },
    current: 1,
    stageStartedAt: T_SUB,
    answers: { r1: "A", r2: "B", r4: "A" }, // r3 left blank; r4 is in the RUNNING module
    timeMs: { r1: 60_000, r4: 30_000 },
    results: { "rw.m1": { correct: 1, total: 3, answered: 2, overtime: false, submittedAt: T_SUB } },
  });
  const items = analyticsItemsFromDoc(doc, lookup);
  assert.deepEqual(items.map((it) => it.qid).sort(), ["r1", "r2", "r3"], "only the submitted module's questions");
  const byId = Object.fromEntries(items.map((it) => [it.qid, it]));
  assert.equal(byId.r1.correct, true);
  assert.equal(byId.r2.correct, false);
  assert.equal(byId.r3.correct, false, "an unanswered question in a submitted module counts as wrong");
  assert.ok(items.every((it) => it.at === T_SUB && it.source === "adaptive" && it.section === "rw"));
  assert.equal(byId.r1.timeMs, 60_000);
  // Final review M12: the blank is marked, the answered ones aren't.
  assert.equal(byId.r3.blank, true, "a blank is marked blank");
  assert.equal(byId.r1.blank, undefined);
  assert.equal(byId.r2.blank, undefined, "a wrong answer is still an answer");
}

// 12b (final review M12): "questions answered" leaves blanks out; accuracy
// doesn't change -- a blank still counts as wrong (attempted). A blank-
// submitted mock is never "98 questions answered".
{
  const T_SUB = NOW - DAY;
  const answered = sitting({
    plan: { "rw.m1": ["r1", "r2", "r3", "r4"] }, current: 4, stageStartedAt: null, finishedAt: T_SUB,
    answers: { r1: "A", r2: "B", r3: "   " }, // r3 whitespace only, r4 never touched: both blank
    results: { "rw.m1": { correct: 1, total: 4, answered: 2, overtime: false, submittedAt: T_SUB } },
  });
  const items = analyticsItemsFromDoc(answered, lookup);
  assert.deepEqual(items.filter((it) => it.blank).map((it) => it.qid).sort(), ["r3", "r4"]);
  const result = computeAnalytics(items, [], NOW);
  assert.equal(result.totals.answered, 2, "only the two answered questions");
  assert.equal(result.totals.attempted, 4, "every finished question is attempted");
  assert.equal(result.totals.correct, 1);
  assert.equal(result.totals.correct / result.totals.attempted, 0.25, "accuracy unchanged: the blanks count as wrong");
  assert.equal(result.sections.rw.accuracy, 0.25, "section accuracy unchanged");
  assert.deepEqual(result.totals.last7, { answered: 2, attempted: 4, correct: 1 });
  assert.deepEqual(result.totals.last30, { answered: 2, attempted: 4, correct: 1 });

  const allBlank = sitting({
    plan: { "rw.m1": ["r1", "r2", "r3"] }, current: 4, stageStartedAt: null, finishedAt: T_SUB, answers: {},
    results: { "rw.m1": { correct: 0, total: 3, answered: 0, overtime: false, submittedAt: T_SUB } },
  });
  const blank = computeAnalytics(analyticsItemsFromDoc(allBlank, lookup), [], NOW);
  assert.equal(blank.totals.answered, 0, "a blank-submitted module answers nothing");
  assert.equal(blank.totals.attempted, 3);

  // A checked drill question carries its recorded answer: answered.
  const checked = analyticsItemsFromDoc(drill({ answers: { q1: "B" }, checked: { q1: false } }), lookup);
  assert.equal(checked[0].blank, undefined);
}

// 13: practice-test items carry null domain/skill/difficulty; source "practice".
{
  const T_SUB = NOW - 5 * DAY;
  const doc = sitting({
    kind: "practice", title: "Official Practice Test 4", testNo: 4,
    plan: { "rw.m1": ["pt4-rw-m1-q1", "pt4-rw-m1-q2"] },
    current: 4, stageStartedAt: null, finishedAt: T_SUB,
    answers: { "pt4-rw-m1-q1": "A", "pt4-rw-m1-q2": "C" },
    results: { "rw.m1": { correct: 1, total: 2, answered: 2, overtime: false, submittedAt: T_SUB } },
  });
  const items = analyticsItemsFromDoc(doc, lookup);
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.equal(it.source, "practice");
    assert.equal(it.domain, null, "practice items carry no domain");
    assert.equal(it.skill, null, "practice items carry no skill");
    assert.equal(it.difficulty, null, "practice items carry no difficulty");
  }
  assert.deepEqual(items.map((it) => it.correct), [true, false]);
}

// 14: a question the lookup doesn't know (e.g. removed from the bank) is skipped.
{
  const items = analyticsItemsFromDoc(drill({ questionIds: ["q1", "gone"], checked: { q1: true, gone: true } }), lookup);
  assert.deepEqual(items.map((it) => it.qid), ["q1"]);
}

// 15: historyOf -- per question: how many times answered, and the latest outcome.
{
  const history = historyOf([
    item({ qid: "h1", correct: false, at: NOW - 10 * DAY }),
    item({ qid: "h1", correct: true, at: NOW - 1 * DAY }),
    item({ qid: "h2", correct: false, at: NOW - 4 * DAY }),
    item({ qid: "h1", correct: false, at: NOW - 20 * DAY }), // older, listed last: must not win
  ]);
  assert.equal(history.size, 2);
  assert.deepEqual(history.get("h1"), { lastAt: NOW - DAY, lastCorrect: true, times: 3 });
  assert.deepEqual(history.get("h2"), { lastAt: NOW - 4 * DAY, lastCorrect: false, times: 1 });
}

// --- 16-19: which docs a recompute reads (analytics-data.ts). The summary
// decides, so an unfinished sitting's submitted Module 1 is never loaded.
{
  const summary = (overrides) => ({ id: "x", kind: "drill", title: "t", createdAt: NOW, finishedAt: null, score: null, correct: 0, total: 0, assignmentId: null, overtime: false, ...overrides });
  // 16: unfinished adaptive (even with rw.m1 submitted -- the summary can't
  // tell, and must not) -> not loaded; finished -> loaded.
  assert.equal(hasFinishedWork(summary({ kind: "adaptive" })), false, "unfinished adaptive is not loaded");
  assert.equal(hasFinishedWork(summary({ kind: "practice", finishedAt: NOW })), true, "finished practice is loaded");
  // 17: unfinished drill with no checks -> not loaded; with checks -> loaded.
  assert.equal(hasFinishedWork(summary({ checkedCount: 0 })), false, "unfinished drill, nothing checked");
  assert.equal(hasFinishedWork(summary({ checkedCount: 2 })), true, "unfinished drill with checks");
  // 18: a legacy index entry (no checkedCount) can't say -> loaded.
  assert.equal(hasFinishedWork(summary({})), true, "legacy drill without checkedCount is loaded");
  assert.equal(hasFinishedWork(summary({ finishedAt: NOW, checkedCount: 0 })), true, "a finished drill is loaded");

  // 19: per-doc item cache -- finished docs whose items are cached are not
  // re-read; unfinished drills always are; only finished docs are cached.
  const list = [
    summary({ id: "fin-cached", kind: "practice", finishedAt: NOW }),
    summary({ id: "fin-new", kind: "adaptive", finishedAt: NOW }),
    summary({ id: "open-drill", checkedCount: 3 }),
    summary({ id: "open-sitting", kind: "adaptive" }),
    summary({ id: "fin-drill", finishedAt: NOW, checkedCount: 5 }),
  ];
  const cachedItems = { "fin-cached": [item({ qid: "c1" })], "open-drill": [item({ qid: "stale" })] };
  assert.deepEqual(docsToLoad(list, cachedItems), ["fin-new", "open-drill", "fin-drill"], "only new/changed docs are read");
  assert.deepEqual(docsToLoad(list, {}), ["fin-cached", "fin-new", "open-drill", "fin-drill"], "an empty cache reads everything with finished work");
  const all = new Map([
    ["fin-cached", cachedItems["fin-cached"]], ["fin-new", [item({ qid: "n1" })]], ["open-drill", [item({ qid: "o1" })]], ["fin-drill", []],
  ]);
  assert.deepEqual(Object.keys(finishedItemsCache(list, all)).sort(), ["fin-cached", "fin-drill", "fin-new"], "unfinished docs are never cached");

  // sittingScores: finished sittings only, drills never.
  const scores = sittingScores([
    summary({ id: "s1", kind: "practice", finishedAt: NOW, score: { lower: 1000, upper: 1060 } }),
    summary({ id: "s2", kind: "adaptive" }),
    summary({ id: "d1", finishedAt: NOW }),
  ]);
  assert.deepEqual(scores.map((s) => s.id), ["s1"]);
}

console.log("sat-analytics tests passed");
