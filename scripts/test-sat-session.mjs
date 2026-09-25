import assert from "node:assert/strict";
import {
  STAGES, GRACE_MS, startAdaptive, startPractice, currentStage, stageDeadline, isOnBreak,
  settleBreak, saveAnswers, submitStage, beginStage, rawBySection, practiceQuestionId, domainBreakdown,
  isStaleStage,
} from "../src/lib/sat/session.ts";
import { startDrill, checkDrillAnswer, DRILL_MAX } from "../src/lib/sat/drills.ts";
import { ROUTING } from "../src/lib/sat/adaptive.ts";

const T0 = Date.parse("2026-10-01T09:00:00.000Z");
const q = (id, section, domain = "algebra", difficulty = "M") => ({
  id, section, domain, difficulty, skill: "s", answer: { kind: "mcq", correct: 0 },
  rationale: "r", img: `sat/${section}/${id}.jpg`, ref: id, source: "question-bank",
});
const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const set = (p, n, section) => ids(p, n).map((id) => q(id, section));
const form = { id: "f", kind: "adaptive", sets: {
  "rw.m1": set("r1-", 27, "rw"), "rw.m2.lower": set("rl-", 27, "rw"), "rw.m2.upper": set("ru-", 27, "rw"),
  "math.m1": set("m1-", 22, "math"), "math.m2.lower": set("ml-", 22, "math"), "math.m2.upper": set("mu-", 22, "math"),
} };
// Every question in this fixture is answered correctly with "A".
const answerOf = (id) => ({ kind: "mcq", correct: 0 });
const allA = (list) => Object.fromEntries(list.map((id) => [id, "A"]));

// --- start ---
let s = startAdaptive(form, { id: "s1", uid: "u1", now: T0 });
assert.equal(currentStage(s), "rw.m1");
assert.equal(stageDeadline(s), T0 + 32 * 60_000, "R&W module 1 is 32 minutes");
assert.equal(s.plan["rw.m2"], undefined, "Module 2 is not chosen until Module 1 is scored");

// --- isStaleStage ---
assert.equal(isStaleStage(s, "rw.m1"), false, "the module actually being sat is not stale");
assert.equal(isStaleStage(s, "rw.m2"), true, "a module other than the one being sat is stale");

// --- answers are scoped to the module being sat ---
s = saveAnswers(s, "rw.m1", { "r1-0": "A", "m1-0": "A", "not-a-question": "B" }, ["r1-1", "m1-3"]);
assert.deepEqual(Object.keys(s.answers), ["r1-0"], "answers for other modules are dropped");
assert.deepEqual(s.flagged, ["r1-1"]);
s = saveAnswers(s, "rw.m1", { "r1-0": "" }, []);
assert.equal(s.answers["r1-0"], undefined, "clearing an answer removes it");

// --- flagged is de-duplicated ---
const flaggedTwice = saveAnswers(s, "rw.m1", {}, ["r1-2", "r1-2"]);
assert.deepEqual(flaggedTwice.flagged, ["r1-2"], "a repeated id appears once");

// --- a stale saveAnswers is a no-op ---
assert.equal(saveAnswers(s, "rw.m2", { "ru-0": "A" }, []), s, "saveAnswers for a module not being sat returns the same reference");

// --- routing: a strong Module 1 routes upper, a weak one lower ---
const strong = submitStage(s, "rw.m1", allA(form.sets["rw.m1"].map((x) => x.id)), [], T0 + 10 * 60_000, answerOf);
assert.equal(strong.results["rw.m1"].correct, 27);
assert.equal(strong.routed.rw, "upper");
assert.deepEqual(strong.plan["rw.m2"], form.sets["rw.m2.upper"].map((x) => x.id));
assert.equal(currentStage(strong), "rw.m2");
assert.equal(strong.stageStartedAt, T0 + 10 * 60_000, "Module 2's clock starts at submission");

// --- a stale/duplicate submit of a module already left is a no-op ---
const dup = submitStage(strong, "rw.m1", allA(form.sets["rw.m1"].map((x) => x.id)), [], T0 + 11 * 60_000, answerOf);
assert.equal(dup, strong, "a duplicate submit of a module already passed returns the same reference");
assert.equal(dup.results["rw.m2"], undefined, "the duplicate is never scored as the next module");
assert.equal(dup.current, strong.current, "current is unchanged by the duplicate");

const weakAnswers = allA(form.sets["rw.m1"].slice(0, ROUTING.rw.threshold - 1).map((x) => x.id));
const weak = submitStage(s, "rw.m1", weakAnswers, [], T0 + 5 * 60_000, answerOf);
assert.equal(weak.routed.rw, "lower");
assert.deepEqual(weak.plan["rw.m2"], form.sets["rw.m2.lower"].map((x) => x.id));

// --- overtime is recorded, never rejected ---
const late = submitStage(s, "rw.m1", {}, [], T0 + 32 * 60_000 + GRACE_MS + 1, answerOf);
assert.equal(late.results["rw.m1"].overtime, true);
assert.equal(late.results["rw.m1"].answered, 0);
const onTime = submitStage(s, "rw.m1", {}, [], T0 + 32 * 60_000 + GRACE_MS, answerOf);
assert.equal(onTime.results["rw.m1"].overtime, false, "the grace window is inclusive");

