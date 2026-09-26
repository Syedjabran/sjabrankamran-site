import assert from "node:assert/strict";
import {
  STAGES, GRACE_MS, startAdaptive, startPractice, currentStage, stageDeadline, isOnBreak,
  settleBreak, saveAnswers, submitStage, beginStage, rawBySection, practiceQuestionId, domainBreakdown,
  isStaleStage, mergeTime, sittingQuestionIds,
} from "../src/lib/sat/session.ts";
import { startDrill, checkDrillAnswer, drillCheckRefusal, RUNNING_EXAM_REFUSAL } from "../src/lib/sat/drills.ts";
import { DRILL_COUNT_MAX, drillTitle } from "../src/lib/sat/client-types.ts";
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
assert.equal(p.title, "Official Practice Test 4", "one name for practice tests, sittings and assignments alike");
assert.equal(stageDeadline(p), T0 + 39 * 60_000, "the paper's own 39 minutes, not the digital 32");
assert.deepEqual(p.plan["math.m1"], [practiceQuestionId(4, "math", 1, 1), practiceQuestionId(4, "math", 1, 2)], "questions in printed order");
const pm = submitStage(p, "rw.m1", {}, [], T0 + 60_000, answerOf);
assert.equal(pm.routed.rw, undefined, "a linear paper has no routing");
assert.deepEqual(pm.plan["rw.m2"], [practiceQuestionId(4, "rw", 2, 1)]);
assert.equal(STAGES.length, 4);

// --- per-question timing: mergeTime (pure) ---
assert.deepEqual(
  mergeTime({ a: 5000 }, { a: 3000, b: 9000, x: 1 }, new Set(["a", "b"]), 8000),
  { a: 5000, b: 8000 },
  "per id max(prev, incoming), capped, ids outside allowed dropped",
);
assert.deepEqual(mergeTime(undefined, { a: 100 }, new Set(["a"]), 8000), { a: 100 }, "no prior time is fine");
assert.deepEqual(mergeTime({ a: 100 }, undefined, new Set(["a"]), 8000), { a: 100 }, "no incoming time keeps prev, still capped/filtered");
assert.deepEqual(mergeTime({ a: 100, b: 200 }, {}, new Set(["a"]), 8000), { a: 100 }, "an id outside allowed is dropped even with no incoming");

// --- per-question timing: saveAnswers merges timeMs for the module's ids
// only, capped at that stage's own minutes ---
let timed = startAdaptive(form, { id: "timed1", uid: "u1", now: T0 });
timed = saveAnswers(timed, "rw.m1", {}, [], { "r1-0": 5000, "r1-1": 2000, "not-a-question": 999 });
assert.deepEqual(timed.timeMs, { "r1-0": 5000, "r1-1": 2000 }, "time for ids outside the module is dropped");
timed = saveAnswers(timed, "rw.m1", {}, [], { "r1-0": 3000, "r1-2": 40 * 60_000 });
assert.deepEqual(
  timed.timeMs, { "r1-0": 5000, "r1-1": 2000, "r1-2": 32 * 60_000 },
  "max(prev, incoming), and a huge incoming value is capped at R&W Module 1's own 32 minutes",
);
assert.equal(saveAnswers(timed, "rw.m1", {}, [], undefined).timeMs, timed.timeMs, "an absent timeMs leaves the map untouched (same reference)");
assert.equal(saveAnswers(timed, "rw.m2", {}, [], { "ru-0": 1000 }), timed, "a stale-stage save ignores timeMs too");

// --- per-question timing: submitStage carries timeMs through the same
// merge, capping independently per stage ---
let ts = startAdaptive(form, { id: "ts1", uid: "u1", now: T0 });
ts = submitStage(ts, "rw.m1", allA(form.sets["rw.m1"].map((x) => x.id)), [], T0 + 10 * 60_000, answerOf, { "r1-0": 33 * 60_000 });
assert.equal(ts.timeMs["r1-0"], 32 * 60_000, "submitStage caps time at the stage's own minutes (R&W Module 1: 32)");

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
assert.equal(startDrill(pool, { section: "math" }, 999, seeded(1), { id: "d2", uid: "u1", now: T0 }).questionIds.length, Math.min(DRILL_COUNT_MAX, 20));
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

// --- drills: an `exclude` set is filtered out of the pool before shuffling ---
// (a question already planned for one of the student's own unfinished
// sittings must never be drawable into a drill in another tab).
const mathPool = pool.filter((x) => x.section === "math"); // 20 items: a0..a19
const excludeSet = new Set(mathPool.slice(0, 15).map((x) => x.id));
const excluded = startDrill(pool, { section: "math" }, 5, seeded(2), { id: "d4", uid: "u1", now: T0 }, excludeSet);
assert.equal(excluded.questionIds.length, 5, "the 5 non-excluded math items are exactly enough to fill the drill");
assert.ok(excluded.questionIds.every((id) => !excludeSet.has(id)), "excluded ids never appear in the drill");

