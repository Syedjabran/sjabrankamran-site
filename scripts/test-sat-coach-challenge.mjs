// Tests for the pure challenge builder (src/lib/sat/coach/challenge-builder.ts)
// and weekly goals (src/lib/sat/coach/goals.ts): composition rounding,
// exclusion/recency/spaced-review rules, the no-analytics balanced fallback,
// and the deterministic goal computations.
import assert from "node:assert/strict";
import { buildChallenge } from "../src/lib/sat/coach/challenge-builder.ts";
import { weeklyGoals } from "../src/lib/sat/coach/goals.ts";
import { SAT_DOMAIN_IDS } from "../src/lib/sat/client-types.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 1); // 2026-10-01T00:00:00Z
const rngZero = () => 0; // always picks the first eligible candidate in a pool

function bankItem(id, section, domain, skill, difficulty) {
  return { id, section, domain, skill, difficulty };
}

function freshBank(prefix, section, domain, skill, difficulty, count) {
  return Array.from({ length: count }, (_, i) => bankItem(`${prefix}${i}`, section, domain, skill, difficulty));
}

function emptyAnalytics(overrides = {}) {
  return {
    generatedAt: NOW,
    totals: { answered: 0, correct: 0, last7: { answered: 0, correct: 0 }, last30: { answered: 0, correct: 0 } },
    sections: { rw: { answered: 0, correct: 0, accuracy: null }, math: { answered: 0, correct: 0, accuracy: null } },
    domains: [],
    skills: [],
    difficulty: {
      rw: { E: { answered: 0, correct: 0 }, M: { answered: 0, correct: 0 }, H: { answered: 0, correct: 0 } },
      math: { E: { answered: 0, correct: 0 }, M: { answered: 0, correct: 0 }, H: { answered: 0, correct: 0 } },
    },
    pacing: { rw: { medianSec: null, targetSec: 71, samples: 0 }, math: { medianSec: null, targetSec: 95, samples: 0 } },
    pacingFlags: [],
    weakSkills: [],
    notEnoughData: [],
    scores: { latestOfficial: null, latestEstimate: null, history: [] },
    ...overrides,
  };
}

// --- base fixture for the composition test: 3 fresh weak skills (M default,
// no prior attempts), one skill with 4 wrong-answered-8-days-ago questions
// (review), one more-improving skill than the weak ones (stretch).
function baseFixture() {
  const weakSkills = [
    { key: "alpha skill", label: "Alpha Skill", domain: "algebra", section: "math", mastery: 0.3, priority: 0.3 },
    { key: "beta skill", label: "Beta Skill", domain: "psda", section: "math", mastery: 0.35, priority: 0.25 },
    { key: "gamma skill", label: "Gamma Skill", domain: "information-ideas", section: "rw", mastery: 0.4, priority: 0.2 },
  ];
  const skills = [
    { key: "alpha skill", label: "Alpha Skill", section: "math", domain: "algebra", attempts: 0, correct: 0, mastery: 0.5, confidence: 0, trend: 0.05, lastAt: null },
    { key: "epsilon skill", label: "Epsilon Skill", section: "math", domain: "advanced-math", attempts: 0, correct: 0, mastery: 0.5, confidence: 0, trend: 0.3, lastAt: null },
  ];
  const analytics = emptyAnalytics({ weakSkills, skills });
  const bank = [
    ...freshBank("alpha", "math", "algebra", "Alpha Skill", "M", 4),
    ...freshBank("beta", "math", "psda", "Beta Skill", "M", 4),
    ...freshBank("gamma", "rw", "information-ideas", "Gamma Skill", "M", 4),
    ...freshBank("delta", "rw", "craft-structure", "Delta Skill", "M", 4),
    ...freshBank("epsilon", "math", "advanced-math", "Epsilon Skill", "M", 3),
  ];
  const history = new Map();
  for (let i = 0; i < 4; i++) history.set(`delta${i}`, { lastAt: NOW - 8 * DAY, lastCorrect: false, times: 1 });
  return { analytics, bank, history };
}

