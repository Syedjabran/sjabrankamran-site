// src/lib/sat/coach/planner.ts
//
// Pure SAT study planner (Node-testable, no server-only imports, no answer
// data): turns the student's SAT date, practice days and minutes into a
// dated plan of daily challenges, full practice exams ("mocks"), review days
// and the exam itself (buildPlan -- on the first build, and on a profile edit
// with the scope rebuildScope gives); keeps it day to day (maintainPlan --
// statuses, missed full exams re-placed once, practice tests re-validated);
// and enforces the rules for moving a full exam (SAT Coach spec section 6).
//
// Dates are PKT calendar days "YYYY-MM-DD". All arithmetic runs on UTC
// midnights built from those strings, so the host timezone never shifts a
// day; weekday = getUTCDay() (0 = Sunday ... 6 = Saturday).
//
// Full-exam dates (mockDates), exact:
//   d = days(today -> exam). d < 3 -> none. 3 <= d < 7 -> one target
//   exam - 2, snapped with lower bound today. d >= 7 -> light = fewer than 3
//   practice days; t = exam - 5; while t >= today + 2: s = snap(t, days,
//   today + 2); keep s if it is >= 4 days before the previously kept date;
//   t -= (light || exam - t > 56) ? 14 : 7.
//   snap(t, days, lo): of t, t-1, t-2, t-3 that are >= lo, the practice days
//   win -- Saturday, else Sunday, else the latest; with no practice day among
//   them, t itself when t >= lo, else nothing.
import type { PlanItem } from "../client-types.ts";

export type { PlanItem } from "../client-types.ts";

export type PlannerProfile = {
  examDate: string | null;
  targetMonth: string | null;
  days: number[];
  minutes: 15 | 30 | 45 | 60;
  start: { kind: string };
};

export const MAX_MOCK_MOVES = 2;

const DIAGNOSTIC_SIZE = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const SATURDAY = 6;
const SUNDAY = 0;
const KIND_ORDER: Record<PlanItem["kind"], number> = { diagnostic: 0, mock: 1, challenge: 2, review: 3, exam: 4 };
const CHALLENGE_SIZE: Record<PlannerProfile["minutes"], number> = { 15: 8, 30: 15, 45: 22, 60: 30 };

// --- Calendar-day helpers ----------------------------------------------------

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** `day` shifted by `n` calendar days ("2026-10-01", 3 -> "2026-10-04"). */
export function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
}

function weekday(day: string): number {
  return new Date(dayMs(day)).getUTCDay();
}

/** Where the plan ends: the exam date, or the first day of the target month
 *  when the SAT is not booked yet; null when neither is set. */
export function horizonEnd(profile: Pick<PlannerProfile, "examDate" | "targetMonth">): string | null {
  if (profile.examDate) return profile.examDate;
  return profile.targetMonth ? `${profile.targetMonth}-01` : null;
}

