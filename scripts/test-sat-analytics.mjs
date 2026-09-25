// Tests for the pure analytics engine: recency-weighted mastery (Beta(2,2)
// prior), section/difficulty accuracy, pacing, weak-skill priority ranking
// and score history. Each scenario below is computed in isolation (its own
// computeAnalytics call) so unrelated items never merge into the same
// domain/skill row.
import assert from "node:assert/strict";
import { computeAnalytics } from "../src/lib/sat/analytics.ts";

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

console.log("sat-analytics tests passed");
