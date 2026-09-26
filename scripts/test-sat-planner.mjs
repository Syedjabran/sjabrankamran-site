// Tests for the pure SAT planner (src/lib/sat/coach/planner.ts): full-exam
// dates, challenge sizes, plan generation (diagnostic, alternating full
// exams, fixed challenges, review days, the exam item), stable ids on
// regeneration, done/late/missed statuses, the rules for moving a full
// exam, and -- across days -- daily maintenance (missed full exams re-placed
// once, practice tests re-validated) with a full-exam grid that never
// shifts. Dates are PKT calendar days; 2026-10-01 is a Thursday.
import assert from "node:assert/strict";
import {
  MAX_MOCK_MOVES, addDays, applyMove, buildPlan, challengeSize, checkMove, daysBetween, maintainPlan, markStatuses, mockDates, rebuildScope,
} from "../src/lib/sat/coach/planner.ts";

const TODAY = "2026-10-01";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const PRACTICE_TESTS = [4, 5, 6, 7, 8, 9, 10, 11];

function idGen(prefix) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function profile(overrides) {
  return { examDate: "2026-10-24", targetMonth: null, days: [1, 3, 5], minutes: 30, start: { kind: "diagnostic" }, ...overrides };
}

function plan({ profile: profileOverrides, ...rest } = {}) {
  return buildPlan({
    today: TODAY,
    profile: profile(profileOverrides),
    existing: [],
    practiceTaken: [],
    practiceAvailable: PRACTICE_TESTS,
    newId: idGen("id"),
    ...rest,
  });
}

// --- mockDates: the six reference schedules
assert.deepEqual(mockDates(TODAY, "2026-12-05", EVERY_DAY), [
  "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28",
], "every day, 65 days out: weekly Saturdays, last one 7 days out");
assert.deepEqual(mockDates(TODAY, "2026-10-24", [1, 3, 5]), ["2026-10-05", "2026-10-12", "2026-10-19"], "Mon/Wed/Fri: latest practice day in the window");
assert.deepEqual(mockDates(TODAY, "2026-10-06", EVERY_DAY), ["2026-10-03"], "3 <= d < 7: exactly one, snapped to Saturday");
assert.deepEqual(mockDates(TODAY, "2026-10-03", EVERY_DAY), [], "d < 3: no full exams");
assert.deepEqual(mockDates(TODAY, "2027-01-29", [0]), [
  "2026-10-04", "2026-10-18", "2026-11-01", "2026-11-15", "2026-11-29", "2026-12-13", "2026-12-27", "2027-01-10", "2027-01-24",
], "light schedule (Sundays only): every 14 days");
assert.deepEqual(mockDates(TODAY, "2026-11-10", [2, 4]), ["2026-10-08", "2026-10-22", "2026-11-05"], "light schedule (Tue/Thu): every 14 days");

// --- challengeSize
assert.equal(challengeSize(15), 8);
assert.equal(challengeSize(30), 15);
assert.equal(challengeSize(45), 22);
assert.equal(challengeSize(60), 30);
assert.equal(MAX_MOCK_MOVES, 2);

