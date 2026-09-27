import assert from "node:assert/strict";
import { loadQuestionBank } from "../src/lib/sat/bank.ts";
import { assembleForm } from "../src/lib/sat/forms.ts";
import { startAdaptive, submitStage, beginStage } from "../src/lib/sat/session.ts";
import { startDrill, checkDrillAnswer } from "../src/lib/sat/drills.ts";
import { answerOf, sessionState, drillState, summaryOf, itemsOf, trimIndex, INDEX_CAP } from "../src/lib/sat/serve.ts";

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
  assert.equal(q.domain, null, "domain must be hidden while a module is running -- the real SAT shows none");
  assert.equal(q.skill, null, "skill must be hidden while a module is running -- the real SAT shows none");
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
  assert.equal(q.domain, null, "domain must be hidden on a Module 2 stage too");
  assert.equal(q.skill, null, "skill must be hidden on a Module 2 stage too");
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
const beforeMath2 = s;
assert.equal(summaryOf(s).overtime, false, "an unfinished sitting is never flagged");
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

// --- summaries carry overtime once finished (F6) ---
assert.equal(summaryOf(s).overtime, false, "every module inside its limit");
// Math Module 2 started at T0+70 min with 35 minutes; submitted 3 minutes
// past its deadline (beyond the 90 s grace) it is recorded as overtime.
const lateFinish = submitStage(beforeMath2, "math.m2", allA(beforeMath2.plan["math.m2"]), [], T0 + 108 * 60_000, answerOf);
assert.equal(lateFinish.results["math.m2"].overtime, true);
assert.equal(summaryOf(lateFinish).overtime, true, "a finished sitting with an overtime module is flagged");
assert.equal(sessionState(lateFinish, T0 + 109 * 60_000).report.overtime, true, "and so is its report, as before");

// --- itemsOf (SAT Coach analytics): the real index wired into
// analyticsItemsFromDoc -- submitted modules only, graded like the scores.
{
  const planned = (k) => beforeMath2.plan[k].length;
  const midItems = itemsOf(beforeMath2); // rw.m1, rw.m2, math.m1 submitted; math.m2 running
  assert.equal(midItems.length, planned("rw.m1") + planned("rw.m2") + planned("math.m1"), "a running module contributes nothing");
  assert.ok(!midItems.some((it) => beforeMath2.plan["math.m2"].includes(it.qid)), "no item from the running module");
  const rwCorrect = midItems.filter((it) => it.section === "rw" && it.correct).length;
  assert.equal(rwCorrect, beforeMath2.results["rw.m1"].correct + beforeMath2.results["rw.m2"].correct, "items grade exactly like the module scores");
  assert.ok(midItems.every((it) => it.domain !== null && it.skill !== null && it.source === "adaptive"), "bank questions carry their labels");
  assert.equal(itemsOf(s).length, midItems.length + planned("math.m2"), "a finished sitting contributes every module");
  assert.equal(summaryOf(s).checkedCount, undefined, "sittings carry no checkedCount");
}

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

assert.equal(summaryOf(checkedDrill).overtime, false, "drills are never flagged");

const drillItems = itemsOf(checkedDrill);
assert.deepEqual(drillItems.map((it) => it.qid), [firstId], "a drill's only item is its one checked question");
assert.equal(drillItems[0].correct, checkedDrill.checked[firstId], "graded as recorded at check time");
assert.equal(summaryOf(checkedDrill).checkedCount, 1, "an unfinished drill's summary counts its checked questions");
assert.equal(summaryOf(checkedDrill).total, 0, "... but still shows no result before it finishes");
assert.equal(summaryOf(drill).checkedCount, 0);

// --- SAT Coach: a summary carries the plan item it was started from and,
// for an official practice sitting, the test number (rulings 3 and 4).
{
  assert.equal(summaryOf({ ...checkedDrill, planItemId: "item-7" }).planItemId, "item-7");
  assert.equal("planItemId" in summaryOf(checkedDrill), false, "absent when the doc has none");
  const practice = { ...s, kind: "practice", testNo: 6, planItemId: "item-8" };
  assert.equal(summaryOf(practice).testNo, 6);
  assert.equal(summaryOf(practice).planItemId, "item-8");
  assert.equal("testNo" in summaryOf(s), false, "an adaptive sitting has no test number");
}

console.log("sat-serve drill-state tests passed");

// --- final review M14: the 300-entry index keeps finished practice tests and
// adaptive mocks when it trims; the oldest drills go first
{
  const DAY_MS = 86_400_000;
  const entry = (id, kind, createdAt, finished = true) => ({
    id, kind, title: id, createdAt, finishedAt: finished ? createdAt + 3_600_000 : null, score: null, correct: 0, total: 0, assignmentId: null, overtime: false,
  });
  // Newest first, as saveDoc keeps it: a year of daily challenges on top of
  // 12 finished full exams, the exams the oldest entries of all.
  const exams = Array.from({ length: 12 }, (_, i) => entry(`exam-${i}`, i % 2 ? "adaptive" : "practice", T0 - (400 - i) * DAY_MS));
  const drills = Array.from({ length: 289 }, (_, i) => entry(`drill-${i}`, "drill", T0 - (300 - i) * DAY_MS));
  const index = [...drills].reverse().concat([...exams].reverse()); // 301 entries, newest first
  assert.equal(index.length, 301);
  assert.equal(INDEX_CAP, 300);
  const trimmed = trimIndex(index);
  assert.equal(trimmed.length, 300);
  assert.ok(exams.every((e) => trimmed.some((t) => t.id === e.id)), "every finished full exam is kept");
  assert.ok(!trimmed.some((t) => t.id === "drill-0"), "the oldest drill goes");
  assert.deepEqual(trimmed.map((t) => t.id), index.filter((t) => t.id !== "drill-0").map((t) => t.id), "the order is kept");
  // Under the old slice(0, 300) the oldest exam fell off instead.
  assert.equal(index.slice(0, 300).some((t) => t.id === "exam-0"), false);

  // Unfinished sittings go after drills, before finished ones.
  const mixed = [entry("d-new", "drill", T0), entry("open-old", "adaptive", T0 - 50 * DAY_MS, false), entry("fin-old", "practice", T0 - 60 * DAY_MS), entry("d-old", "drill", T0 - 10 * DAY_MS)];
  assert.deepEqual(trimIndex(mixed, 3).map((t) => t.id), ["d-new", "open-old", "fin-old"], "the older drill goes first");
  assert.deepEqual(trimIndex(mixed, 2).map((t) => t.id), ["open-old", "fin-old"], "both drills go before any sitting");
  assert.deepEqual(trimIndex(mixed, 1).map((t) => t.id), ["fin-old"], "a finished sitting is the last to go");
  assert.equal(trimIndex(mixed, 4), mixed, "within the cap: unchanged");
}

console.log("sat-serve index-trim tests passed");
