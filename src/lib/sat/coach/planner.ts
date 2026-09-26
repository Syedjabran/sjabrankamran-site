// src/lib/sat/coach/planner.ts
//
// Pure SAT study planner (Node-testable, no server-only imports, no answer
// data): turns the student's SAT date, practice days and minutes into a
// dated plan of daily challenges, full practice exams ("mocks"), review days
// and the exam itself; marks items done/late/missed; and enforces the rules
// for moving a full exam (SAT Coach spec section 6).
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
  const light = new Set(days).size < 3;
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

/** Started or finished: recorded work, so a regeneration never replaces it. */
function isStarted(item: PlanItem): boolean {
  return Boolean(item.sessionId) || item.status !== "scheduled";
}

/** A full exam that still counts -- everything but one missed without ever
 *  being started (that one is re-placed, and its practice test freed). */
function mockCounts(item: PlanItem): boolean {
  return item.kind === "mock" && !(item.status === "missed" && !item.sessionId);
}

type BuildInput = {
  today: string;
  profile: PlannerProfile;
  existing: PlanItem[];
  practiceTaken: number[];
  practiceAvailable: number[];
  newId: () => string;
  diagnosticId?: string | null;
};

function planDiagnostic(input: BuildInput, upcoming: PlanItem[]): PlanItem | null {
  const { today, profile, existing, newId, diagnosticId } = input;
  if (profile.start.kind !== "diagnostic") return null;
  const unstarted = upcoming.find((i) => i.kind === "diagnostic" && !isStarted(i));
  if (unstarted) return unstarted;
  if (existing.some((i) => i.kind === "diagnostic")) return null;
  return { id: newId(), date: today, kind: "diagnostic", status: "scheduled", size: DIAGNOSTIC_SIZE, ...(diagnosticId ? { sessionId: diagnosticId } : {}) };
}

/** Future scheduled full exams that are still valid (on or after today, at
 *  least 2 days before the end, not on a day that already holds one). */
function keptMocks(upcoming: PlanItem[], end: string, plan: PlanItem[]): PlanItem[] {
  const lastDay = addDays(end, -2);
  const taken = new Set(plan.filter((i) => i.kind === "mock").map((i) => i.date));
  const kept: PlanItem[] = [];
  for (const mock of sortPlan(upcoming.filter((i) => i.kind === "mock" && !isStarted(i)))) {
    if (mock.date > lastDay || taken.has(mock.date)) continue;
    kept.push(mock);
    taken.add(mock.date);
  }
  return kept;
}

/** New full exams on the mockDates targets not within 3 days of one already
 *  in the plan, alternating official practice test / adaptive mock. */
function newMocks(input: BuildInput, end: string, plan: PlanItem[]): PlanItem[] {
  const { today, profile, practiceTaken, practiceAvailable, newId } = input;
  const chain = plan.filter(mockCounts);
  const targets = mockDates(today, end, profile.days).filter((target) => chain.every((m) => Math.abs(daysBetween(m.date, target)) > 3));
  const held = new Set(practiceTaken);
  for (const m of chain) if (m.mock?.kind === "practice") held.add(m.mock.testNo);
  const tests = [...new Set(practiceAvailable)].sort((a, b) => a - b);
  const created: PlanItem[] = [];
  for (const date of targets) {
    const previous = sortPlan(chain.filter((m) => m.date < date)).pop();
    const testNo = previous?.mock?.kind === "practice" ? undefined : tests.find((n) => !held.has(n));
    const item: PlanItem = {
      id: newId(),
      date,
      kind: "mock",
      status: "scheduled",
      mock: testNo === undefined ? { kind: "adaptive" } : { kind: "practice", testNo },
    };
    if (testNo !== undefined) held.add(testNo);
    chain.push(item);
    created.push(item);
  }
  return created;
}

/** Challenges on practice days (or, with fewer than 3 days to go, a review on
 *  every remaining day) that hold no full exam, reusing the id of an
 *  existing item of the same kind on the same day. */
function dailyItems(input: BuildInput, end: string, upcoming: PlanItem[], plan: PlanItem[]): PlanItem[] {
  const { today, profile, newId } = input;
  const kind = daysBetween(today, end) < 3 ? "review" : "challenge";
  const size = challengeSize(profile.minutes);
  const busy = new Set(plan.filter((i) => i.kind === "mock" || i.kind === "challenge" || i.kind === "review").map((i) => i.date));
  const reusable = new Map(upcoming.filter((i) => i.kind === kind && !isStarted(i)).map((i) => [i.date, i.id]));
  const diagnosticToday = plan.some((i) => i.kind === "diagnostic" && i.date === today);
  const items: PlanItem[] = [];
  for (let day = diagnosticToday ? addDays(today, 1) : today; day < end; day = addDays(day, 1)) {
    if (busy.has(day) || (kind === "challenge" && !profile.days.includes(weekday(day)))) continue;
    items.push({ id: reusable.get(day) ?? newId(), date: day, kind, status: "scheduled", size });
  }
  return items;
}

/** The plan from `today` to the horizon. Past items (and started/finished
 *  ones) are kept unchanged; future scheduled full exams are kept while still
 *  valid; everything else is regenerated with stable ids. */
export function buildPlan(input: BuildInput): PlanItem[] {
  const { today, profile, existing, newId } = input;
  const upcoming = existing.filter((i) => i.date >= today);
  const plan = [...existing.filter((i) => i.date < today), ...upcoming.filter(isStarted)];
  const end = horizonEnd(profile);
  if (end === null || end <= today) return sortPlan(plan);

  const diagnostic = planDiagnostic(input, upcoming);
  if (diagnostic && !plan.includes(diagnostic)) plan.push(diagnostic);
  plan.push(...keptMocks(upcoming, end, plan));
  plan.push(...newMocks(input, end, plan));
  plan.push(...dailyItems(input, end, upcoming, plan));
  if (profile.examDate) {
    const exam = upcoming.find((i) => i.kind === "exam");
    plan.push({ id: exam?.id ?? newId(), date: end, kind: "exam", status: "scheduled" });
  }
  return sortPlan(plan);
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
