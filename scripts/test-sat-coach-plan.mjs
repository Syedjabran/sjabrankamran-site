// Tests for the study-plan wiring (SAT Coach Task 9): the pure decisions
// behind plan-store.ts's ensureSatPlan / recordPlanCompletion / startPlanItem
// (src/lib/sat/coach/plan-logic.ts), run here against an in-memory plan doc,
// and the home view built from a plan (src/lib/sat/coach/coach-view.ts).
// Dates are PKT calendar days; 2026-10-01 is a Thursday.
import assert from "node:assert/strict";
import {
  attachSession, challengeAnalytics, completeItem, currentWeak, doneMapFrom, existingSessionFor, isoWeekKey,
  latestDiagnosticId, nextPlan, planDecision, practiceTakenFrom, snapshotOf, startDecision, weakSnapshot, weekRolled,
} from "../src/lib/sat/coach/plan-logic.ts";
import {
  analyticsSummary, insightsInputOf, normaliseTipSkills, planStreak, planView, reminderFor, todayItems, weekItemsOf, weekTally,
} from "../src/lib/sat/coach/coach-view.ts";
import { DIAGNOSTIC_SIZE } from "../src/lib/sat/coach/diagnostic.ts";
import { formatPkDay } from "../src/lib/portal/pk-time.ts";
import { isMovable, movesLeft } from "../src/lib/sat/coach/plan-moves.ts";
import { addDays, checkMove } from "../src/lib/sat/coach/planner.ts";
import { planItemTitle } from "../src/lib/sat/client-types.ts";

const TODAY = "2026-10-01";
const PRACTICE_TESTS = [4, 5, 6, 7, 8, 9, 10, 11];
const NOW_ISO = "2026-10-01T04:00:00.000Z";

function profile(overrides) {
  return { examDate: "2026-10-24", targetMonth: null, targetScore: 1300, days: [1, 3, 5], minutes: 30, start: { kind: "diagnostic" }, ...overrides };
}

function input(overrides) {
  return {
    today: TODAY, profile: profile(), practiceTaken: [], practiceAvailable: PRACTICE_TESTS, done: {},
    diagnosticId: "diag-1", weak: { key: "boundaries", label: "Boundaries", mastery: 0.41 }, nowIso: NOW_ISO,
    ...overrides,
  };
}

const summary = (overrides) => ({
  id: "x", kind: "drill", title: "t", createdAt: 0, finishedAt: null, score: null, correct: 0, total: 0, assignmentId: null, overtime: false, ...overrides,
});
const at = (iso) => Date.parse(iso);

// --- snapshotOf / planDecision (ruling 1: rebuild only what an edit changes)
{
  assert.deepEqual(snapshotOf(profile({ days: [5, 1, 3, 3] })), {
    examDate: "2026-10-24", targetMonth: null, days: [1, 3, 5], minutes: 30, start: { kind: "diagnostic" },
  }, "the planner's fields only, days sorted and unique");
  const first = nextPlan(null, input());
  assert.equal(planDecision(null, profile()), "schedule", "no plan yet: a first build");
  assert.equal(planDecision(first, profile()), "keep");
  assert.equal(planDecision(first, profile({ targetScore: 1500 })), "keep", "target score: nothing to re-plan");
  assert.equal(planDecision(first, profile({ start: { kind: "skip" } })), "keep", "starting point: nothing to re-plan");
  assert.equal(planDecision(first, profile({ days: [5, 3, 1] })), "keep", "the same days in another order");
  assert.equal(planDecision(first, profile({ examDate: "2026-11-07" })), "schedule");
  assert.equal(planDecision(first, profile({ days: [0, 6] })), "schedule");
  assert.equal(planDecision(first, profile({ minutes: 60 })), "sizes");
}