// --- 1: composition 9 weak / 4 review / 2 stretch, size 15
{
  const { analytics, bank, history } = baseFixture();
  const result = buildChallenge({ bank, analytics, history, size: 15, now: NOW, rng: rngZero, exclude: new Set() });
  assert.equal(result.ids.length, 15, "fills the full size");
  assert.equal(new Set(result.ids).size, 15, "no duplicate ids");
  const weakIds = result.ids.filter((id) => id.startsWith("alpha") || id.startsWith("beta") || id.startsWith("gamma"));
  const reviewIds = result.ids.filter((id) => id.startsWith("delta"));
  const stretchIds = result.ids.filter((id) => id.startsWith("epsilon"));
  assert.equal(weakIds.length, 9, "round(15*0.6) = 9 weak slots");
  assert.equal(reviewIds.length, 4, "round(15*0.25) = 4 review slots");
  assert.equal(stretchIds.length, 2, "the rest = 2 stretch slots");
  assert.deepEqual([...reviewIds].sort(), ["delta0", "delta1", "delta2", "delta3"], "all 4 wrong-8-days-ago questions are reviewed");
  assert.ok(result.focus.includes("Alpha Skill") && result.focus.includes("Beta Skill") && result.focus.includes("Gamma Skill"), "focus lists the weak skills");
  assert.ok(result.focus.includes("Epsilon Skill"), "focus lists the stretch skill");
}

// --- 2: a wrong answer 8 days ago appears in review (isolated check)
{
  const { analytics, bank, history } = baseFixture();
  const result = buildChallenge({ bank, analytics, history, size: 15, now: NOW, rng: rngZero, exclude: new Set() });
  assert.ok(result.ids.includes("delta0"), "a question answered wrong 8 days ago appears in review");
}

// --- 3: excluded ids never appear
{
  const { analytics, bank, history } = baseFixture();
  const result = buildChallenge({ bank, analytics, history, size: 15, now: NOW, rng: rngZero, exclude: new Set(["alpha0", "delta1"]) });
  assert.equal(result.ids.includes("alpha0"), false, "excluded weak-slot id never appears");
  assert.equal(result.ids.includes("delta1"), false, "excluded review id never appears");
  assert.equal(new Set(result.ids).size, result.ids.length, "still no duplicates once excluded ids are skipped");
}

// --- 4: a question answered correctly 10 days ago never appears. Both
// candidates are already "seen" (in history), so the "prefer never-seen"
// rule can't be what picks q-other -- only the 30-day recent-correct
// exclusion can.
{
  const bank = [bankItem("q-correct", "math", "algebra", "Any Skill", "M"), bankItem("q-other", "math", "algebra", "Any Skill", "M")];
  const history = new Map([
    ["q-correct", { lastAt: NOW - 10 * DAY, lastCorrect: true, times: 1 }],
    ["q-other", { lastAt: NOW - 2 * DAY, lastCorrect: false, times: 1 }],
  ]);
  const result = buildChallenge({ bank, analytics: null, history, size: 1, now: NOW, rng: rngZero, exclude: new Set() });
  assert.deepEqual(result.ids, ["q-other"], "a question correct 10 days ago is skipped in favour of an eligible seen question");
}

// --- 5: no analytics -> balanced across domains, medium, spread over >= 6
// domains for size 15
{
  const bank = SAT_DOMAIN_IDS.flatMap((domain, i) => [
    bankItem(`${domain}:0`, i < 4 ? "rw" : "math", domain, "Some Skill", "M"),
    bankItem(`${domain}:1`, i < 4 ? "rw" : "math", domain, "Some Skill", "M"),
  ]);
  const result = buildChallenge({ bank, analytics: null, history: new Map(), size: 15, now: NOW, rng: rngZero, exclude: new Set() });
  assert.equal(result.ids.length, 15);
  assert.deepEqual(result.focus, [], "no analytics -> no targeted focus");
  const domainsHit = new Set(result.ids.map((id) => id.split(":")[0]));
  assert.ok(domainsHit.size >= 6, `expected >= 6 domains, got ${domainsHit.size}`);
}

// --- 6: a shortfall (not enough weak-skill questions) is filled from the
// balanced domain pool rather than left short
{
  const analytics = emptyAnalytics({
    weakSkills: [{ key: "rare skill", label: "Rare Skill", domain: "algebra", section: "math", mastery: 0.2, priority: 0.5 }],
  });
  const bank = [
    bankItem("rare0", "math", "algebra", "Rare Skill", "M"),
    ...SAT_DOMAIN_IDS.flatMap((domain, i) => [bankItem(`fill-${domain}-0`, i < 4 ? "rw" : "math", domain, "Filler", "M")]),
  ];
  const result = buildChallenge({ bank, analytics, history: new Map(), size: 5, now: NOW, rng: rngZero, exclude: new Set() });
  assert.equal(result.ids.length, 5, "shortfall is filled to the requested size");
  assert.ok(result.ids.includes("rare0"), "the one available weak-skill question is still used");
}

