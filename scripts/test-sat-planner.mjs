// Tests for the pure SAT planner (src/lib/sat/coach/planner.ts): full-exam
// dates, challenge sizes, plan generation (diagnostic, alternating full
// exams, fixed challenges, review days, the exam item), stable ids on
// regeneration, done/late/missed statuses, the rules for moving a full
// exam, and -- across days -- daily maintenance (missed full exams re-placed
// once, practice tests re-validated) with a full-exam grid that never
// shifts. Dates are PKT calendar days; 2026-10-01 is a Thursday.
import assert from "node:assert/strict";
import {
  MAX_MOCK_MOVES, addDays, applyMove, buildPlan, challengeSize, checkMove, daysBetween, maintainPlan, markStatuses, mockDates,
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
const rebuild = (existing) => plan({ diagnosticId: "diag-1", existing, newId: idGen("new") });
{
  // 10-05 (Mon) -> 10-06 (Tue, not a practice day)
  const moved = applyMove(first, mockOn(first, "2026-10-05").id, "2026-10-06", "2026-10-01T10:00:00.000Z");
  const again = rebuild(moved);
  const mocks = again.filter((i) => i.kind === "mock");
  assert.deepEqual(mocks.map((m) => m.date), ["2026-10-06", "2026-10-12", "2026-10-19"], "the moved exam stays on its new day; no extra exam near it");
  assert.equal(mocks[0].moves.length, 1);
  assert.deepEqual(mocks[0].mock, { kind: "practice", testNo: 4 });
  assert.equal(again.some((i) => i.date === "2026-10-05"), false, "the day the exam left gets no challenge");
  assert.deepEqual(again, moved, "a rebuild after a move changes nothing");
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
  assert.deepEqual(again, twice, "a rebuild after two moves changes nothing");
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
// Across days (fix round 1): buildPlan runs on the first build and on profile
// changes; maintainPlan runs every day. The full-exam grid must never shift.
// ============================================================================

const mockKey = (items) => items.filter((i) => i.kind === "mock").map((i) => `${i.id}@${i.date}`).sort();
const mocksOf = (items) => items.filter((i) => i.kind === "mock");

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

function rebuildOn(items, today, prof, practiceTaken = takenOf(items)) {
  return buildPlan({ today, profile: prof, existing: items, practiceTaken, practiceAvailable: PRACTICE_TESTS, newId: idGen(`r${today}-`) });
}

/** Rule 3, stated declaratively: the earliest practice day from tomorrow to
 *  exam - 2 with no full exam (other than missed ones) within 3 days. */
function nextSuitable(items, today, exam, days) {
  const others = items.filter((i) => i.kind === "mock" && i.status !== "missed").map((i) => i.date);
  for (let day = addDays(today, 1); day <= addDays(exam, -2); day = addDays(day, 1)) {
    if (days.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && others.every((o) => Math.abs(daysBetween(o, day)) >= 4)) return day;
  }
  return null;
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

      // everything done: the full-exam dates never change, and a same-profile
      // full rebuild on any later day adds no full exam and drops no challenge
      let plan = built;
      for (let t = addDays(TODAY, 1); t <= exam; t = addDays(t, 1)) {
        plan = maintain(plan, t, prof);
        assert.deepEqual(mockKey(plan), grid, `${label}, ${t}: the full-exam dates never change`);
        const dates = mocksOf(plan).map((m) => m.date);
        assert.equal(new Set(dates).size, dates.length, `${label}, ${t}: one full exam per day`);
        assert.ok(dates.every((d) => d <= addDays(exam, -2)), `${label}, ${t}: no full exam after exam - 2`);
        if (t === exam) continue;
        const rebuilt = rebuildOn(plan, t, prof);
        assert.deepEqual(mockKey(rebuilt), grid, `${label}, ${t}: a full rebuild adds no full exam`);
        if (daysBetween(t, exam) >= 3) {
          assert.deepEqual(rebuilt, plan, `${label}, ${t}: a same-profile full rebuild is a no-op`);
        } else {
          const covered = new Set(rebuilt.filter((i) => i.kind === "challenge" || i.kind === "review").map((i) => i.date));
          assert.ok(plan.filter((i) => i.kind === "challenge" && i.date >= t).every((c) => covered.has(c.date)), `${label}, ${t}: no practice day lost`);
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

// --- regression (critical): daily full rebuilds never add a second full exam in the final week
{
  const prof = profile({ days: EVERY_DAY, start: { kind: "skip" } });
  let rolling = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("c") });
  for (let t = addDays(TODAY, 1); t < "2026-10-24"; t = addDays(t, 1)) rolling = rebuildOn(markStatuses(rolling, t, allDone(rolling, t)), t, prof);
  assert.deepEqual(mocksOf(rolling).map((m) => m.date), ["2026-10-03", "2026-10-10", "2026-10-17"], "no 10-22 full exam");
}
{
  // exam Sat 12-05, a Monday 11-30 rebuild (d = 5), every set of practice days
  let extra = 0;
  for (let mask = 1; mask < 128; mask++) {
    const days = EVERY_DAY.filter((d) => mask & (1 << d));
    const prof = profile({ examDate: "2026-12-05", days, start: { kind: "skip" } });
    const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("w") });
    const week = rebuildOn(markStatuses(built, "2026-11-30", allDone(built, "2026-11-30")), "2026-11-30", prof);
    if (mocksOf(week).length !== mocksOf(built).length) extra++;
  }
  assert.equal(extra, 0, "no practice-day set gains a full exam in the SAT week");
  const sundays = profile({ examDate: "2026-12-05", days: [0], start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: sundays, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("w") });
  const week = rebuildOn(markStatuses(built, "2026-11-30", allDone(built, "2026-11-30")), "2026-11-30", sundays);
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

// --- a missed exam's day stays covered after its replacement: exam Mon 11-16,
// Sundays only; Sun 10-11 missed -> replacement Sun 10-18; a full rebuild on
// 10-12 re-snaps the 10-14 target (lower bound 10-14) and must not add a full
// exam that Wednesday (it lies 3 days from the missed 10-11, 4 from 10-18)
{
  const prof = profile({ examDate: "2026-11-16", days: [0], start: { kind: "skip" } });
  const built = buildPlan({ today: TODAY, profile: prof, existing: [], practiceTaken: [], practiceAvailable: PRACTICE_TESTS, newId: idGen("k") });
  assert.deepEqual(mocksOf(built).map((m) => m.date), ["2026-10-11", "2026-10-25", "2026-11-08"]);
  const missed = mocksOf(built)[0];
  let plan = built;
  for (let t = "2026-10-02"; t <= "2026-10-12"; t = addDays(t, 1)) plan = maintain(plan, t, prof, { skip: new Set([missed.id]) });
  assert.equal(plan.find((i) => i.replacementFor === missed.id)?.date, "2026-10-18");
  const rebuilt = rebuildOn(plan, "2026-10-12", prof);
  assert.deepEqual(mockKey(rebuilt), mockKey(plan), "no full exam added on Wed 10-14");
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
  const sameDay = rebuildOn(plan, "2026-10-02", prof);
  assert.deepEqual(mockKey(sameDay), grid, "a same-day rebuild after the move adds no full exam (no 10-04 P9)");
  assert.deepEqual(challengeIds(sameDay, "2026-10-02"), challengeIds(plan, "2026-10-02"), "and removes no challenge");
  for (let t = "2026-10-03"; t < "2026-12-03"; t = addDays(t, 1)) {
    const before = challengeIds(plan, t);
    plan = maintain(plan, t, prof);
    assert.deepEqual(mockKey(plan), grid, `${t}: maintenance adds no full exam`);
    assert.deepEqual(challengeIds(plan, t), before, `${t}: maintenance removes no challenge`);
    const rebuilt = rebuildOn(plan, t, prof);
    assert.deepEqual(mockKey(rebuilt), grid, `${t}: a full rebuild adds no full exam`);
    assert.deepEqual(challengeIds(rebuilt, t), before, `${t}: a full rebuild removes no challenge`);
  }
}

// --- a move out of the final stretch does not make the planner refill it:
// exam 10-24, every day; the 10-17 exam moved to 10-13; a full rebuild on
// 10-18 (6 days to go) adds no final-week exam on 10-22
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
    assert.deepEqual(mockKey(rebuildOn(plan, t, prof)), grid, `${t}: a full rebuild adds no full exam after the move`);
  }
}

// --- regression: future practice exams are re-validated against the tests taken
{
  const prof = profile();
  const [m1, m2, m3] = mocksOf(first);
  const expectMocks = (items, label) => assert.deepEqual(mocksOf(items).map((m) => [m.id, m.date, m.mock]), [
    [m1.id, "2026-10-05", { kind: "practice", testNo: 6 }],
    [m2.id, "2026-10-12", { kind: "adaptive" }],
    [m3.id, "2026-10-19", { kind: "practice", testNo: 5 }],
  ], label);
  // Practice Test 4 taken elsewhere: 10-05 moves to the next untaken, unassigned test (5 is 10-19's)
  expectMocks(rebuildOn(first, TODAY, prof, [4]), "full rebuild with practiceTaken [4]");
  expectMocks(maintainPlan({ items: first, today: TODAY, done: {}, practiceTaken: [4], practiceAvailable: PRACTICE_TESTS, examDate: prof.examDate, days: prof.days, newId: idGen("v") }),
    "maintainPlan with practiceTaken [4]");
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