// --- isoWeekKey
assert.equal(isoWeekKey("2026-09-26"), "2026-W39");
assert.equal(isoWeekKey("2026-01-01"), "2026-W01", "1 Jan 2026 is a Thursday");
assert.equal(isoWeekKey("2027-01-01"), "2026-W53", "a Friday 1 Jan belongs to the old year's last week");
assert.equal(isoWeekKey("2024-12-30"), "2025-W01", "a Monday 30 Dec can open the new year's first week");
assert.equal(isoWeekKey("2026-10-04"), isoWeekKey("2026-09-28"), "Monday to Sunday is one week");
assert.notEqual(isoWeekKey("2026-10-05"), isoWeekKey("2026-10-04"));

// --- nextPlan: first build
const first = nextPlan(null, input());
{
  assert.equal(first.version, 1);
  assert.equal(first.generatedAt, NOW_ISO);
  assert.deepEqual(first.profileSnapshot, snapshotOf(profile()));
  assert.deepEqual(first.weekStart, { isoWeek: "2026-W40", weak: { key: "boundaries", label: "Boundaries", mastery: 0.41 } });
  const diagnostic = first.items.find((i) => i.kind === "diagnostic");
  assert.equal(diagnostic.date, TODAY);
  assert.equal(diagnostic.sessionId, "diag-1", "the diagnostic the profile save started is the plan's first item");
  assert.equal(diagnostic.size, DIAGNOSTIC_SIZE, "ruling 10: one diagnostic size");
  assert.equal(DIAGNOSTIC_SIZE, 24);
  assert.ok(first.items.some((i) => i.kind === "mock") && first.items.some((i) => i.kind === "challenge"));
  assert.equal(first.items.filter((i) => i.kind === "exam").length, 1);
  assert.equal(new Set(first.items.map((i) => i.id)).size, first.items.length, "unique ids");
  assert.deepEqual(nextPlan(null, input()), first, "deterministic: two concurrent first builds write the same doc");
  assert.equal(nextPlan(first, input()), first, "idempotent: nothing changed -> the same doc (no write)");
  assert.equal(nextPlan(first, input({ weak: undefined })), first);
}

// --- nextPlan: an edit that plans nothing keeps every item, and a
// minutes-only edit resizes challenges without moving a full exam.
{
  const kept = nextPlan(first, input({ profile: profile({ targetScore: 1450, start: { kind: "skip" } }) }));
  assert.deepEqual(kept.items, first.items, "no rebuild: the items are untouched");
  assert.deepEqual(kept.profileSnapshot.start, { kind: "skip" }, "the snapshot follows the profile");
  const resized = nextPlan(first, input({ profile: profile({ minutes: 60 }) }));
  const mockDays = (p) => p.items.filter((i) => i.kind === "mock").map((i) => `${i.id}@${i.date}`);
  assert.deepEqual(mockDays(resized), mockDays(first), "full exams stay put");
  assert.ok(resized.items.filter((i) => i.kind === "challenge").every((i) => i.size === 30), "challenges take the new size");
  const moved = nextPlan(first, input({ profile: profile({ examDate: "2026-11-21" }) }));
  assert.ok(moved.items.some((i) => i.kind === "exam" && i.date === "2026-11-21"), "a new SAT date rebuilds the schedule");
}

// --- nextPlan: daily maintenance is always persisted (ruling 1) -- a missed
// full exam's replacement survives the next day's pass.
{
  const firstMock = first.items.find((i) => i.kind === "mock");
  const dayAfter = "2026-10-06"; // after the first full exam (Mon 5 Oct)
  assert.equal(firstMock.date, "2026-10-05");
  const next = nextPlan(first, input({ today: dayAfter, weak: undefined }));
  const missed = next.items.find((i) => i.id === firstMock.id);
  assert.equal(missed.status, "missed");
  const replacement = next.items.find((i) => i.replacementFor === firstMock.id);
  assert.ok(replacement, "the missed full exam is re-placed");
  assert.ok(replacement.date > dayAfter);
  const later = nextPlan(next, input({ today: "2026-10-07", weak: undefined }));
  assert.ok(later.items.some((i) => i.replacementFor === firstMock.id), "and the replacement is still there a day later");
  assert.equal(later.items.filter((i) => i.replacementFor === firstMock.id).length, 1, "re-placed once");
  assert.equal(next.weekStart.isoWeek, "2026-W40", "no analytics this time: the week snapshot is left for the next pass");
  const rolled = nextPlan(first, input({ today: dayAfter, weak: null }));
  assert.deepEqual(rolled.weekStart, { isoWeek: "2026-W41", weak: null }, "a new ISO week takes a fresh snapshot");
}