// --- buildPlan: exam 2026-10-24, Mon/Wed/Fri, 30 min, diagnostic start
const first = plan({ diagnosticId: "diag-1" });
{
  assert.equal(first[0].kind, "diagnostic", "the diagnostic is the first item");
  assert.equal(first[0].date, TODAY);
  assert.equal(first[0].size, 24);
  assert.equal(first[0].sessionId, "diag-1");
  assert.equal(first[0].status, "scheduled");

  const mocks = first.filter((i) => i.kind === "mock");
  assert.deepEqual(mocks.map((m) => m.date), ["2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.deepEqual(mocks.map((m) => m.mock), [{ kind: "practice", testNo: 4 }, { kind: "adaptive" }, { kind: "practice", testNo: 5 }],
    "full exams alternate official practice test -> adaptive -> practice test");

  const challenges = first.filter((i) => i.kind === "challenge");
  assert.deepEqual(challenges.map((c) => c.date), ["2026-10-02", "2026-10-07", "2026-10-09", "2026-10-14", "2026-10-16", "2026-10-21", "2026-10-23"],
    "challenges on practice days from the day after the diagnostic, never on a full-exam day");
  assert.ok(challenges.every((c) => c.size === 15), "30 minutes -> 15 questions");

  const exam = first[first.length - 1];
  assert.equal(exam.kind, "exam");
  assert.equal(exam.date, "2026-10-24");
  assert.equal(first.length, 12, "1 diagnostic + 3 full exams + 7 challenges + the exam");
  assert.ok(first.every((i) => i.status === "scheduled"));
  assert.equal(new Set(first.map((i) => i.id)).size, first.length, "ids are unique");
  const sorted = [...first].sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(first.map((i) => i.date), sorted.map((i) => i.date), "sorted by date");
}

// --- regenerating with the first output as `existing` keeps every id
{
  const again = plan({ diagnosticId: "diag-1", existing: first, newId: idGen("new") });
  assert.deepEqual(again.map((i) => i.id), first.map((i) => i.id), "ids are stable on regeneration");
  assert.deepEqual(again, first, "regeneration with the same inputs is a no-op");
}

// --- moves survive rebuilds (spec 6.4): a moved exam stays where it was
// moved to, the challenge on its new day stays, and the day it left gets
// nothing new -- neither a challenge nor a refilled full exam
const mockOn = (items, date) => items.find((i) => i.kind === "mock" && i.date === date);
const rebuild = (existing) => plan({ diagnosticId: "diag-1", existing, newId: idGen("new"), scope: "schedule" });
const resize = (existing) => plan({ diagnosticId: "diag-1", existing, newId: idGen("new"), scope: "sizes", profile: { minutes: 45 } });
const mocksIn = (items) => items.filter((i) => i.kind === "mock");
{
  // 10-05 (Mon) -> 10-06 (Tue, not a practice day)
  const moved = applyMove(first, mockOn(first, "2026-10-05").id, "2026-10-06", "2026-10-01T10:00:00.000Z");
  const again = rebuild(moved);
  const mocks = again.filter((i) => i.kind === "mock");
  assert.deepEqual(mocks.map((m) => m.date), ["2026-10-06", "2026-10-12", "2026-10-19"], "the moved exam stays on its new day; no extra exam near it");
  assert.equal(mocks[0].moves.length, 1);
  assert.deepEqual(mocks[0].mock, { kind: "practice", testNo: 4 });
  assert.equal(again.some((i) => i.date === "2026-10-05"), false, "the day the exam left gets no challenge");
  assert.deepEqual(again, moved, "a schedule edit after a move changes nothing");
  assert.deepEqual(mocksIn(resize(moved)), mocksIn(moved), "a minutes edit moves no full exam");
}
{
  // 10-12 (Mon, full-exam day) -> 10-14 (Wed, challenge day)
  const m2 = mockOn(first, "2026-10-12");
  const challenge14 = first.find((i) => i.kind === "challenge" && i.date === "2026-10-14");
  const moved = applyMove(first, m2.id, "2026-10-14", "2026-10-01T10:00:00.000Z");
  const again = rebuild(moved);
  assert.deepEqual(again.filter((i) => i.date === "2026-10-14").map((i) => [i.kind, i.id]), [["mock", m2.id], ["challenge", challenge14.id]],
    "the 10-14 challenge is still there, next to the moved exam");
  assert.deepEqual(mockOn(again, "2026-10-14").moves, [{ from: "2026-10-12", to: "2026-10-14", at: "2026-10-01T10:00:00.000Z" }], "the move is recorded");
  assert.equal(again.some((i) => i.date === "2026-10-12"), false, "10-12 gets no challenge and no new full exam");
  assert.deepEqual(again.map((i) => i.id), moved.map((i) => i.id), "ids are stable");
  assert.deepEqual(again, moved);
  assert.deepEqual(mocksIn(resize(moved)), mocksIn(moved), "a minutes edit moves no full exam");
}
{
  // 10-12 -> 10-14 -> 10-16: 10-16 is 4 days from 10-12, so without the rule
  // the planner would refill 10-12 with a new full exam
  const m2 = mockOn(first, "2026-10-12");
  const once = applyMove(first, m2.id, "2026-10-14", "2026-10-01T10:00:00.000Z");
  const twice = applyMove(once, m2.id, "2026-10-16", "2026-10-01T10:05:00.000Z");
  const again = rebuild(twice);
  assert.equal(again.some((i) => i.date === "2026-10-12"), false, "the original day gets nothing new");
  assert.ok(again.some((i) => i.kind === "challenge" && i.date === "2026-10-14"), "the challenge on the day it passed through stays");
  assert.ok(again.some((i) => i.kind === "challenge" && i.date === "2026-10-16"), "the challenge on its final day stays");
  // a schedule edit recomputes the grid around the moved exam: 10-16 covers
  // the 10-19 slot (3 days on), so no planner exam sits 3 days from it
  assert.deepEqual(mocksIn(again).map((m) => [m.id, m.date]), [[mocksIn(first)[0].id, "2026-10-05"], [m2.id, "2026-10-16"]]);
  assert.ok(twice.filter((i) => i.kind === "challenge").every((c) => again.some((i) => i.id === c.id)), "no challenge removed");
  assert.deepEqual(mocksIn(resize(twice)), mocksIn(twice), "a minutes edit moves no full exam");
}

// --- practice tests already taken are skipped; once they run out, adaptive only
{
  const someTaken = plan({ practiceTaken: [4, 5] });
  assert.deepEqual(someTaken.filter((i) => i.kind === "mock").map((m) => m.mock),
    [{ kind: "practice", testNo: 6 }, { kind: "adaptive" }, { kind: "practice", testNo: 7 }]);
  const allTaken = plan({ practiceTaken: PRACTICE_TESTS });
  assert.deepEqual(allTaken.filter((i) => i.kind === "mock").map((m) => m.mock), [{ kind: "adaptive" }, { kind: "adaptive" }, { kind: "adaptive" }]);
}

// --- no diagnostic: challenges start today
{
  const skip = plan({ profile: { start: { kind: "skip" }, days: EVERY_DAY, examDate: "2026-10-10" } });
  assert.equal(skip.some((i) => i.kind === "diagnostic"), false);
  assert.equal(skip[0].date, TODAY, "without a diagnostic the first challenge is today");
  assert.equal(skip[0].kind, "challenge");
}

// --- targetMonth plan: horizon ends on the 1st of the month, no exam item
{
  const month = plan({ profile: { examDate: null, targetMonth: "2026-10", start: { kind: "skip" } } });
  assert.equal(month.length, 0, "a horizon on today leaves nothing to plan");
  const nov = plan({ profile: { examDate: null, targetMonth: "2026-11", start: { kind: "skip" } } });
  assert.equal(nov.some((i) => i.kind === "exam"), false, "no exam item for a targetMonth plan");
  assert.ok(nov.every((i) => i.date < "2026-11-01"), "everything before the first of the month");
  assert.ok(nov.some((i) => i.kind === "mock"));
}

// --- d = 2: review days and the exam only
{
  const short = plan({ profile: { examDate: "2026-10-03", start: { kind: "skip" } } });
  assert.deepEqual(short.map((i) => [i.kind, i.date]), [["review", "2026-10-01"], ["review", "2026-10-02"], ["exam", "2026-10-03"]]);
  assert.ok(short.filter((i) => i.kind === "review").every((i) => i.size === 15), "review size = challenge size");
}

// --- past items are copied unchanged; the horizon passing leaves only them
{
  const past = { id: "old", date: "2026-09-28", kind: "challenge", status: "done", size: 15, sessionId: "s0", completedAt: "2026-09-28" };
  const withPast = plan({ existing: [past], profile: { start: { kind: "skip" } } });
  assert.deepEqual(withPast[0], past, "past items are frozen");
  const ended = plan({ existing: [past], profile: { examDate: TODAY } });
  assert.deepEqual(ended, [past], "exam date reached: nothing new is planned");
}

// --- exam day: every item dated today or earlier stays, the exam among them
{
  const examDay = "2026-10-24";
  const lastChallenge = first.find((i) => i.kind === "challenge" && i.date === "2026-10-23");
  const marked = markStatuses(first, examDay, { [lastChallenge.id]: { finishedDate: "2026-10-23", sessionId: "s-last" } });
  const stale = { id: "stale", date: "2026-10-26", kind: "challenge", status: "scheduled", size: 15 };
  const onExamDay = buildPlan({
    today: examDay, profile: profile(), existing: [...marked, stale], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("new"),
  });
  const exam = onExamDay.find((i) => i.kind === "exam");
  assert.ok(exam, "the exam item is still there on exam day");
  assert.equal(exam.id, first[first.length - 1].id);
  assert.equal(exam.date, examDay);
  assert.ok(onExamDay.every((i) => i.date <= examDay), "nothing after today");
  assert.deepEqual(onExamDay, marked, "every earlier item keeps its status");
  assert.equal(onExamDay.find((i) => i.id === lastChallenge.id).status, "done");
}

// --- markStatuses
{
  const items = [
    { id: "c1", date: "2026-09-29", kind: "challenge", status: "scheduled", size: 15 },
    { id: "c2", date: "2026-09-30", kind: "challenge", status: "scheduled", size: 15 },
    { id: "c3", date: "2026-09-30", kind: "challenge", status: "scheduled", size: 15 },
    { id: "m1", date: "2026-09-27", kind: "mock", status: "scheduled", mock: { kind: "adaptive" } },
    { id: "e1", date: "2026-09-30", kind: "exam", status: "scheduled" },
    { id: "c4", date: "2026-10-02", kind: "challenge", status: "scheduled", size: 15 },
  ];
  const marked = markStatuses(items, TODAY, {
    c1: { finishedDate: "2026-09-30", sessionId: "s1" },
    c2: { finishedDate: "2026-09-30", sessionId: "s2" },
  });
  const by = Object.fromEntries(marked.map((i) => [i.id, i]));
  assert.equal(by.c1.status, "late", "finished the next day -> late");
  assert.equal(by.c1.sessionId, "s1");
  assert.equal(by.c1.completedAt, "2026-09-30");
  assert.equal(by.c2.status, "done", "finished on its date -> done");
  assert.equal(by.c3.status, "missed", "unfinished past challenge -> missed");
  assert.equal(by.m1.status, "missed", "unfinished past full exam -> missed");
  assert.equal(by.e1.status, "scheduled", "the exam item is never missed");
  assert.equal(by.c4.status, "scheduled", "future items stay scheduled");
  assert.equal(items[0].status, "scheduled", "markStatuses does not mutate its input");
}

// --- checkMove / applyMove (plan: full exams 10-05, 10-12, 10-19; exam 10-24)
{
  const [m1, m2] = first.filter((i) => i.kind === "mock");
  const challenge = first.find((i) => i.kind === "challenge");
  const exam = "2026-10-24";
  const err = (items, id, date) => {
    const res = checkMove(items, id, date, TODAY, exam);
    assert.equal(res.ok, false, `expected ${id} -> ${date} to be refused`);
    return res.error;
  };
  assert.equal(err(first, "nope", "2026-10-06"), "Only full practice exams can be moved.");
  assert.equal(err(first, challenge.id, "2026-10-06"), "Only full practice exams can be moved.");
  const doneMock = first.map((i) => (i.id === m1.id ? { ...i, status: "done" } : i));
  assert.equal(err(doneMock, m1.id, "2026-10-06"), "This exam can't be moved any more.");
  assert.equal(err(first, m1.id, "2026-09-30"), "Pick today or a later day.");
  assert.equal(err(first, m1.id, "2026-10-23"), "Full exams must be at least 2 days before your SAT.");
  assert.equal(err(first, m1.id, m2.date), "That day already has a full exam.");
  assert.deepEqual(checkMove(first, m1.id, "2026-10-22", TODAY, exam), { ok: true }, "exam - 2 is allowed");
  assert.deepEqual(checkMove(first, m1.id, TODAY, TODAY, exam), { ok: true }, "today is allowed");
  assert.deepEqual(checkMove(first, m1.id, "2026-10-07", TODAY, exam), { ok: true }, "a challenge day is allowed");

  const once = applyMove(first, m1.id, "2026-10-07", "2026-10-01T09:00:00.000Z");
  const movedOnce = once.find((i) => i.id === m1.id);
  assert.equal(movedOnce.date, "2026-10-07");
  assert.deepEqual(movedOnce.moves, [{ from: "2026-10-05", to: "2026-10-07", at: "2026-10-01T09:00:00.000Z" }]);
  assert.ok(once.some((i) => i.kind === "challenge" && i.date === "2026-10-07"), "the challenge on the target day stays");
  assert.equal(once.filter((i) => i.date === "2026-10-05").length, 0, "the old day gets nothing new");
  assert.equal(first.find((i) => i.id === m1.id).date, "2026-10-05", "applyMove does not mutate its input");

  assert.deepEqual(checkMove(once, m1.id, "2026-10-08", TODAY, exam), { ok: true });
  const twice = applyMove(once, m1.id, "2026-10-08", "2026-10-01T09:05:00.000Z");
  assert.deepEqual(twice.find((i) => i.id === m1.id).moves.map((m) => [m.from, m.to]), [["2026-10-05", "2026-10-07"], ["2026-10-07", "2026-10-08"]]);
  assert.equal(err(twice, m1.id, "2026-10-09"), "Each full exam can be moved at most twice.", "a third move is refused");
}

// ============================================================================
// Across days: buildPlan runs on the first build and on a profile edit, with
// the scope rebuildScope gives -- "schedule" (exam date / target month /
// practice days: the grid is recomputed from today around what the student
// did or moved) or "sizes" (minutes only: challenge sizes, no full exam
// moves); maintainPlan runs every day. The full-exam grid never shifts.
// ============================================================================

const mockKey = (items) => items.filter((i) => i.kind === "mock").map((i) => `${i.id}@${i.date}`).sort();
const mocksOf = (items) => items.filter((i) => i.kind === "mock");
const isDaily = (i) => i.kind === "challenge" || i.kind === "review";

/** Everything scheduled before `today` finished on its own date, except `skip` ids. */
function allDone(items, today, skip = new Set()) {
  return Object.fromEntries(items
    .filter((i) => i.date < today && i.status === "scheduled" && i.kind !== "exam" && !skip.has(i.id))
    .map((i) => [i.id, { finishedDate: i.date, sessionId: `s-${i.id}` }]));
}

function takenOf(items) {
  return items.filter((i) => i.kind === "mock" && (i.status === "done" || i.status === "late") && i.mock?.kind === "practice").map((i) => i.mock.testNo);
}

function maintain(items, today, prof, { skip, done, practiceTaken } = {}) {
  const doneMap = done ?? allDone(items, today, skip);
  return maintainPlan({
    items, today, done: doneMap,
    practiceTaken: practiceTaken ?? takenOf(markStatuses(items, today, doneMap)),
    practiceAvailable: PRACTICE_TESTS, examDate: prof.examDate, days: prof.days, newId: idGen(`m${today}-`),
  });
}

/** A schedule edit (exam date / target month / days) on `today`. */
function replan(items, today, prof, practiceTaken = takenOf(items)) {
  return buildPlan({ today, profile: prof, existing: items, practiceTaken, practiceAvailable: PRACTICE_TESTS, newId: idGen(`r${today}-`), scope: "schedule" });
}

/** A minutes-only edit on `today`. */
function resizeOn(items, today, prof, minutes) {
  return buildPlan({ today, profile: { ...prof, minutes }, existing: items, practiceTaken: takenOf(items), practiceAvailable: PRACTICE_TESTS, newId: idGen(`z${today}-`), scope: "sizes" });
}

/** A minutes edit changes nothing but future unstarted challenge/review sizes. */
function assertOnlySizes(before, after, today, minutes, label) {
  const size = challengeSize(minutes);
  const expected = before.map((i) => (isDaily(i) && i.date >= today && i.status === "scheduled" && !i.sessionId ? { ...i, size } : i));
  assert.deepEqual(after, expected, `${label}: a minutes edit only resizes challenges`);
}

/** No two full exams within 3 days unless both were kept from before the edit. */
function assertSpaced(items, keptIds, label) {
  const mocks = mocksOf(items);
  for (const a of mocks) {
    for (const b of mocks) {
      if (a.id < b.id && !(keptIds.has(a.id) && keptIds.has(b.id))) {
        assert.ok(Math.abs(daysBetween(a.date, b.date)) >= 4, `${label}: ${a.date} and ${b.date} are too close`);
      }
    }
  }
}

/** Rule 3, stated declaratively: the earliest practice day from tomorrow to
 *  exam - 2, not moved away from, with no full exam (missed ones aside)
 *  within 3 days. */
function nextSuitable(items, today, exam, days) {
  const others = items.filter((i) => i.kind === "mock" && i.status !== "missed").map((i) => i.date);
  const vacated = new Set(items.flatMap((i) => (i.moves ?? []).map((m) => m.from)));
  for (let day = addDays(today, 1); day <= addDays(exam, -2); day = addDays(day, 1)) {
    if (days.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && !vacated.has(day) && others.every((o) => Math.abs(daysBetween(o, day)) >= 4)) return day;
  }
  return null;
}

// --- rebuildScope: which edits re-plan what
{
  const base = profile();
  assert.equal(rebuildScope(base, { ...base, examDate: "2026-10-31" }), "schedule");
  assert.equal(rebuildScope(base, { ...base, examDate: null, targetMonth: "2026-11" }), "schedule");
  assert.equal(rebuildScope(base, { ...base, days: [1, 3] }), "schedule");
  assert.equal(rebuildScope(base, { ...base, days: [5, 3, 1] }), null, "the same days in another order");
  assert.equal(rebuildScope(base, { ...base, minutes: 45 }), "sizes");
  assert.equal(rebuildScope(base, { ...base, minutes: 45, days: [1, 3] }), "schedule");
  assert.equal(rebuildScope(base, { ...base, start: { kind: "skip" } }), null, "a starting-point edit changes no plan");
  assert.equal(rebuildScope(base, { ...base, targetMonth: "2026-12" }), null, "a target month under a booked date moves no horizon");
  const unbooked = profile({ examDate: null, targetMonth: "2026-11" });
  assert.equal(rebuildScope(unbooked, { ...unbooked, targetMonth: "2026-12" }), "schedule", "a new target month moves the horizon");
  assert.equal(rebuildScope(unbooked, { ...unbooked, examDate: "2026-11-01" }), "schedule", "booking a date adds the exam day");
}

// --- multi-day progression: several profiles, built on day 0, maintained daily
{
  let replacementsMade = 0;
  for (const days of [EVERY_DAY, [1, 3, 5], [0]]) {
    for (const offset of [7, 23, 65, 120]) {
      const exam = addDays(TODAY, offset);
      const prof = profile({ examDate: exam, days, start: { kind: "skip" } });
      const label = `days [${days}], exam ${exam}`;
      const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("b") });
      const grid = mockKey(built);
      assert.ok(grid.length > 0, `${label}: has full exams`);

      // everything done: the full-exam dates never change, and a minutes
      // edit on any day only resizes challenges
      let plan = built;
      for (let t = addDays(TODAY, 1); t <= exam; t = addDays(t, 1)) {
        plan = maintain(plan, t, prof);
        assert.deepEqual(mockKey(plan), grid, `${label}, ${t}: the full-exam dates never change`);
        const dates = mocksOf(plan).map((m) => m.date);
        assert.equal(new Set(dates).size, dates.length, `${label}, ${t}: one full exam per day`);
        assert.ok(dates.every((d) => d <= addDays(exam, -2)), `${label}, ${t}: no full exam after exam - 2`);
        assertOnlySizes(plan, resizeOn(plan, t, prof, 60), t, 60, `${label}, ${t}`);
        if (t === exam) continue;
        // a schedule edit that leaves the profile unchanged is a no-op
        const same = replan(plan, t, prof);
        assert.deepEqual(mockKey(same), grid, `${label}, ${t}: an unchanged-profile schedule edit keeps every full exam`);
        if (daysBetween(t, exam) >= 3) assert.deepEqual(same, plan, `${label}, ${t}: an unchanged-profile schedule edit is a no-op`);
        // adding a practice day on a full-exam day keeps that exam
        const today = mockOn(plan, t);
        const extraDay = EVERY_DAY.find((d) => !days.includes(d));
        if (today && extraDay !== undefined) {
          const widened = replan(plan, t, { ...prof, days: [...days, extraDay].sort() });
          assert.deepEqual(mockOn(widened, t), today, `${label}, ${t}: adding a practice day keeps today's full exam`);
        }
      }

      // the first full exam missed: exactly one replacement, on the next suitable day
      const missedMock = mocksOf(built)[0];
      const detectedOn = addDays(missedMock.date, 1);
      let expected;
      let withMiss = built;
      for (let t = addDays(TODAY, 1); t <= exam; t = addDays(t, 1)) {
        if (t === detectedOn) expected = nextSuitable(withMiss.filter((i) => i.id !== missedMock.id), t, exam, days);
        withMiss = maintain(withMiss, t, prof, { skip: new Set([missedMock.id]) });
        const replacements = withMiss.filter((i) => i.replacementFor === missedMock.id);
        assert.ok(replacements.length <= 1, `${label}, ${t}: at most one replacement`);
      }
      assert.equal(withMiss.find((i) => i.id === missedMock.id).status, "missed");
      const replacements = withMiss.filter((i) => i.replacementFor === missedMock.id);
      if (expected) {
        assert.equal(replacements.length, 1, `${label}: exactly one replacement`);
        const [replacement] = replacements;
        assert.equal(replacement.kind, "mock");
        assert.equal(replacement.date, expected, `${label}: the replacement is on the next suitable day`);
        assert.deepEqual(replacement.mock, missedMock.mock, `${label}: the replacement sits the same exam`);
        assert.deepEqual(mockKey(withMiss), [...grid, `${replacement.id}@${replacement.date}`].sort(), `${label}: nothing else moved`);
        assert.equal(withMiss.some((i) => i.kind === "challenge" && i.date === replacement.date), false, "the replacement takes over that day's challenge");
        replacementsMade++;
      } else {
        assert.equal(replacements.length, 0, `${label}: no suitable day, no replacement`);
        assert.deepEqual(mockKey(withMiss), grid, `${label}: nothing else moved`);
      }
    }
  }
  assert.ok(replacementsMade >= 6, `replacements were exercised (${replacementsMade})`);
}