function sortPlan(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

// --- Sizes and full-exam dates -----------------------------------------------

/** Questions per challenge (and review day) for a session length. */
export function challengeSize(minutes: 15 | 30 | 45 | 60): number {
  return CHALLENGE_SIZE[minutes];
}

function snap(target: string, days: number[], lo: string): string | null {
  const candidates = [0, 1, 2, 3].map((back) => addDays(target, -back)).filter((day) => day >= lo);
  const practice = candidates.filter((day) => days.includes(weekday(day)));
  if (practice.length > 0) {
    // candidates run latest-first, so practice[0] is the latest practice day
    return practice.find((day) => weekday(day) === SATURDAY) ?? practice.find((day) => weekday(day) === SUNDAY) ?? practice[0];
  }
  return target >= lo ? target : null;
}

/** The full-exam dates for a plan from `today` to `exam`, ascending. */
export function mockDates(today: string, exam: string, days: number[]): string[] {
  const d = daysBetween(today, exam);
  if (d < 3) return [];
  if (d < 7) {
    const only = snap(addDays(exam, -2), days, today);
    return only ? [only] : [];
  }
  const light = isLight(days);
  const lo = addDays(today, 2);
  const picked: string[] = [];
  for (let t = addDays(exam, -5); t >= lo; t = addDays(t, light || daysBetween(t, exam) > 56 ? -14 : -7)) {
    const s = snap(t, days, lo);
    const previous = picked[picked.length - 1];
    if (s && (previous === undefined || daysBetween(s, previous) >= 4)) picked.push(s);
  }
  return picked.sort();
}

// --- Plan generation ---------------------------------------------------------
//
// Two entry points (spec 6.5): buildPlan runs on the first build and on a
// profile edit, re-planning only what the edit changes (rebuildScope):
//   "schedule" (exam date / target month / practice days): future scheduled
//     full exams that were neither moved nor started are dropped and the
//     grid is recomputed from today; everything the student did or chose --
//     done, late, missed, started and moved full exams -- stays;
//   "sizes" (minutes only): future challenge/review sizes change, nothing
//     else (no full exam moves);
//   no scope (anything else): the plan does not change.
// maintainPlan (below) is the DAILY step. A recomputed target counts as
// covered when a kept full exam (whatever its status -- a missed one is
// covered by its replacement or deliberately left unreplaced) or a day one
// was moved away from lies within 3 days of it (the snap window).

/** Started or finished: recorded work, so a regeneration never replaces it. */
function isStarted(item: PlanItem): boolean {
  return Boolean(item.sessionId) || item.status !== "scheduled";
}

function isLight(days: number[]): boolean {
  return new Set(days).size < 3;
}

function withinThreeDays(a: string, b: string): boolean {
  return Math.abs(daysBetween(a, b)) <= 3;
}

function sortedTests(practiceAvailable: number[]): number[] {
  return [...new Set(practiceAvailable)].sort((a, b) => a - b);
}

/** The official practice test a full exam holds -- none once it was missed,
 *  so its replacement or a later exam may sit that test. */
function heldTest(item: PlanItem): number | null {
  return item.kind === "mock" && item.status !== "missed" && item.mock?.kind === "practice" ? item.mock.testNo : null;
}

/** Every day a full exam was moved away from. Spec 6.4: the old day gets
 *  nothing new -- no new challenge and no refilled full exam. */
function vacatedDays(plan: PlanItem[]): Set<string> {
  return new Set(plan.flatMap((i) => (i.kind === "mock" ? (i.moves ?? []).map((move) => move.from) : [])));
}

/** Future scheduled practice exams whose test is already taken, or held by
 *  an earlier full exam, move to the next untaken, unassigned test
 *  (ascending), else become the adaptive mock; id and date stay. */
function revalidatePractice(items: PlanItem[], today: string, practiceTaken: number[], practiceAvailable: number[]): PlanItem[] {
  const used = new Set(practiceTaken);
  const stale: PlanItem[] = [];
  for (const item of sortPlan(items)) {
    const testNo = heldTest(item);
    if (testNo === null) continue;
    if (used.has(testNo) && item.date >= today && !isStarted(item)) stale.push(item);
    else used.add(testNo);
  }
  if (stale.length === 0) return items;
  const tests = sortedTests(practiceAvailable);
  const reassigned = new Map<string, NonNullable<PlanItem["mock"]>>();
  for (const item of stale) {
    const testNo = tests.find((n) => !used.has(n));
    if (testNo !== undefined) used.add(testNo);
    reassigned.set(item.id, testNo === undefined ? { kind: "adaptive" } : { kind: "practice", testNo });
  }
  return items.map((item) => {
    const mock = reassigned.get(item.id);
    return mock ? { ...item, mock } : item;
  });
}

type BuildInput = {
  today: string;
  profile: PlannerProfile;
  existing: PlanItem[];
  practiceTaken: number[];
  practiceAvailable: number[];
  newId: () => string;
  diagnosticId?: string | null;
  scope?: RebuildScope;          // default "schedule" (and a first build is one)
};

export type RebuildScope = "schedule" | "sizes";

/** What a profile edit re-plans: the schedule when the exam date, target
 *  month or practice days change; only the challenge sizes when only the
 *  minutes change; null (nothing) for any other field (target score,
 *  starting point). */
export function rebuildScope(previous: PlannerProfile, next: PlannerProfile): RebuildScope | null {
  const daySet = (days: number[]) => [...new Set(days)].sort((a, b) => a - b).join();
  if (previous.examDate !== next.examDate || previous.targetMonth !== next.targetMonth || daySet(previous.days) !== daySet(next.days)) return "schedule";
  return previous.minutes !== next.minutes ? "sizes" : null;
}

function planDiagnostic(input: BuildInput, upcoming: PlanItem[]): PlanItem | null {
  const { today, profile, existing, newId, diagnosticId } = input;
  if (profile.start.kind !== "diagnostic") return null;
  const unstarted = upcoming.find((i) => i.kind === "diagnostic" && !isStarted(i));
  if (unstarted) return unstarted;
  if (existing.some((i) => i.kind === "diagnostic")) return null;
  return { id: newId(), date: today, kind: "diagnostic", status: "scheduled", size: DIAGNOSTIC_SIZE, ...(diagnosticId ? { sessionId: diagnosticId } : {}) };
}

/** Future scheduled full exams a student moved, while still valid (on or
 *  after today, at least 2 days before the end, not on a day that already
 *  holds one). The planner's own unstarted ones are recomputed instead. */
function keptMocks(upcoming: PlanItem[], end: string, plan: PlanItem[]): PlanItem[] {
  const lastDay = addDays(end, -2);
  const taken = new Set(plan.filter((i) => i.kind === "mock").map((i) => i.date));
  const kept: PlanItem[] = [];
  for (const mock of sortPlan(upcoming.filter((i) => i.kind === "mock" && !isStarted(i) && i.moves?.length))) {
    if (mock.date > lastDay || taken.has(mock.date)) continue;
    kept.push(mock);
    taken.add(mock.date);
  }
  return kept;
}

/** New full exams on the mockDates targets not already covered: no full exam
 *  and no moved-away-from day within 3 days, and for the final-week target
 *  (fewer than 7 days to go) no full exam and no moved-away-from day within
 *  the cadence gap (7 days, 14 on a light schedule) before exam - 2 -- a
 *  student's move never makes the planner refill the slot. Kinds alternate
 *  relative to the chronologically previous full exam: an official practice
 *  test (the lowest untaken, unassigned one) after anything but a practice
 *  test, else the adaptive mock. */
function newMocks(input: BuildInput, end: string, plan: PlanItem[], reusable: Map<string, string>): PlanItem[] {
  const { today, profile, practiceTaken, practiceAvailable, newId } = input;
  const grid = plan.filter((i) => i.kind === "mock");
  const vacated = [...vacatedDays(plan)];
  const gapStart = addDays(end, -2 - (isLight(profile.days) ? 14 : 7));
  const finalWeekCovered = daysBetween(today, end) < 7 && [...grid.map((m) => m.date), ...vacated].some((day) => day >= gapStart);
  const targets = mockDates(today, end, profile.days).filter((target) =>
    !finalWeekCovered && !grid.some((m) => withinThreeDays(m.date, target)) && !vacated.some((day) => withinThreeDays(day, target)));
  const held = new Set(practiceTaken);
  for (const item of plan) {
    const testNo = heldTest(item);
    if (testNo !== null) held.add(testNo);
  }
  const tests = sortedTests(practiceAvailable);
  const created: PlanItem[] = [];
  for (const date of targets) {
    const previous = sortPlan(grid.filter((m) => m.date < date)).pop();
    const testNo = previous?.mock?.kind === "practice" ? undefined : tests.find((n) => !held.has(n));
    const item: PlanItem = {
      id: reusable.get(date) ?? newId(),
      date,
      kind: "mock",
      status: "scheduled",
      mock: testNo === undefined ? { kind: "adaptive" } : { kind: "practice", testNo },
    };
    if (testNo !== undefined) held.add(testNo);
    grid.push(item);
    created.push(item);
  }
  return created;
}

/** Challenges on practice days (or, with fewer than 3 days to go, a review on
 *  every remaining day), reusing the id of an existing item of the same kind
 *  on the same day. A day holding a full exam the planner placed gets none;
 *  a day a student moved an exam to keeps its challenge; a day an exam was
 *  moved away from keeps only a challenge it already had (spec 6.4:
 *  challenges are never removed, the old day gets nothing new). */
function dailyItems(input: BuildInput, end: string, upcoming: PlanItem[], plan: PlanItem[]): PlanItem[] {
  const { today, profile, newId } = input;
  const kind = daysBetween(today, end) < 3 ? "review" : "challenge";
  const size = challengeSize(profile.minutes);
  const placedMock = (i: PlanItem) => i.kind === "mock" && !i.moves?.length;
  const busy = new Set(plan.filter((i) => placedMock(i) || i.kind === "challenge" || i.kind === "review").map((i) => i.date));
  const vacated = vacatedDays(plan);
  const reusable = new Map(upcoming.filter((i) => i.kind === kind && !isStarted(i)).map((i) => [i.date, i.id]));
  const diagnosticToday = plan.some((i) => i.kind === "diagnostic" && i.date === today);
  const items: PlanItem[] = [];
  for (let day = diagnosticToday ? addDays(today, 1) : today; day < end; day = addDays(day, 1)) {
    if (busy.has(day) || (kind === "challenge" && !profile.days.includes(weekday(day)))) continue;
    const id = reusable.get(day);
    if (id === undefined && vacated.has(day)) continue;
    items.push({ id: id ?? newId(), date: day, kind, status: "scheduled", size });
  }
  return items;
}

/** A minutes-only edit: future unstarted challenges and reviews take the new
 *  size; nothing else changes. */
function resizeDaily(items: PlanItem[], today: string, size: number): PlanItem[] {
  return sortPlan(items.map((item) =>
    (item.kind === "challenge" || item.kind === "review") && item.date >= today && !isStarted(item) && item.size !== size ? { ...item, size } : item));
}

/** The plan from `today` to the horizon, for a first build or a profile
 *  edit (`scope`, see rebuildScope). "sizes" only resizes future challenges
 *  and reviews. "schedule": past items (and started/finished ones) are kept
 *  unchanged; moved full exams are kept while still valid; the grid is
 *  recomputed from today (reusing the id of a dropped full exam on the same
 *  day); challenges, reviews and the exam item are regenerated with stable
 *  ids; future practice exams are re-validated against the tests taken. On
 *  the horizon's last day (exam day) every item dated today or earlier stays
 *  as it is. */
export function buildPlan(input: BuildInput): PlanItem[] {
  const { today, profile, existing, practiceTaken, practiceAvailable, newId, scope = "schedule" } = input;
  if (scope === "sizes") return resizeDaily(existing, today, challengeSize(profile.minutes));
  const upcoming = existing.filter((i) => i.date >= today);
  const plan = [...existing.filter((i) => i.date < today), ...upcoming.filter(isStarted)];
  const end = horizonEnd(profile);
  if (end === today) return sortPlan(existing.filter((i) => i.date <= today));
  if (end === null || end < today) return sortPlan(plan);

  const diagnostic = planDiagnostic(input, upcoming);
  if (diagnostic) plan.push(diagnostic);
  plan.push(...keptMocks(upcoming, end, plan));
  const dropped = new Map(upcoming.filter((i) => i.kind === "mock" && !plan.includes(i)).map((i) => [i.date, i.id]));
  plan.push(...newMocks(input, end, plan, dropped));
  plan.push(...dailyItems(input, end, upcoming, plan));
  if (profile.examDate) {
    const exam = upcoming.find((i) => i.kind === "exam");
    plan.push({ id: exam?.id ?? newId(), date: end, kind: "exam", status: "scheduled" });
  }
  return sortPlan(revalidatePractice(plan, today, practiceTaken, practiceAvailable));
}

// --- Statuses ----------------------------------------------------------------

/** done / late from the finished sessions (keyed by plan item id); missed for
 *  a scheduled item whose day has passed (never the exam item). Done and late
 *  items are never downgraded. */
export function markStatuses(items: PlanItem[], today: string, done: Record<string, { finishedDate: string; sessionId: string }>): PlanItem[] {
  return items.map((item): PlanItem => {
    const entry = Object.hasOwn(done, item.id) ? done[item.id] : undefined;
    if (entry) {
      const completedAt = item.sessionId === entry.sessionId && item.completedAt ? item.completedAt : entry.finishedDate;
      return { ...item, status: entry.finishedDate <= item.date ? "done" : "late", sessionId: entry.sessionId, completedAt };
    }
    if (item.status === "scheduled" && item.date < today && item.kind !== "exam") return { ...item, status: "missed" };
    return item;
  });
}

// --- Daily maintenance -------------------------------------------------------

type MaintainInput = {
  items: PlanItem[];
  today: string;
  done: Record<string, { finishedDate: string; sessionId: string }>;
  practiceTaken: number[];
  practiceAvailable: number[];
  examDate: string | null;     // the plan's horizon end (horizonEnd(profile)); null -> no re-placement
  days: number[];
  newId: () => string;
};

/** Where a missed full exam's replacement goes: the first practice day from
 *  tomorrow to exam - 2 with no other full exam (missed ones aside) within 3
 *  days -- so never on a day that already holds one -- and not a day a full
 *  exam was moved away from. */
function replacementDay(plan: PlanItem[], today: string, exam: string, days: number[]): string | null {
  const others = plan.filter((i) => i.kind === "mock" && i.status !== "missed").map((i) => i.date);
  const vacated = vacatedDays(plan);
  for (let day = addDays(today, 1); day <= addDays(exam, -2); day = addDays(day, 1)) {
    if (days.includes(weekday(day)) && !vacated.has(day) && !others.some((other) => withinThreeDays(other, day))) return day;
  }
  return null;
}

/** The daily step (spec 6.5): mark statuses; re-place each newly missed full
 *  exam once, as a full exam marked `replacementFor` that sits the same test
 *  and takes over that day's challenge (the planner may do what the student
 *  may not) -- except one that was started (it can still be finished, late);
 *  re-validate future practice exams against the tests taken. It never adds
 *  or moves any other full exam, so the grid a build laid down stays put. */
export function maintainPlan(input: MaintainInput): PlanItem[] {
  const { items, today, done, practiceTaken, practiceAvailable, examDate, days, newId } = input;
  const alreadyMissed = new Set(items.filter((i) => i.status === "missed").map((i) => i.id));
  let plan = markStatuses(items, today, done);
  if (examDate) {
    const newlyMissed = sortPlan(plan).filter((i) => i.kind === "mock" && i.status === "missed" && !i.sessionId && !alreadyMissed.has(i.id));
    for (const missed of newlyMissed) {
      if (plan.some((i) => i.replacementFor === missed.id)) continue;
      const day = replacementDay(plan, today, examDate, days);
      if (!day) continue;
      const replacement: PlanItem = { id: newId(), date: day, kind: "mock", status: "scheduled", ...(missed.mock ? { mock: missed.mock } : {}), replacementFor: missed.id };
      plan = [...plan.filter((i) => !(i.kind === "challenge" && i.date === day && !isStarted(i))), replacement];
    }
  }
  return sortPlan(revalidatePractice(plan, today, practiceTaken, practiceAvailable));
}

// --- Moving a full exam ------------------------------------------------------

/** Whether the student may move full exam `itemId` to `date` (spec 6.4). */
export function checkMove(items: PlanItem[], itemId: string, date: string, today: string, exam: string): { ok: true } | { ok: false; error: string } {
  const item = items.find((i) => i.id === itemId);
  if (!item || item.kind !== "mock") return { ok: false, error: "Only full practice exams can be moved." };
  if (item.status !== "scheduled" || item.sessionId) return { ok: false, error: "This exam can't be moved any more." };
  if ((item.moves?.length ?? 0) >= MAX_MOCK_MOVES) return { ok: false, error: "Each full exam can be moved at most twice." };
  if (date < today) return { ok: false, error: "Pick today or a later day." };
  if (date > addDays(exam, -2)) return { ok: false, error: "Full exams must be at least 2 days before your SAT." };
  if (items.some((i) => i.kind === "mock" && i.date === date)) return { ok: false, error: "That day already has a full exam." };
  return { ok: true };
}

/** Moves full exam `itemId` to `date`, recording the move. The challenge on
 *  the new day (if any) stays and the old day gets nothing new. Call
 *  checkMove first. */
export function applyMove(items: PlanItem[], itemId: string, date: string, nowIso: string): PlanItem[] {
  return sortPlan(items.map((item) =>
    item.id === itemId ? { ...item, date, moves: [...(item.moves ?? []), { from: item.date, to: date, at: nowIso }] } : item));
}