// --- nextPlan: finished work marks items done / late
{
  const challenge = first.items.find((i) => i.kind === "challenge" && i.date === "2026-10-02");
  const onTime = nextPlan(first, input({ today: "2026-10-03", done: { [challenge.id]: { finishedDate: "2026-10-02", sessionId: "d-9" } }, weak: undefined }));
  const item = onTime.items.find((i) => i.id === challenge.id);
  assert.equal(item.status, "done");
  assert.equal(item.sessionId, "d-9");
  const late = nextPlan(first, input({ today: "2026-10-04", done: { [challenge.id]: { finishedDate: "2026-10-03", sessionId: "d-9" } }, weak: undefined }));
  assert.equal(late.items.find((i) => i.id === challenge.id).status, "late");
}

// --- weekRolled / weakSnapshot / currentWeak
{
  assert.equal(weekRolled(null, TODAY), true);
  assert.equal(weekRolled(first, "2026-10-04"), false, "same ISO week");
  assert.equal(weekRolled(first, "2026-10-05"), true);
  assert.equal(weakSnapshot(null), null);
  assert.equal(weakSnapshot({ weakSkills: [] }), null);
  assert.deepEqual(weakSnapshot({ weakSkills: [{ key: "k", label: "L", domain: "algebra", section: "math", mastery: 0.3, priority: 0.2 }] }), { key: "k", label: "L", mastery: 0.3 });
  assert.deepEqual(currentWeak(first, "2026-10-03"), first.weekStart.weak);
  assert.equal(currentWeak(first, "2026-10-05"), null, "last week's baseline is never this week's goal");
  assert.equal(currentWeak(null, TODAY), null);
}

// --- doneMapFrom (ruling 3): finished docs carrying planItemId, and items
// whose recorded session finished; finishedDate is the PKT day.
{
  const items = [
    { id: "i1", date: "2026-10-01", kind: "challenge", status: "scheduled" },
    { id: "i2", date: "2026-10-01", kind: "mock", status: "scheduled", sessionId: "s2" },
    { id: "i3", date: "2026-10-02", kind: "challenge", status: "scheduled", sessionId: "s3" },
    { id: "i4", date: "2026-10-02", kind: "challenge", status: "scheduled", sessionId: "s4" },
  ];
  const done = doneMapFrom([
    summary({ id: "d1", planItemId: "i1", finishedAt: at("2026-10-01T20:30:00Z") }), // 01:30 PKT on 2 Oct
    summary({ id: "s2", kind: "adaptive", finishedAt: at("2026-10-01T10:00:00Z") }),  // legacy entry: no planItemId
    summary({ id: "s3", planItemId: "i3" }),                                          // started, not finished
    summary({ id: "s4", planItemId: "i4", finishedAt: at("2026-10-02T09:00:00Z") }),
    summary({ id: "orphan", planItemId: "i4", finishedAt: at("2026-10-02T08:00:00Z") }),
    summary({ id: "gone", planItemId: "nope", finishedAt: at("2026-10-02T08:00:00Z") }),
  ], items);
  assert.deepEqual(done, {
    i1: { finishedDate: "2026-10-02", sessionId: "d1" },
    i2: { finishedDate: "2026-10-01", sessionId: "s2" },
    i4: { finishedDate: "2026-10-02", sessionId: "s4" },
  }, "the item's own session wins; unknown items and unfinished docs are ignored");
}

// --- practiceTakenFrom (ruling 4): finished practice sittings only
assert.deepEqual(practiceTakenFrom([
  summary({ kind: "practice", testNo: 5, finishedAt: 1 }),
  summary({ kind: "practice", title: "Official Practice Test 7", finishedAt: 1 }), // legacy: no testNo
  summary({ kind: "practice", testNo: 8 }),                                         // unfinished
  summary({ kind: "adaptive", finishedAt: 1 }),
]), [5, 7]);