// --- an exam-date change, then later edits: the recomputed grid holds
// (reduced drift sweep; the full sweep is the reviewer's drift-sweep script)
{
  let scenarios = 0;
  for (const days of [EVERY_DAY, [1, 3, 5], [0], [0, 1, 4], [0, 6], [2, 4]]) {
    for (const shift of [-14, -7, -3, 3, 7, 14]) {
      for (const changeOn of ["2026-10-06", "2026-10-10", "2026-10-20"]) {
        const before = profile({ examDate: "2026-11-19", days, start: { kind: "skip" } });
        const after = { ...before, examDate: addDays("2026-11-19", shift) };
        const label = `days [${days}], exam 11-19 -> ${after.examDate} on ${changeOn}`;
        let plan = buildPlan({ today: TODAY, profile: before, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("d") });
        for (let t = addDays(TODAY, 1); t <= changeOn; t = addDays(t, 1)) plan = maintain(plan, t, before);
        const kept = mocksOf(plan).filter((m) => m.date < changeOn || m.moves || m.sessionId);
        plan = replan(plan, changeOn, after);
        for (const m of kept) assert.deepEqual(plan.find((i) => i.id === m.id), m, `${label}: kept ${m.date}`);
        assertSpaced(plan, new Set(kept.map((m) => m.id)), label);
        assert.ok(mocksOf(plan).every((m) => m.date < changeOn || m.date <= addDays(after.examDate, -2)), `${label}: nothing after exam - 2`);
        const grid = mockKey(plan);
        for (let t = addDays(changeOn, 1); t < after.examDate; t = addDays(t, 1)) {
          plan = maintain(plan, t, after);
          assert.deepEqual(mockKey(plan), grid, `${label}, ${t}: the recomputed grid holds`);
          assertOnlySizes(plan, resizeOn(plan, t, after, 45), t, 45, `${label}, ${t}`);
          assert.deepEqual(mockKey(replan(plan, t, after)), grid, `${label}, ${t}: a later unchanged-profile schedule edit keeps the grid`);
        }
        scenarios++;
      }
    }
  }
  assert.equal(scenarios, 108);
}