// --- drills: an invalid grid-in entry is refused and records nothing (F11) ---
const sprKey = { kind: "spr", accepted: ["3/2", "1.5"] };
const sprAnswerOf = () => sprKey;
const sprDrill = startDrill(pool, { section: "math" }, 5, seeded(3), { id: "d5", uid: "u1", now: T0 });
const sprId = sprDrill.questionIds[0];
for (const bad of ["1 1/2", "123456", "3/0", "abc", "1.2.3"]) {
  assert.throws(() => checkDrillAnswer(sprDrill, sprId, bad, sprAnswerOf, T0), Error, `"${bad}" is refused`);
}
assert.deepEqual(sprDrill.checked, {}, "a refused entry records nothing");
assert.deepEqual(sprDrill.answers, {});
const sprOk = checkDrillAnswer(sprDrill, sprId, "1.5", sprAnswerOf, T0 + 1000);
assert.equal(sprOk.correct, true, "the first VALID entry is the recorded one");
assert.equal(sprOk.drill.answers[sprId], "1.5");
// MCQ checks are unaffected: any letter is judged as before.
assert.equal(checkDrillAnswer(d, d.questionIds[1], "C", answerOf, T0).correct, false);

// --- drills: checkDrillAnswer merges the checked question's own time,
// capped at 30 minutes; a re-check of an already-checked question (same
// reference back) ignores a later time payload too ---
const timedDrill = startDrill(pool, { section: "math" }, 5, seeded(4), { id: "d6", uid: "u1", now: T0 });
const tId = timedDrill.questionIds[0];
const t1 = checkDrillAnswer(timedDrill, tId, "A", answerOf, T0 + 1000, 31 * 60_000);
assert.equal(t1.drill.timeMs[tId], 30 * 60_000, "drill time is capped at 30 minutes");
const t2 = checkDrillAnswer(t1.drill, tId, "B", answerOf, T0 + 2000, 5000);
assert.equal(t2.drill, t1.drill, "an already-checked question ignores a later time payload too");
const untimed = checkDrillAnswer(timedDrill, timedDrill.questionIds[1], "A", answerOf, T0 + 500);
assert.equal(untimed.drill.timeMs, timedDrill.timeMs, "no timeMs argument leaves the map untouched");

// --- SAT Coach ruling 7b: a drill check refuses a question that is also in
// one of the student's in-play sittings -- planned, or still routable (both
// Module 2 variants) -- so a drill can't hand back a running exam's answer.
{
  const sitting = startAdaptive(form, { id: "s9", uid: "u1", now: T0 });
  const inPlay = new Set(sittingQuestionIds(sitting));
  assert.ok(inPlay.has("r1-0") && inPlay.has("ml-3") && inPlay.has("mu-21"), "module 1, and BOTH module 2 variants");
  assert.equal(inPlay.size, 27 * 3 + 22 * 3);
  assert.equal(drillCheckRefusal("mu-21", inPlay), RUNNING_EXAM_REFUSAL);
  assert.equal(RUNNING_EXAM_REFUSAL, "This question is part of your running exam — finish the exam first.");
  assert.equal(drillCheckRefusal("a0", inPlay), null, "a question outside the running exam is checked as usual");
  const planned = { ...sitting, plan: { ...sitting.plan, "rw.m2": ["r1-0", "extra-1"] } };
  assert.ok(sittingQuestionIds(planned).includes("extra-1"), "a routed Module 2 counts too");
  assert.equal(new Set(sittingQuestionIds(planned)).size, sittingQuestionIds(planned).length, "no duplicates");
}

// --- drill titles: one function for the stored title and the staff preview ---
assert.equal(drillTitle({}), "Mixed drill");
assert.equal(drillTitle({ section: "", domain: "", difficulty: "" }), "Mixed drill", "the client's empty fields");
assert.equal(drillTitle({ section: "math", domain: "algebra", difficulty: "H" }), "Math · Algebra · Hard drill");
assert.equal(drillTitle({ section: "rw", domain: "standard-english" }), "Reading and Writing · Standard English Conventions drill");
assert.equal(drillTitle({ section: "math", domain: "algebra", skill: "Linear equations in one variable" }), "Math · Linear equations in one variable drill", "a skill names the drill over its domain");
assert.equal(d.title, "Math drill");

console.log("sat-session tests passed");