// --- latestDiagnosticId / existingSessionFor
assert.equal(latestDiagnosticId([
  summary({ id: "old", purpose: "diagnostic", createdAt: 1 }), summary({ id: "new", purpose: "diagnostic", createdAt: 5 }), summary({ id: "drill", createdAt: 9 }),
]), "new");
assert.equal(latestDiagnosticId([summary({ id: "drill" })]), null);
assert.equal(existingSessionFor([summary({ id: "a", planItemId: "p", createdAt: 1 }), summary({ id: "b", planItemId: "p", createdAt: 3 }), summary({ id: "c" })], "p"), "b");
assert.equal(existingSessionFor([summary({ id: "c" })], "p"), null);

// --- completeItem: done on its day, late after; the first finish counts
{
  const items = [{ id: "c1", date: "2026-10-02", kind: "challenge", status: "scheduled", sessionId: "d1" }, { id: "c2", date: "2026-10-03", kind: "challenge", status: "scheduled" }];
  const doneOnTime = completeItem(items, "c1", "d1", "2026-10-02");
  assert.deepEqual(doneOnTime[0], { id: "c1", date: "2026-10-02", kind: "challenge", status: "done", sessionId: "d1", completedAt: "2026-10-02" });
  assert.equal(doneOnTime[1], items[1], "other items untouched");
  assert.equal(completeItem(items, "c1", "d1", "2026-10-04")[0].status, "late");
  assert.equal(completeItem(doneOnTime, "c1", "d1", "2026-10-02"), doneOnTime, "recording it twice changes nothing");
  assert.equal(completeItem(doneOnTime, "c1", "other", "2026-10-05"), doneOnTime, "a second doc never replaces the first finish");
  assert.equal(completeItem(items, "missing", "d1", "2026-10-02"), items);
}

// --- attachSession (ruling 2): the started doc is recorded at once
{
  const items = [{ id: "c1", date: TODAY, kind: "challenge", status: "scheduled" }];
  const attached = attachSession(items, "c1", "d7");
  assert.equal(attached.sessionId, "d7");
  assert.equal(attached.items[0].sessionId, "d7");
  const again = attachSession(attached.items, "c1", "d8");
  assert.equal(again.sessionId, "d7", "a concurrent start keeps the first doc");
  assert.equal(again.items, attached.items);
}

// --- startDecision: only today's or earlier items, not done, not the SAT
{
  const plan = {
    ...first,
    items: [
      { id: "today", date: TODAY, kind: "challenge", status: "scheduled", size: 15 },
      { id: "past", date: "2026-09-29", kind: "challenge", status: "missed", size: 15 },
      { id: "future", date: "2026-10-05", kind: "mock", status: "scheduled", mock: { kind: "adaptive" } },
      { id: "started", date: TODAY, kind: "mock", status: "scheduled", sessionId: "s1", mock: { kind: "adaptive" } },
      { id: "replaced", date: "2026-09-28", kind: "mock", status: "missed", mock: { kind: "practice", testNo: 4 } },
      { id: "r2", date: "2026-10-03", kind: "mock", status: "scheduled", mock: { kind: "practice", testNo: 4 }, replacementFor: "replaced" },
      { id: "sat", date: TODAY, kind: "exam", status: "scheduled" },
    ],
  };
  assert.deepEqual(startDecision(plan, "today", TODAY), { kind: "create", item: plan.items[0] });
  assert.deepEqual(startDecision(plan, "past", TODAY), { kind: "create", item: plan.items[1] }, "a missed challenge can still be done, late");
  assert.deepEqual(startDecision(plan, "started", TODAY), { kind: "resume", sessionId: "s1" });
  assert.deepEqual(startDecision(plan, "future", TODAY), { kind: "refuse", status: 409, error: "This opens on Mon 5 Oct." });
  assert.deepEqual(startDecision(plan, "replaced", TODAY), { kind: "refuse", status: 409, error: "This full exam was moved to Sat 3 Oct — sit it then." });
  assert.equal(startDecision(plan, "sat", TODAY).status, 400);
  assert.equal(startDecision(plan, "nope", TODAY).status, 404);
}