// --- regression (repro A): Sundays only, exam 11-19 -> 11-09 on 10-10, then a
// minutes edit on 10-17 added a full exam on Wed 10-21 (breaking 14-day spacing)
{
  const before = profile({ examDate: "2026-11-19", days: [0], start: { kind: "skip" } });
  const after = { ...before, examDate: "2026-11-09" };
  let plan = buildPlan({ today: TODAY, profile: before, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("a") });
  for (let t = "2026-10-02"; t <= "2026-10-10"; t = addDays(t, 1)) plan = maintain(plan, t, before);
  plan = replan(plan, "2026-10-10", after);
  assert.deepEqual(mocksOf(plan).filter((m) => m.date >= "2026-10-10").map((m) => m.date), ["2026-10-18", "2026-11-01"], "recomputed for the new date");
  for (let t = "2026-10-11"; t <= "2026-10-17"; t = addDays(t, 1)) plan = maintain(plan, t, after);
  const edited = resizeOn(plan, "2026-10-17", after, 45);
  assert.deepEqual(mockKey(edited), mockKey(plan), "the minutes edit adds no full exam (no Wed 10-21)");
}

// --- regression (repro B): days Sun/Mon/Thu, exam 11-19 -> 11-22 on 10-10, a
// minutes edit on 11-14 (8 days to go) added a full exam on Mon 11-16 and
// dropped that day's challenge
{
  const before = profile({ examDate: "2026-11-19", days: [0, 1, 4], start: { kind: "skip" } });
  const after = { ...before, examDate: "2026-11-22" };
  let plan = buildPlan({ today: TODAY, profile: before, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("b2") });
  for (let t = "2026-10-02"; t <= "2026-10-10"; t = addDays(t, 1)) plan = maintain(plan, t, before);
  plan = replan(plan, "2026-10-10", after);
  for (let t = "2026-10-11"; t <= "2026-11-14"; t = addDays(t, 1)) plan = maintain(plan, t, after);
  const challenge16 = plan.find((i) => i.kind === "challenge" && i.date === "2026-11-16");
  assert.ok(challenge16, "Mon 11-16 holds a challenge");
  const edited = resizeOn(plan, "2026-11-14", after, 45);
  assert.equal(mockOn(edited, "2026-11-16"), undefined, "no full exam added on 11-16");
  assert.ok(edited.some((i) => i.id === challenge16.id), "the 11-16 challenge stays");
}

