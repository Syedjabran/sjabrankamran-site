// src/lib/sat/coach/goals.ts
//
// Pure weekly-goal computation (Node-testable, no server-only imports, no
// answer data): the deterministic goals of SAT Coach spec section 8.3.
// Rules decide, AI only phrases a one-line motivation elsewhere -- every
// goal, metric and progress value here is computed, never generated.
//
// Priority order (at most 4 kept): sessions, mastery, exam, pacing, score.
// Dates are PKT calendar days "YYYY-MM-DD"; arithmetic runs on UTC
// midnights built from those strings (as in planner.ts), so the host
// timezone never shifts a day.
import type { PlanItem, SATAnalytics } from "../client-types.ts";
import { practiceTestTitle } from "../client-types.ts";

export type WeeklyGoal = { id: string; kind: "sessions" | "mastery" | "exam" | "pacing" | "score"; title: string; progress: number; detail: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const MASTERY_TARGET_DELTA = 0.07;
const MAX_GOALS = 4;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday-start ISO week [start, end] (inclusive) containing `day`. */
export function isoWeekRange(day: string): [string, string] {
  const dow = new Date(dayMs(day)).getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const sinceMonday = dow === 0 ? 6 : dow - 1;
  const start = addDays(day, -sinceMonday);
  return [start, addDays(start, 6)];
}

/** "Sat 10 Oct" -- the short form used in goal titles. */
function formatShort(day: string): string {
  const d = new Date(dayMs(day));
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function pct(n: number): number {
  return Math.round(n * 100);
}

/** "sessions": done-or-late (late still counts as practice, spec 6.2) over
 *  every challenge/review item scheduled this week, whatever its current
 *  status. Implementer decision: "review" items count as sessions too --
 *  they are the same daily practice slot, just renamed in the final days
 *  before the exam (planner.ts's dailyItems). */
function sessionsGoal(weekItems: PlanItem[]): WeeklyGoal | null {
  const sessions = weekItems.filter((i) => i.kind === "challenge" || i.kind === "review");
  if (sessions.length === 0) return null;
  const done = sessions.filter((i) => i.status === "done" || i.status === "late").length;
  return {
    id: "sessions",
    kind: "sessions",
    title: `Finish this week's ${sessions.length} practice sessions`,
    progress: clamp01(done / sessions.length),
    detail: `${done} of ${sessions.length} done this week`,
  };
}

/** "mastery": the weakest high-weight skill recorded at week start, target
 *  +0.07 mastery. No goal without a recorded baseline -- there is nothing
 *  to measure progress against yet. */
function masteryGoal(analytics: SATAnalytics | null, weakAtWeekStart?: { key: string; label: string; mastery: number } | null): WeeklyGoal | null {
  if (!analytics || !weakAtWeekStart) return null;
  const start = weakAtWeekStart.mastery;
  const target = start + MASTERY_TARGET_DELTA;
  const current = analytics.skills.find((s) => s.key === weakAtWeekStart.key)?.mastery ?? start;
  return {
    id: "mastery",
    kind: "mastery",
    title: `Lift ${weakAtWeekStart.label} mastery`,
    progress: clamp01((current - start) / MASTERY_TARGET_DELTA),
    detail: `Lift ${weakAtWeekStart.label} from ${pct(start)}% to ${pct(target)}%`,
  };
}

/** "exam": this week's full exam, if the plan has one. */
function examGoal(weekItems: PlanItem[]): WeeklyGoal | null {
  const mock = weekItems.find((i) => i.kind === "mock");
  if (!mock) return null;
  const name = mock.mock?.kind === "practice" ? practiceTestTitle(mock.mock.testNo) : "your Adaptive Mock";
  const done = mock.status === "done" || mock.status === "late";
  return {
    id: "exam",
    kind: "exam",
    title: `Sit ${name} on ${formatShort(mock.date)}`,
    progress: done ? 1 : 0,
    detail: done ? "Completed this week." : "A full-length, timed practice test.",
  };
}

/** "pacing": the worst-flagged skill (highest median-vs-target ratio), when
 *  any pacing flag exists. */
function pacingGoal(analytics: SATAnalytics | null): WeeklyGoal | null {
  if (!analytics || analytics.pacingFlags.length === 0) return null;
  const sectionOf = new Map(analytics.skills.map((s) => [s.key, s.section]));
  let worst = analytics.pacingFlags[0];
  let worstRatio = -Infinity;
  for (const flag of analytics.pacingFlags) {
    const section = sectionOf.get(flag.skill);
    const target = section ? analytics.pacing[section].targetSec : null;
    const ratio = target ? flag.medianSec / target : flag.medianSec;
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worst = flag;
    }
  }
  const section = sectionOf.get(worst.skill);
  const target = section ? analytics.pacing[section].targetSec : null;
  return {
    id: "pacing",
    kind: "pacing",
    title: `Speed up on ${worst.label}`,
    progress: target ? clamp01(target / worst.medianSec) : 0,
    detail: target
      ? `You're averaging ${Math.round(worst.medianSec)}s vs a ${target}s target on ${worst.label}.`
      : `You're averaging ${Math.round(worst.medianSec)}s on ${worst.label}.`,
  };
}

/** "score": the latest recorded score (official or estimated, whichever is
 *  more recent) against the profile's target. No goal before any score
 *  exists -- there is nothing to show yet. */
function scoreGoal(analytics: SATAnalytics | null, targetScore: number): WeeklyGoal | null {
  if (!analytics) return null;
  const history = analytics.scores.history;
  const latest = history.length > 0 ? history[history.length - 1] : null;
  if (!latest?.score) return null;
  const current = Math.round((latest.score.lower + latest.score.upper) / 2);
  const gap = targetScore - current;
  return {
    id: "score",
    kind: "score",
    title: gap > 0 ? `${gap} points to your ${targetScore} target` : `You've reached your ${targetScore} target score`,
    progress: clamp01(current / targetScore),
    detail: gap > 0
      ? `Latest score ${current} (range ${latest.score.lower}-${latest.score.upper}).`
      : `Latest score ${current} meets or beats your ${targetScore} target.`,
  };
}

export function weeklyGoals(input: {
  analytics: SATAnalytics | null;
  weekItems: PlanItem[];
  today: string;
  targetScore: number;
  weakAtWeekStart?: { key: string; label: string; mastery: number } | null;
}): WeeklyGoal[] {
  const { analytics, weekItems, today, targetScore, weakAtWeekStart } = input;
  const [start, end] = isoWeekRange(today);
  const thisWeek = weekItems.filter((i) => i.date >= start && i.date <= end);

  const goals = [
    sessionsGoal(thisWeek),
    masteryGoal(analytics, weakAtWeekStart),
    examGoal(thisWeek),
    pacingGoal(analytics),
    scoreGoal(analytics, targetScore),
  ].filter((g): g is WeeklyGoal => g !== null);

  return goals.slice(0, MAX_GOALS);
}