// --- challengeAnalytics: no finished work yet -> the balanced first challenge
assert.equal(challengeAnalytics({ totals: { answered: 0, attempted: 0 } }), null);
assert.equal(challengeAnalytics(null), null);
{
  const a = { totals: { answered: 3, attempted: 3 } };
  assert.equal(challengeAnalytics(a), a);
  // Blank-only finished work is still finished work (final review M12:
  // "answered" leaves blanks out, "attempted" doesn't).
  const blanks = { totals: { answered: 0, attempted: 4 } };
  assert.equal(challengeAnalytics(blanks), blanks);
}

// --- coach-view: streak, week tallies, today's list, the 14-day view
{
  const items = [
    { id: "a", date: "2026-09-28", kind: "challenge", status: "done" },
    { id: "b", date: "2026-09-29", kind: "challenge", status: "late" },
    { id: "c", date: "2026-09-30", kind: "challenge", status: "done" },
    { id: "m", date: "2026-09-30", kind: "mock", status: "done", mock: { kind: "adaptive" } },
    { id: "d", date: "2026-10-01", kind: "challenge", status: "scheduled" },
    { id: "e", date: "2026-10-02", kind: "challenge", status: "scheduled" },
    { id: "x", date: "2026-10-24", kind: "exam", status: "scheduled" },
  ];
  assert.equal(planStreak(items, TODAY), 2, "today's open item doesn't break it; a late one does");
  assert.equal(planStreak(items.map((i) => (i.id === "d" ? { ...i, status: "done" } : i)), TODAY), 3);
  assert.equal(planStreak([], TODAY), 0);
  assert.deepEqual(weekTally(items, TODAY), { scheduled: 5, done: 2, late: 1, missed: 0 }, "challenges and reviews of this Mon-Sun week");
  assert.deepEqual(weekItemsOf(items, TODAY).map((i) => i.id), ["a", "b", "c", "m", "d", "e"]);
}
{
  const items = [
    { id: "m1", date: "2026-09-22", kind: "challenge", status: "missed" },   // 9 days ago: too old
    { id: "m2", date: "2026-09-26", kind: "challenge", status: "missed" },
    { id: "m3", date: "2026-09-27", kind: "challenge", status: "missed", sessionId: "d3" },
    { id: "m4", date: "2026-09-28", kind: "challenge", status: "missed" },
    { id: "m5", date: "2026-09-29", kind: "challenge", status: "missed" },
    { id: "late", date: "2026-09-30", kind: "challenge", status: "late", completedAt: TODAY, sessionId: "d5" },
    { id: "mk", date: "2026-09-30", kind: "mock", status: "missed", mock: { kind: "adaptive" } },
    { id: "rp", date: "2026-10-03", kind: "mock", status: "scheduled", mock: { kind: "adaptive" }, replacementFor: "mk" },
    { id: "t1", date: TODAY, kind: "challenge", status: "scheduled" },
  ];
  assert.deepEqual(todayItems(items, TODAY).map((i) => i.id), ["t1", "late", "m5", "m4"],
    "today's items, then the 3 latest past ones still worth a tap (a replaced full exam never)");
}
{
  const view = planView(first, TODAY);
  assert.deepEqual(view.today.map((i) => i.kind), ["diagnostic"]);
  assert.ok(view.upcoming.every((i) => i.date > TODAY && i.date <= "2026-10-15"), "the next 14 days");
  assert.ok(view.upcoming.some((i) => i.kind === "mock"));
  assert.deepEqual(view.fullExams.map((i) => i.date), first.items.filter((i) => i.kind === "mock").map((i) => i.date));
  assert.equal(view.examDate, "2026-10-24");
  assert.equal(view.horizonEnd, "2026-10-24");
  assert.equal(view.daysToExam, 23);
  const unbooked = planView({ ...first, profileSnapshot: { ...first.profileSnapshot, examDate: null, targetMonth: "2026-12" } }, TODAY);
  assert.equal(unbooked.examDate, null);
  assert.equal(unbooked.horizonEnd, "2026-12-01");
  assert.equal(unbooked.daysToExam, 61);
}