// --- 7: review falls back to a never-practised (stale) skill when there
// are no wrong-answer candidates at all
{
  const analytics = emptyAnalytics(); // no weakSkills, no skills -> weak and stretch contribute nothing
  const bank = [
    ...freshBank("stale", "math", "geometry-trig", "Stale Skill", "M", 2),
    ...SAT_DOMAIN_IDS.map((domain, i) => bankItem(`fill${i}`, i < 4 ? "rw" : "math", domain, "Filler", "M")),
  ];
  const result = buildChallenge({ bank, analytics, history: new Map(), size: 4, now: NOW, rng: rngZero, exclude: new Set() });
  assert.equal(result.ids.length, 4, "the whole request is still filled");
  assert.ok(result.ids.includes("stale0"), "the review slot is filled from the never-practised skill");
}

// --- 8 (fix round 1 repro): a weak-slot question already re-asked once
// (times: 2) is never shown a third time, even as the only candidate
{
  const analytics = emptyAnalytics({
    weakSkills: [{ key: "alpha skill", label: "Alpha Skill", domain: "algebra", section: "math", mastery: 0.3, priority: 0.3 }],
  });
  const bank = [bankItem("alpha0", "math", "algebra", "Alpha Skill", "M")];
  const history = new Map([["alpha0", { lastAt: NOW - 8 * DAY, lastCorrect: false, times: 2 }]]);
  const result = buildChallenge({ bank, analytics, history, size: 1, now: NOW, rng: rngZero, exclude: new Set() });
  assert.deepEqual(result.ids, [], "a weak-slot candidate asked twice is never picked, even with no other candidate to fall back on");
}

// --- 9 (fix round 1 repro): same rule in the no-analytics balanced path
{
  const bank = [bankItem("q1", "math", "algebra", "Any Skill", "M")];
  const history = new Map([["q1", { lastAt: NOW - 8 * DAY, lastCorrect: false, times: 2 }]]);
  const result = buildChallenge({ bank, analytics: null, history, size: 1, now: NOW, rng: rngZero, exclude: new Set() });
  assert.deepEqual(result.ids, [], "the balanced-fill path never picks a question asked twice either");
}

// --- 10 (fix round 1): stretch shares the same rule. The stretch skill's
// only candidate at its computed difficulty has been asked twice; a second,
// unrelated (recently-correct, so itself never pickable) attempt exists
// only to push the skill's "best difficulty" up to the one the asked-twice
// item sits at.
{
  const analytics = emptyAnalytics({
    skills: [{ key: "epsilon skill", label: "Epsilon Skill", section: "math", domain: "advanced-math", attempts: 2, correct: 1, mastery: 0.5, confidence: 2, trend: 0.3, lastAt: NOW }],
  });
  const bank = [
    bankItem("epsilon-mastered", "math", "advanced-math", "Epsilon Skill", "M"),
    bankItem("epsilon-h-asked", "math", "advanced-math", "Epsilon Skill", "H"),
  ];
  const history = new Map([
    ["epsilon-mastered", { lastAt: NOW, lastCorrect: true, times: 1 }], // mastered at M -> stretch targets H
    ["epsilon-h-asked", { lastAt: NOW - 8 * DAY, lastCorrect: false, times: 2 }], // the only H candidate, already re-asked once
  ]);
  const result = buildChallenge({ bank, analytics, history, size: 4, now: NOW, rng: rngZero, exclude: new Set() });
  assert.equal(result.ids.includes("epsilon-h-asked"), false, "stretch never shows a question asked twice either");
  assert.deepEqual(result.ids, [], "no other candidate exists anywhere in the bank");
}

// --- 11 (fix round 1): shortfall fill respects the rule too, so a small
// pool yields a shorter challenge rather than a third showing (the ruling's
// stated consequence) -- one weak-skill question is used, and the only
// other bank question anywhere is asked twice, so the requested size 3
// comes back as 1
{
  const analytics = emptyAnalytics({
    weakSkills: [{ key: "solo skill", label: "Solo Skill", domain: "algebra", section: "math", mastery: 0.2, priority: 0.5 }],
  });
  const bank = [bankItem("solo0", "math", "algebra", "Solo Skill", "M"), bankItem("fill-asked", "math", "psda", "Filler", "M")];
  const history = new Map([["fill-asked", { lastAt: NOW - 3 * DAY, lastCorrect: false, times: 2 }]]);
  const result = buildChallenge({ bank, analytics, history, size: 3, now: NOW, rng: rngZero, exclude: new Set() });
  assert.deepEqual(result.ids, ["solo0"], "the shortfall fill has nowhere eligible to go, so the challenge comes back short rather than reusing 'fill-asked'");
}