// --- regression: a schedule edit keeps today's and tomorrow's full exams.
// Exam 10-24, Mon/Wed/Fri, everything done through Mon 10-12; on 10-12 the
// student adds Tuesday. Before the fix today's exam vanished and 10-19 P5
// became adaptive.
{
  const prof = profile({ start: { kind: "skip" } });
  let plan = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("t") });
  for (let t = "2026-10-02"; t <= "2026-10-12"; t = addDays(t, 1)) plan = maintain(plan, t, prof);
  const todays = mockOn(plan, "2026-10-12");
  const next = mockOn(plan, "2026-10-19");
  assert.deepEqual([todays.mock, next.mock], [{ kind: "adaptive" }, { kind: "practice", testNo: 5 }]);
  const widened = replan(plan, "2026-10-12", { ...prof, days: [1, 2, 3, 5] });
  assert.deepEqual(mockOn(widened, "2026-10-12"), todays, "today's full exam stays, id and all");
  assert.deepEqual(mockOn(widened, "2026-10-19"), next, "10-19 stays Practice Test 5");
  assert.deepEqual(widened.filter((i) => i.date >= "2026-10-12" && i.date < "2026-10-19").map((i) => [i.date, i.kind]),
    [["2026-10-12", "mock"], ["2026-10-13", "challenge"], ["2026-10-14", "challenge"], ["2026-10-16", "challenge"]], "Tuesday gets a challenge");
  // tomorrow's exam too: the same edit on Sun 10-11
  let sunday = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("u") });
  for (let t = "2026-10-02"; t <= "2026-10-11"; t = addDays(t, 1)) sunday = maintain(sunday, t, prof);
  const tomorrows = mockOn(sunday, "2026-10-12");
  assert.deepEqual(mockOn(replan(sunday, "2026-10-11", { ...prof, days: [1, 2, 3, 5] }), "2026-10-12"), tomorrows, "tomorrow's full exam stays");
}