// --- Fix round 1: a full exam dated TODAY is still movable (spec 6.4 "today
// or later") -- it is in the Today list and in fullExams, isMovable says so,
// and checkMove accepts a later day for it.
{
  const firstMock = first.items.find((i) => i.kind === "mock");
  const onTheDay = planView(first, firstMock.date);
  const todays = onTheDay.today.find((i) => i.id === firstMock.id);
  assert.ok(todays, "today's full exam is in the Today list");
  assert.ok(!onTheDay.upcoming.some((i) => i.id === firstMock.id), "and not in the next-14-days list");
  assert.ok(onTheDay.fullExams.some((i) => i.id === firstMock.id), "the move rules see it");
  assert.equal(isMovable(todays), true);
  assert.equal(movesLeft(todays), 2);
  assert.deepEqual(checkMove(onTheDay.fullExams, todays.id, addDays(firstMock.date, 1), firstMock.date, onTheDay.horizonEnd), { ok: true });
  assert.deepEqual(checkMove(onTheDay.fullExams, todays.id, firstMock.date, firstMock.date, onTheDay.horizonEnd), { ok: false, error: "That day already has a full exam." });
  assert.equal(isMovable({ ...todays, sessionId: "s1" }), false, "a started exam stays put");
  assert.equal(isMovable({ ...todays, status: "missed" }), false);
  const twice = { ...todays, moves: [{ from: "a", to: "b", at: "x" }, { from: "b", to: "c", at: "y" }] };
  assert.equal(movesLeft(twice), 0);
  assert.equal(isMovable(twice), false, "at most two moves");
  assert.equal(isMovable({ id: "c", date: TODAY, kind: "challenge", status: "scheduled" }), false, "challenges never move");
}

// --- reminderFor: the cron's "Today's SAT ... is ready"
{
  const challenge = { id: "c", date: TODAY, kind: "challenge", status: "scheduled", size: 15 };
  const mock = { id: "m", date: TODAY, kind: "mock", status: "scheduled", mock: { kind: "practice", testNo: 5 } };
  assert.deepEqual(reminderFor([challenge], TODAY), { title: "Today's SAT challenge is ready", body: "15 questions, picked for what you need most right now." });
  assert.deepEqual(reminderFor([challenge, mock], TODAY), { title: "Today's SAT full exam is ready", body: "Official Practice Test 5 — a full, timed practice exam." });
  assert.equal(reminderFor([{ ...challenge, sessionId: "d1" }], TODAY), null, "already started today: no reminder");
  assert.equal(reminderFor([{ ...challenge, date: "2026-10-02" }], TODAY), null);
  assert.equal(reminderFor([{ id: "x", date: TODAY, kind: "exam", status: "scheduled" }], TODAY), null);
  assert.equal(reminderFor([{ id: "d", date: TODAY, kind: "diagnostic", status: "scheduled", size: 24 }], TODAY).title, "Today's SAT diagnostic is ready");
  assert.equal(reminderFor([{ id: "r", date: TODAY, kind: "review", status: "scheduled", size: 8 }], TODAY).title, "Today's SAT review is ready");
}