// --- the break between sections ---
let b = submitStage(strong, "rw.m2", allA(strong.plan["rw.m2"]), [], T0 + 40 * 60_000, answerOf);
assert.equal(currentStage(b), "math.m1");
assert.equal(isOnBreak(b), true);
assert.equal(b.breakUntil, T0 + 50 * 60_000, "a 10-minute break");
assert.equal(stageDeadline(b), null, "no module clock runs during the break");
assert.equal(isStaleStage(b, "math.m1"), true, "the current stage is still stale while on a break");
assert.equal(submitStage(b, "math.m1", {}, [], T0 + 41 * 60_000, answerOf), b, "nothing can be submitted on a break");
const early = beginStage(b, T0 + 43 * 60_000);
assert.equal(early.stageStartedAt, T0 + 43 * 60_000, "a student may end the break early");
assert.equal(settleBreak(b, T0 + 45 * 60_000), b, "a break still running is left alone");
const settled = settleBreak(b, T0 + 70 * 60_000);
assert.equal(settled.stageStartedAt, T0 + 50 * 60_000, "an expired break starts Math when the break ended, not when the student returned");

// --- finishing ---
let f = beginStage(b, T0 + 50 * 60_000);
f = submitStage(f, "math.m1", allA(f.plan["math.m1"]), [], T0 + 60 * 60_000, answerOf);
assert.equal(f.routed.math, "upper");
f = submitStage(f, "math.m2", allA(f.plan["math.m2"]), [], T0 + 80 * 60_000, answerOf);
assert.equal(currentStage(f), null);
assert.equal(f.finishedAt, T0 + 80 * 60_000);
assert.deepEqual(rawBySection(f), { rw: 54, math: 44 });
assert.equal(isStaleStage(f, "math.m2"), true, "a finished sitting has no live stage");
assert.equal(submitStage(f, "math.m2", {}, [], T0 + 90 * 60_000, answerOf), f, "a finished sitting is frozen");

// --- practice tests use their own printed timings and question ids ---
const test = {
  testNo: 4, conversion: { rw: {}, math: {} }, minutes: { rw: [39, 39], math: [43, 43] },
  questions: [
    ...[1, 2].map((n) => ({ testNo: 4, section: "rw", module: 1, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
    ...[1].map((n) => ({ testNo: 4, section: "rw", module: 2, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
    ...[2, 1].map((n) => ({ testNo: 4, section: "math", module: 1, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
    ...[1].map((n) => ({ testNo: 4, section: "math", module: 2, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
  ],
};
const p = startPractice(test, { id: "p1", uid: "u1", now: T0 });
assert.equal(p.kind, "practice");
assert.equal(stageDeadline(p), T0 + 39 * 60_000, "the paper's own 39 minutes, not the digital 32");
assert.deepEqual(p.plan["math.m1"], [practiceQuestionId(4, "math", 1, 1), practiceQuestionId(4, "math", 1, 2)], "questions in printed order");
const pm = submitStage(p, "rw.m1", {}, [], T0 + 60_000, answerOf);
assert.equal(pm.routed.rw, undefined, "a linear paper has no routing");
assert.deepEqual(pm.plan["rw.m2"], [practiceQuestionId(4, "rw", 2, 1)]);
assert.equal(STAGES.length, 4);

// --- domain breakdown ---
assert.deepEqual(
  domainBreakdown([{ domain: "algebra", correct: true }, { domain: "algebra", correct: false }, { domain: "psda", correct: true }]),
  [{ domain: "algebra", correct: 1, total: 2 }, { domain: "psda", correct: 1, total: 1 }],
);

// --- drills ---
const seeded = (seed) => { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const pool = [...set("a", 20, "math"), ...set("b", 20, "rw")];
const d = startDrill(pool, { section: "math" }, 8, seeded(1), { id: "d1", uid: "u1", now: T0 });
assert.equal(d.questionIds.length, 8);
assert.ok(d.questionIds.every((id) => id.startsWith("a")), "the filter is honoured");
assert.equal(startDrill(pool, { section: "math" }, 999, seeded(1), { id: "d2", uid: "u1", now: T0 }).questionIds.length, Math.min(DRILL_MAX, 20));
assert.throws(() => startDrill(pool, { section: "math", domain: "psda" }, 5, seeded(1), { id: "d3", uid: "u1", now: T0 }), /No questions/);

const first = checkDrillAnswer(d, d.questionIds[0], "A", answerOf, T0 + 1000);
assert.equal(first.correct, true);
const again = checkDrillAnswer(first.drill, d.questionIds[0], "B", answerOf, T0 + 2000);
assert.equal(again.correct, true, "the first answer counts; re-answering cannot change it");
assert.equal(again.drill.answers[d.questionIds[0]], "A");
assert.throws(() => checkDrillAnswer(d, "not-in-drill", "A", answerOf, T0), /not part of this drill/);
let done = d;
for (const id of d.questionIds) done = checkDrillAnswer(done, id, "A", answerOf, T0 + 5000).drill;
assert.equal(done.finishedAt, T0 + 5000);

console.log("sat-session tests passed");