// --- after an exam-date change, a later schedule edit sees the same grid:
// days Sun/Mon/Tue, exam 11-19 -> 11-16 on Sat 10-10. Today's 10-10 exam is
// kept and covers the new grid's 10-14 slot (it snaps to 10-13 that day);
// on 10-12 the same slot snaps to Wed 10-14 (lower bound 10-14), 4 days on,
// so without the unbounded-snap check an unchanged edit would add it.
{
  const before = profile({ examDate: "2026-11-19", days: [0, 1, 2], start: { kind: "skip" } });
  const after = { ...before, examDate: "2026-11-16" };
  let plan = buildPlan({ today: TODAY, profile: before, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("s") });
  for (let t = "2026-10-02"; t <= "2026-10-10"; t = addDays(t, 1)) plan = maintain(plan, t, before);
  plan = replan(plan, "2026-10-10", after);
  assert.deepEqual(mocksOf(plan).map((m) => m.date), ["2026-10-03", "2026-10-10", "2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"]);
  for (let t = "2026-10-11"; t <= "2026-10-12"; t = addDays(t, 1)) plan = maintain(plan, t, after);
  const again = replan(plan, "2026-10-12", after);
  assert.equal(mockOn(again, "2026-10-14"), undefined, "no full exam on Wed 10-14");
  assert.deepEqual(again, plan, "the unchanged-profile schedule edit is a no-op");
}

// --- a date change keeps done, late, missed, started and moved full exams (ids and all)
{
  const before = profile({ examDate: "2026-12-05", days: EVERY_DAY, start: { kind: "skip" } });
  let plan = buildPlan({ today: TODAY, profile: before, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("h") });
  const lateOne = mockOn(plan, "2026-10-10");
  const missedOne = mockOn(plan, "2026-10-17");
  for (let t = "2026-10-02"; t <= "2026-10-31"; t = addDays(t, 1)) {
    const done = allDone(plan, t, new Set([missedOne.id, lateOne.id]));
    if (t === "2026-10-11") done[lateOne.id] = { finishedDate: "2026-10-11", sessionId: "s-late" };
    plan = maintain(plan, t, before, { done });
  }
  const started = mockOn(plan, "2026-10-31");
  plan = plan.map((i) => (i.id === started.id ? { ...i, sessionId: "s-running" } : i));
  const toMove = mockOn(plan, "2026-11-07");
  assert.deepEqual(checkMove(plan, toMove.id, "2026-11-05", "2026-10-31", before.examDate), { ok: true });
  plan = applyMove(plan, toMove.id, "2026-11-05", "2026-10-31T09:00:00.000Z");
  const keep = mocksOf(plan).filter((m) => m.date < "2026-10-31" || m.id === started.id || m.id === toMove.id);
  assert.deepEqual(keep.map((m) => m.status).filter((s, i, all) => all.indexOf(s) === i).sort(), ["done", "late", "missed", "scheduled"]);
  const after = { ...before, examDate: "2026-12-12" };
  const replanned = replan(plan, "2026-10-31", after);
  for (const m of keep) assert.deepEqual(replanned.find((i) => i.id === m.id), m, `kept ${m.date} (${m.status})`);
  assertSpaced(replanned, new Set(keep.map((m) => m.id)), "after the date change");
  assert.deepEqual(mocksOf(replanned).filter((m) => m.date > "2026-11-05").map((m) => m.date), ["2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05"],
    "the grid is recomputed for 12-12 around the kept exams");
}