// --- analyticsSummary / insightsInputOf / normaliseTipSkills (ruling 9)
{
  const analytics = {
    totals: { answered: 40, attempted: 40 },
    sections: { rw: { answered: 20, correct: 12, accuracy: 0.6 }, math: { answered: 20, correct: 15, accuracy: 0.75 } },
    skills: [
      { key: "a", label: "Alpha", mastery: 0.9, confidence: 4 },
      { key: "b", label: "Beta", mastery: 0.95, confidence: 2 }, // too little data to call strong
      { key: "c", label: "Gamma", mastery: 0.7, confidence: 6 },
      { key: "d", label: "Delta", mastery: 0.8, confidence: 3 },
      { key: "e", label: "Eps", mastery: 0.2, confidence: 9 },
    ],
    weakSkills: ["w1", "w2", "w3", "w4"].map((k, i) => ({ key: k, label: k.toUpperCase(), domain: "algebra", section: "math", mastery: 0.3 + i / 10, priority: 1 - i / 10 })),
    pacingFlags: [{ skill: "e", label: "Eps", medianSec: 150, accuracy: 0.2 }],
    scores: { history: [{ id: "s1", score: { lower: 1000, upper: 1060 } }, { id: "s2", score: { lower: 1100, upper: 1160 } }] },
  };
  const summaryView = analyticsSummary(analytics);
  assert.deepEqual(summaryView.weakSkills.map((w) => w.key), ["w1", "w2", "w3"]);
  assert.equal(summaryView.latestScore.id, "s2");
  assert.deepEqual(summaryView.sections, analytics.sections);

  const view = planView(first, TODAY);
  const built = insightsInputOf({ firstName: "Ayesha Khan", targetScore: 1300, analytics, view, horizonPassed: false, today: TODAY });
  assert.equal(built.firstName, "Ayesha", "the first name only");
  assert.equal(built.daysToExam, 23);
  assert.deepEqual(built.latestScore, { lower: 1100, upper: 1160 });
  assert.deepEqual(built.sections, { rw: { accuracy: 0.6 }, math: { accuracy: 0.75 } });
  assert.deepEqual(built.strongSkills.map((s) => s.label), ["Alpha", "Delta", "Gamma"], "top 3 by mastery with confidence >= 3");
  assert.deepEqual(built.weakSkills[0], { label: "W1", mastery: 0.3 });
  assert.deepEqual(built.pacingFlags, [{ label: "Eps", medianSec: 150, accuracy: 0.2 }]);
  assert.deepEqual(built.week, view.week);
  const firstMock = first.items.find((i) => i.kind === "mock");
  assert.deepEqual(built.nextMock, { date: formatPkDay(firstMock.date), title: "Official Practice Test 4" });
  const passed = insightsInputOf({ firstName: "Ali", targetScore: 1300, analytics: null, view: null, horizonPassed: true, today: TODAY });
  assert.equal(passed.daysToExam, null, "a passed SAT is never a test-day countdown");
  assert.deepEqual(passed.week, { scheduled: 0, done: 0, late: 0, missed: 0 });
  assert.deepEqual(passed.sections, { rw: { accuracy: null }, math: { accuracy: null } });
  assert.equal(passed.nextMock, null);

  const insights = { headline: "h", summary: "s", source: "ai", generatedAt: NOW_ISO, tips: [
    { title: "1", body: "b", skill: "cross-text connections" },
    { title: "2", body: "b", skill: "Made-up skill" },
    { title: "3", body: "b" },
  ] };
  const normalised = normaliseTipSkills(insights, ["Cross-Text Connections", "Boundaries"]);
  assert.equal(normalised.tips[0].skill, "Cross-Text Connections", "the bank's spelling, so Drill this finds questions");
  assert.equal("skill" in normalised.tips[1], false, "an unknown skill gets no Drill button");
  assert.equal("skill" in normalised.tips[2], false);
}

// --- planItemTitle: one name per item wherever it's shown
assert.equal(planItemTitle({ kind: "mock", mock: { kind: "practice", testNo: 9 } }), "Official Practice Test 9");
assert.equal(planItemTitle({ kind: "mock", mock: { kind: "adaptive" } }), "Adaptive mock exam");
assert.equal(planItemTitle({ kind: "challenge" }), "Daily challenge");
assert.equal(planItemTitle({ kind: "review" }), "Review");
assert.equal(planItemTitle({ kind: "diagnostic" }), "Diagnostic");
assert.equal(planItemTitle({ kind: "exam" }), "Your SAT");

// --- formatPkDay: shown plan dates go through formatPk
assert.equal(formatPkDay("2026-10-05"), "Mon 5 Oct");

console.log("sat-coach-plan tests passed");