console.log("sat-coach-challenge-builder tests passed");

// =============================================================================
// weeklyGoals
// =============================================================================

function planItem(overrides) {
  return { id: "p", date: "2026-10-06", kind: "challenge", status: "scheduled", ...overrides };
}

// --- 7: sessions progress 2/3 (a Tuesday `today`, week Mon 10-05 .. Sun 10-11)
{
  const weekItems = [
    planItem({ id: "c1", date: "2026-10-06", status: "done" }),
    planItem({ id: "c2", date: "2026-10-08", status: "late" }),
    planItem({ id: "c3", date: "2026-10-09", status: "scheduled" }),
  ];
  const goals = weeklyGoals({ analytics: null, weekItems, today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals.length, 1, "only the sessions goal applies with no analytics and no exam");
  assert.equal(goals[0].kind, "sessions");
  assert.equal(goals[0].title, "Finish this week's 3 practice sessions");
  assert.equal(goals[0].progress, 2 / 3, "2 of 3 done -> progress 2/3");
}

// --- 8: sessions counts "review" items too, and ignores items outside the
// Monday-start week
{
  const weekItems = [
    planItem({ id: "r1", date: "2026-10-05", kind: "review", status: "done" }),
    planItem({ id: "r2", date: "2026-10-11", kind: "review", status: "missed" }),
    planItem({ id: "out", date: "2026-10-12", kind: "review", status: "done" }), // next week -- excluded
  ];
  const goals = weeklyGoals({ analytics: null, weekItems, today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals[0].title, "Finish this week's 2 practice sessions", "the item dated outside the ISO week is excluded");
  assert.equal(goals[0].progress, 0.5);
}

// --- 9: no sessions this week -> no sessions goal
{
  const goals = weeklyGoals({ analytics: null, weekItems: [], today: "2026-10-07", targetScore: 1400 });
  assert.deepEqual(goals, []);
}

// --- 10: mastery goal detail text for mastery 0.58 -> "Lift <label> from 58% to 65%"
{
  const analytics = emptyAnalytics({ skills: [{ key: "reading inference", label: "Reading Inference", section: "rw", domain: "information-ideas", attempts: 5, correct: 3, mastery: 0.6, confidence: 4, trend: 0.02, lastAt: NOW }] });
  const goals = weeklyGoals({
    analytics,
    weekItems: [],
    today: "2026-10-07",
    targetScore: 1400,
    weakAtWeekStart: { key: "reading inference", label: "Reading Inference", mastery: 0.58 },
  });
  assert.equal(goals.length, 1);
  assert.equal(goals[0].kind, "mastery");
  assert.equal(goals[0].detail, "Lift Reading Inference from 58% to 65%");
}

// --- 11: mastery progress clamps to [0, 1] as current moves from start
{
  const baseline = { key: "s", label: "S", mastery: 0.5 };
  const below = weeklyGoals({ analytics: emptyAnalytics({ skills: [{ key: "s", label: "S", section: "rw", domain: "information-ideas", attempts: 1, correct: 0, mastery: 0.4, confidence: 1, trend: 0, lastAt: NOW }] }), weekItems: [], today: "2026-10-07", targetScore: 1400, weakAtWeekStart: baseline });
  assert.equal(below[0].progress, 0, "mastery dropping below start clamps to 0");
  const above = weeklyGoals({ analytics: emptyAnalytics({ skills: [{ key: "s", label: "S", section: "rw", domain: "information-ideas", attempts: 1, correct: 1, mastery: 0.9, confidence: 1, trend: 0, lastAt: NOW }] }), weekItems: [], today: "2026-10-07", targetScore: 1400, weakAtWeekStart: baseline });
  assert.equal(above[0].progress, 1, "mastery past the +0.07 target clamps to 1");
  const none = weeklyGoals({ analytics: emptyAnalytics(), weekItems: [], today: "2026-10-07", targetScore: 1400, weakAtWeekStart: null });
  assert.deepEqual(none, [], "no baseline -> no mastery goal");
}

// --- 12: exam goal title format, adaptive vs. practice test
{
  const weekItems = [planItem({ id: "m1", date: "2026-10-10", kind: "mock", status: "scheduled", mock: { kind: "practice", testNo: 6 } })];
  const goals = weeklyGoals({ analytics: null, weekItems, today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals[0].kind, "exam");
  assert.equal(goals[0].title, "Sit Official Practice Test 6 on Sat 10 Oct");
  assert.equal(goals[0].progress, 0);

  const adaptive = [planItem({ id: "m2", date: "2026-10-10", kind: "mock", status: "done", mock: { kind: "adaptive" } })];
  const goals2 = weeklyGoals({ analytics: null, weekItems: adaptive, today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals2[0].title, "Sit your Adaptive Mock on Sat 10 Oct");
  assert.equal(goals2[0].progress, 1, "a done mock is fully progressed");
}

// --- 13: pacing goal picks the worst-flagged skill and reports its section's target
{
  const analytics = emptyAnalytics({
    skills: [
      { key: "slow math", label: "Slow Math", section: "math", domain: "advanced-math", attempts: 5, correct: 2, mastery: 0.4, confidence: 4, trend: 0, lastAt: NOW },
      { key: "slow rw", label: "Slow RW", section: "rw", domain: "information-ideas", attempts: 5, correct: 2, mastery: 0.4, confidence: 4, trend: 0, lastAt: NOW },
    ],
    pacing: { rw: { medianSec: 100, targetSec: 71, samples: 5 }, math: { medianSec: 130, targetSec: 95, samples: 5 } },
    pacingFlags: [
      { skill: "slow math", label: "Slow Math", medianSec: 130, accuracy: 0.4 }, // ratio 1.37
      { skill: "slow rw", label: "Slow RW", medianSec: 100, accuracy: 0.4 }, // ratio 1.41 -- worse
    ],
  });
  const goals = weeklyGoals({ analytics, weekItems: [], today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals[0].kind, "pacing");
  assert.equal(goals[0].title, "Speed up on Slow RW");
  assert.equal(goals[0].detail, "You're averaging 100s vs a 71s target on Slow RW.");
}

// --- 14: score goal gap and "reached target" wording
{
  const short = emptyAnalytics({ scores: { latestOfficial: null, latestEstimate: null, history: [{ id: "s1", kind: "practice", title: "t", finishedAt: NOW, score: { authority: "official", lower: 1180, upper: 1210, testNo: 4 } }] } });
  const goals = weeklyGoals({ analytics: short, weekItems: [], today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals[0].kind, "score");
  assert.equal(goals[0].title, "205 points to your 1400 target", "midpoint 1195, gap 205");

  const met = emptyAnalytics({ scores: { latestOfficial: null, latestEstimate: null, history: [{ id: "s2", kind: "practice", title: "t", finishedAt: NOW, score: { authority: "official", lower: 1400, upper: 1430, testNo: 5 } }] } });
  const goals2 = weeklyGoals({ analytics: met, weekItems: [], today: "2026-10-07", targetScore: 1400 });
  assert.equal(goals2[0].title, "You've reached your 1400 target score");
  assert.equal(goals2[0].progress, 1);

  const none = weeklyGoals({ analytics: emptyAnalytics(), weekItems: [], today: "2026-10-07", targetScore: 1400 });
  assert.deepEqual(none, [], "no score history -> no score goal");
}

// --- 15: at most 4 goals, in priority order sessions/mastery/exam/pacing/score
{
  const analytics = emptyAnalytics({
    skills: [{ key: "s", label: "S", section: "rw", domain: "information-ideas", attempts: 5, correct: 3, mastery: 0.6, confidence: 4, trend: 0, lastAt: NOW }],
    pacingFlags: [{ skill: "s", label: "S", medianSec: 200, accuracy: 0.4 }],
    scores: { latestOfficial: null, latestEstimate: null, history: [{ id: "s1", kind: "practice", title: "t", finishedAt: NOW, score: { authority: "official", lower: 1180, upper: 1210, testNo: 4 } }] },
  });
  const weekItems = [
    planItem({ id: "c1", date: "2026-10-06", status: "done" }),
    planItem({ id: "m1", date: "2026-10-10", kind: "mock", status: "scheduled", mock: { kind: "adaptive" } }),
  ];
  const goals = weeklyGoals({ analytics, weekItems, today: "2026-10-07", targetScore: 1400, weakAtWeekStart: { key: "s", label: "S", mastery: 0.5 } });
  assert.equal(goals.length, 4, "capped at 4 even though all 5 kinds apply");
  assert.deepEqual(goals.map((g) => g.kind), ["sessions", "mastery", "exam", "pacing"], "score is dropped as the lowest priority");
}

console.log("sat-coach-goals tests passed");