// --- regression (critical): an exam-date change in the final week never adds a second full exam
{
  const prof = profile({ days: EVERY_DAY, start: { kind: "skip" } });
  let plan = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("c") });
  for (let t = "2026-10-02"; t <= "2026-10-19"; t = addDays(t, 1)) plan = maintain(plan, t, prof);
  const nudged = replan(plan, "2026-10-19", { ...prof, examDate: "2026-10-25" });
  assert.deepEqual(mocksOf(nudged).map((m) => m.date), ["2026-10-03", "2026-10-10", "2026-10-17"], "no final-week exam: 10-17 is within 7 days of exam - 2");
  const later = replan(plan, "2026-10-19", { ...prof, examDate: "2026-10-31" });
  assert.deepEqual(mocksOf(later).map((m) => m.date), ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"], "a week later: one more, a week on");
}
{
  // exam Sat 12-05, a schedule edit on Mon 11-30 (d = 5), every set of practice days
  let extra = 0;
  for (let mask = 1; mask < 128; mask++) {
    const days = EVERY_DAY.filter((d) => mask & (1 << d));
    const prof = profile({ examDate: "2026-12-05", days, start: { kind: "skip" } });
    const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("w") });
    const week = replan(markStatuses(built, "2026-11-30", allDone(built, "2026-11-30")), "2026-11-30", prof);
    if (mocksOf(week).length !== mocksOf(built).length) extra++;
  }
  assert.equal(extra, 0, "no practice-day set gains a full exam in the SAT week");
  const sundays = profile({ examDate: "2026-12-05", days: [0], start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: sundays, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("w") });
  const week = replan(markStatuses(built, "2026-11-30", allDone(built, "2026-11-30")), "2026-11-30", sundays);
  assert.equal(mocksOf(week).at(-1).date, "2026-11-29", "Sundays only: 11-29 stays the last full exam (no 12-03)");
}

// --- regression: a missed full exam is re-placed once (exam 10-24, Mon/Wed/Fri)
{
  const prof = profile();
  const m1 = mockOn(first, "2026-10-05");
  const skip = new Set([m1.id]);
  const day6 = maintain(first, "2026-10-06", prof, { skip });
  assert.equal(day6.find((i) => i.id === m1.id).status, "missed");
  const replacement = day6.find((i) => i.replacementFor === m1.id);
  assert.ok(replacement, "the missed 10-05 exam gets a replacement");
  assert.equal(replacement.date, "2026-10-07", "next practice day at least 4 days from 10-12");
  assert.deepEqual(replacement.mock, { kind: "practice", testNo: 4 });
  assert.equal(day6.some((i) => i.kind === "challenge" && i.date === "2026-10-07"), false, "it takes over the 10-07 challenge");
  assert.deepEqual(maintain(day6, "2026-10-06", prof, { skip }), day6, "maintainPlan is idempotent on the same day");
  let later = day6;
  for (let t = "2026-10-07"; t <= "2026-10-15"; t = addDays(t, 1)) later = maintain(later, t, prof, { skip });
  assert.deepEqual(mocksOf(later).map((m) => [m.date, m.status, m.mock]), [
    ["2026-10-05", "missed", { kind: "practice", testNo: 4 }],
    ["2026-10-07", "done", { kind: "practice", testNo: 4 }],
    ["2026-10-12", "done", { kind: "adaptive" }],
    ["2026-10-19", "scheduled", { kind: "practice", testNo: 5 }],
  ]);
}

// --- a replacement never lands on a day a full exam was moved away from:
// Sundays only, exam 11-16; 10-25 moved to Tue 10-20; 10-11 missed -> 11-01
{
  const prof = profile({ examDate: "2026-11-16", days: [0], start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("q") });
  assert.deepEqual(mocksOf(built).map((m) => m.date), ["2026-10-11", "2026-10-25", "2026-11-08"]);
  const missed = mockOn(built, "2026-10-11");
  let plan = applyMove(built, mockOn(built, "2026-10-25").id, "2026-10-20", "2026-10-05T09:00:00.000Z");
  for (let t = "2026-10-02"; t <= "2026-10-12"; t = addDays(t, 1)) plan = maintain(plan, t, prof, { skip: new Set([missed.id]) });
  assert.equal(plan.find((i) => i.replacementFor === missed.id)?.date, "2026-11-01", "not on the vacated 10-25");
}

// --- a started full exam that runs past midnight is not replaced; it can still finish late
{
  const prof = profile();
  const m1 = mockOn(first, "2026-10-05");
  const running = first.map((i) => (i.id === m1.id ? { ...i, sessionId: "s-running" } : i));
  const day6 = maintain(running, "2026-10-06", prof, { skip: new Set([m1.id]) });
  assert.equal(day6.find((i) => i.id === m1.id).status, "missed");
  assert.equal(day6.some((i) => i.replacementFor === m1.id), false, "no replacement for a started exam");
  const day7 = maintain(day6, "2026-10-07", prof, { done: { [m1.id]: { finishedDate: "2026-10-06", sessionId: "s-running" } } });
  assert.equal(day7.find((i) => i.id === m1.id).status, "late");
}

// --- a missed exam's day stays covered after its replacement: exam Mon 11-16,
// Sundays only; Sun 10-11 missed -> replacement Sun 10-18; a schedule edit on
// 10-12 recomputes the 10-14 target (lower bound 10-14) and must not put a
// full exam on that Wednesday (3 days from the missed 10-11)
{
  const prof = profile({ examDate: "2026-11-16", days: [0], start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("k") });
  const missed = mocksOf(built)[0];
  let plan = built;
  for (let t = "2026-10-02"; t <= "2026-10-12"; t = addDays(t, 1)) plan = maintain(plan, t, prof, { skip: new Set([missed.id]) });
  assert.equal(plan.find((i) => i.replacementFor === missed.id)?.date, "2026-10-18");
  const replanned = replan(plan, "2026-10-12", prof);
  assert.equal(mockOn(replanned, "2026-10-14"), undefined, "no full exam on Wed 10-14");
  assertOnlySizes(plan, resizeOn(plan, "2026-10-12", prof, 45), "2026-10-12", 45, "minutes edit after the replacement");
  // the replacement moved by the student to Mon 10-19 is kept by a schedule
  // edit; 10-14 is 5 days from it and 4 from the day it left, so only the
  // missed 10-11 covers that Wednesday
  const replacement = plan.find((i) => i.replacementFor === missed.id);
  assert.deepEqual(checkMove(plan, replacement.id, "2026-10-19", "2026-10-12", prof.examDate), { ok: true });
  const movedRepl = replan(applyMove(plan, replacement.id, "2026-10-19", "2026-10-12T09:00:00.000Z"), "2026-10-12", prof);
  assert.equal(mockOn(movedRepl, "2026-10-19")?.id, replacement.id, "the moved replacement is kept");
  assert.equal(mockOn(movedRepl, "2026-10-14"), undefined, "still no full exam on Wed 10-14");
}

