import assert from "node:assert/strict";
import { loadQuestionBank } from "../src/lib/sat/bank.ts";
import { assembleForm } from "../src/lib/sat/forms.ts";
import { startAdaptive, submitStage, beginStage } from "../src/lib/sat/session.ts";
import { startDrill, checkDrillAnswer } from "../src/lib/sat/drills.ts";
import { answerOf, sessionState, drillState } from "../src/lib/sat/serve.ts";

// Deterministic RNG so a run is reproducible and a failure is debuggable.
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const T0 = Date.parse("2026-10-01T09:00:00.000Z");
const allA = (ids) => Object.fromEntries(ids.map((id) => [id, "A"]));

// Keys that only ever belong to the answer key -- serve.ts's whole reason
// for existing is that these never reach the browser before a question has
// been revealed (finished report, or a checked drill item).
const LEAKY_KEYS = ["answer", "rationale", "rationaleImg", "accepted", "correct"];

function assertNoLeak(value, label) {
  const json = JSON.stringify(value);
  for (const key of LEAKY_KEYS) {
    assert.ok(!json.includes(`"${key}"`), `${label} leaks "${key}": ${json.slice(0, 300)}`);
  }
}

// --- an adaptive session built from the REAL question bank ---------------
const bank = loadQuestionBank();
assert.ok(bank.length > 0, "the real question bank must be non-empty for this check to mean anything");
const form = assembleForm(bank, seeded(11));
let s = startAdaptive(form, { id: "srv-session-1", uid: "srv-user-1", now: T0 });

// --- running: no answer-key keys leak, and difficulty is hidden ----------
let state = sessionState(s, T0 + 60_000);
assert.equal(state.status, "running");
assert.equal(state.report, null, "no report while running");
assertNoLeak(state, "sessionState while running");
assert.ok(state.stage.questions.length > 0);
for (const q of state.stage.questions) {
  assert.equal(q.difficulty, null, "difficulty must be hidden while a module is running (it would reveal routing on Module 2)");
}

// --- reach the break: submit rw.m1 then rw.m2, stage-guarded submitStage --
s = submitStage(s, "rw.m1", allA(s.plan["rw.m1"]), [], T0 + 30 * 60_000, answerOf);
assert.equal(s.results["rw.m1"].total, 27);

// Module 1 -> Module 2 is immediate (no break between them), so the session
// is "running" again straight away, now on a Module 2 stage. This is the
// stage where hiding difficulty actually matters: Module 2's difficulty mix
// (lower vs. upper) is exactly what would reveal the adaptive route.
state = sessionState(s, T0 + 31 * 60_000);
assert.equal(state.status, "running");
assert.equal(state.stage.key, "rw.m2", "must have routed into a Module 2 stage");
assertNoLeak(state, "sessionState on the rw.m2 (Module 2) stage");
assert.ok(state.stage.questions.length > 0);
for (const q of state.stage.questions) {
  assert.equal(q.difficulty, null, "difficulty must be hidden on a Module 2 stage too -- this is where it would reveal the route");
}

s = submitStage(s, "rw.m2", allA(s.plan["rw.m2"]), [], T0 + 62 * 60_000, answerOf);

state = sessionState(s, T0 + 63 * 60_000);
assert.equal(state.status, "break");
assert.equal(state.stage, null);
assert.equal(state.report, null, "no report on a break either");
assertNoLeak(state, "sessionState on a break");

// --- finish the sitting: leave the break, then math.m1 and math.m2 -------
s = beginStage(s, T0 + 70 * 60_000);
s = submitStage(s, "math.m1", allA(s.plan["math.m1"]), [], T0 + 70 * 60_000, answerOf);
s = submitStage(s, "math.m2", allA(s.plan["math.m2"]), [], T0 + 90 * 60_000, answerOf);
assert.ok(s.finishedAt !== null, "the sitting must be finished after all four stages");

state = sessionState(s, T0 + 91 * 60_000);
assert.equal(state.status, "finished");
assert.ok(state.report !== null, "a finished sitting must carry a report");
assert.ok(Array.isArray(state.report.review) && state.report.review.length > 0);
// Once finished, the report is exactly where these keys are SUPPOSED to
// show up -- it is the review surface.
const reportJson = JSON.stringify(state.report);
assert.ok(reportJson.includes('"correct"'), "the finished report must reveal correctness per item");
assert.ok(reportJson.includes('"answer"'), "the finished report must reveal the correct answer per item");

console.log("sat-serve session-state tests passed");

// --- drills: unchecked questions carry no answer/rationale, a checked ------
// one does, and drills keep their difficulty label (the student chose it).
const drill = startDrill(bank, {}, 5, seeded(3), { id: "srv-drill-1", uid: "srv-user-1", now: T0 });
let dstate = drillState(drill, T0 + 1_000);
assert.equal(Object.keys(dstate.checked).length, 0, "nothing is checked yet");
assertNoLeak(dstate, "drillState before any answer");
assert.ok(dstate.questions.some((q) => q.difficulty !== null), "drills keep their difficulty label");

const firstId = drill.questionIds[0];
const { drill: checkedDrill } = checkDrillAnswer(drill, firstId, "A", answerOf, T0 + 2_000);
dstate = drillState(checkedDrill, T0 + 3_000);
assert.equal(Object.keys(dstate.checked).length, 1, "exactly the one answered question is checked");
assert.ok(dstate.checked[firstId], "the checked question has a review item");
assert.ok("answer" in dstate.checked[firstId] && "rationale" in dstate.checked[firstId], "a checked item reveals the key");
for (const id of drill.questionIds) {
  if (id === firstId) continue;
  assert.equal(dstate.checked[id], undefined, "an unchecked question must not appear in `checked`");
}
// The still-unchecked questions, and the public question list as a whole,
// must still carry none of the answer-key keys.
const uncheckedJson = JSON.stringify(dstate.questions);
for (const key of LEAKY_KEYS) {
  assert.ok(!uncheckedJson.includes(`"${key}"`), `dstate.questions (public list) leaks "${key}"`);
}

console.log("sat-serve drill-state tests passed");