// --- regression: a legal move never shifts the grid (exam 12-05, every day)
{
  const prof = profile({ examDate: "2026-12-05", days: EVERY_DAY, start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("g") });
  const day2 = maintain(built, "2026-10-02", prof);
  const m1 = mockOn(day2, "2026-10-03");
  assert.deepEqual(checkMove(day2, m1.id, "2026-10-08", "2026-10-02", prof.examDate), { ok: true });
  let plan = applyMove(day2, m1.id, "2026-10-08", "2026-10-02T09:00:00.000Z");
  const grid = mockKey(plan);
  const challengeIds = (items, from) => items.filter((i) => i.kind === "challenge" && i.date >= from).map((i) => i.id);
  // a same-day schedule edit after the move: no full exam re-fills the day it
  // left (no 10-04 P9) and no challenge goes; the grid is recomputed around
  // the moved exam, whose new day covers the 10-10 slot two days later
  const sameDay = replan(plan, "2026-10-02", prof);
  assert.ok(mocksOf(sameDay).every((m) => plan.some((i) => i.id === m.id && i.date === m.date)), "a same-day schedule edit adds no full exam");
  assert.equal(mockOn(sameDay, "2026-10-04"), undefined, "no 10-04 P9");
  assert.ok(challengeIds(plan, "2026-10-02").every((id) => sameDay.some((i) => i.id === id)), "and removes no challenge");
  assertSpaced(sameDay, new Set([m1.id]), "after the same-day schedule edit");
  for (let t = "2026-10-03"; t < "2026-12-03"; t = addDays(t, 1)) {
    const before = challengeIds(plan, t);
    plan = maintain(plan, t, prof);
    assert.deepEqual(mockKey(plan), grid, `${t}: maintenance adds no full exam`);
    assert.deepEqual(challengeIds(plan, t), before, `${t}: maintenance removes no challenge`);
    assertOnlySizes(plan, resizeOn(plan, t, prof, 15), t, 15, t);
  }
}

// --- a move out of the final stretch does not make the planner refill it:
// exam 10-24, every day; the 10-17 exam moved to 10-13; a schedule edit on
// any later day (6 days to go on 10-18) adds no final-week exam on 10-22
{
  const prof = profile({ days: EVERY_DAY, start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("f") });
  let plan = built;
  for (let t = "2026-10-02"; t <= "2026-10-12"; t = addDays(t, 1)) plan = maintain(plan, t, prof);
  const last = mockOn(plan, "2026-10-17");
  assert.deepEqual(checkMove(plan, last.id, "2026-10-13", "2026-10-12", prof.examDate), { ok: true });
  plan = applyMove(plan, last.id, "2026-10-13", "2026-10-12T09:00:00.000Z");
  const grid = mockKey(plan);
  for (let t = "2026-10-13"; t <= "2026-10-21"; t = addDays(t, 1)) {
    plan = maintain(plan, t, prof);
    assert.deepEqual(mockKey(replan(plan, t, prof)), grid, `${t}: a schedule edit adds no full exam after the move`);
  }
}

// --- regression: future practice exams are re-validated against the tests taken
{
  const prof = profile();
  const [m1, m2, m3] = mocksOf(first);
  // Practice Test 4 taken elsewhere. Daily maintenance moves 10-05 to the next
  // untaken, unassigned test (5 belongs to 10-19); a schedule edit re-deals
  // the recomputed grid in order.
  const maintained = maintainPlan({ items: first, today: TODAY, done: {}, practiceTaken: [4], practiceAvailable: PRACTICE_TESTS, examDate: prof.examDate, days: prof.days, newId: idGen("v") });
  assert.deepEqual(mocksOf(maintained).map((m) => [m.id, m.date, m.mock]), [
    [m1.id, "2026-10-05", { kind: "practice", testNo: 6 }],
    [m2.id, "2026-10-12", { kind: "adaptive" }],
    [m3.id, "2026-10-19", { kind: "practice", testNo: 5 }],
  ], "maintainPlan with practiceTaken [4]");
  assert.deepEqual(mocksOf(replan(first, TODAY, prof, [4])).map((m) => [m.id, m.date, m.mock]), [
    [m1.id, "2026-10-05", { kind: "practice", testNo: 5 }],
    [m2.id, "2026-10-12", { kind: "adaptive" }],
    [m3.id, "2026-10-19", { kind: "practice", testNo: 6 }],
  ], "schedule edit with practiceTaken [4]: same days and ids, tests in order");
  const allTaken = maintainPlan({ items: first, today: TODAY, done: {}, practiceTaken: PRACTICE_TESTS, practiceAvailable: PRACTICE_TESTS, examDate: prof.examDate, days: prof.days, newId: idGen("v") });
  assert.deepEqual(mocksOf(allTaken).map((m) => m.mock), [{ kind: "adaptive" }, { kind: "adaptive" }, { kind: "adaptive" }], "no untaken test left: adaptive");
}
{
  // 10-19 P5 missed -> replaced by P5 on 10-21; then the missed one is finished late on 10-20
  const prof = profile();
  const m3 = mockOn(first, "2026-10-19");
  const skip = new Set([m3.id]);
  let plan = first;
  for (let t = "2026-10-02"; t <= "2026-10-20"; t = addDays(t, 1)) plan = maintain(plan, t, prof, { skip });
  const replacement = plan.find((i) => i.replacementFor === m3.id);
  assert.ok(replacement, "the missed 10-19 exam gets a replacement");
  assert.equal(replacement.date, "2026-10-21");
  assert.deepEqual(replacement.mock, { kind: "practice", testNo: 5 });
  const lateDone = maintain(plan, "2026-10-20", prof, { done: { [m3.id]: { finishedDate: "2026-10-20", sessionId: "s-late" } }, practiceTaken: [4, 5] });
  assert.equal(lateDone.find((i) => i.id === m3.id).status, "late");
  const moved = lateDone.find((i) => i.id === replacement.id);
  assert.equal(moved.date, "2026-10-21", "id and date kept");
  assert.deepEqual(moved.mock, { kind: "practice", testNo: 6 }, "the replacement no longer repeats Practice Test 5");
}

console.log("sat-planner tests passed");
