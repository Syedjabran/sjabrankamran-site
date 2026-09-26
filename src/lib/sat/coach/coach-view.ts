// src/lib/sat/coach/coach-view.ts
//
// Pure builders for what the SAT Lab home shows (GET /api/sat/coach, SAT
// Coach spec 7.4) and what the daily cron sends: the plan view (today, the
// next 14 days, countdown, streak, this week's tallies), the analytics
// summary, the "Coach says" input (ruling 9) and the reminder text. No
// answer data, no server-only imports; dates are PKT calendar days.
import type { CoachPayload, InsightsView, MasteryRow, PlanItem, SATAnalytics, SATPlanView } from "../client-types.ts";
import { planItemTitle } from "../client-types.ts";
import { formatPkDay } from "../../portal/pk-time.ts";
import { addDays, daysBetween, horizonEnd } from "./planner.ts";
import { DIAGNOSTIC_SIZE } from "./diagnostic.ts";
import { isoWeekRange } from "./goals.ts";
import { sanitiseFirstName, type InsightsInput } from "./insights-core.ts";
import type { SATPlan } from "./plan-logic.ts";

const UPCOMING_DAYS = 14;
const RECENT_DAYS = 7;
const MAX_RECENT = 3;
const STRONG_MIN_CONFIDENCE = 3;
const MAX_STRONG = 3;
const SUMMARY_WEAK_SKILLS = 3;

const isDaily = (i: PlanItem) => i.kind === "challenge" || i.kind === "review";
const byDateDesc = (a: PlanItem, b: PlanItem) => b.date.localeCompare(a.date);

/** Plan items of the Monday-to-Sunday week holding `today`. */
export function weekItemsOf(items: PlanItem[], today: string): PlanItem[] {
  const [start, end] = isoWeekRange(today);
  return items.filter((i) => i.date >= start && i.date <= end);
}

/** This week's daily sessions (challenges and review days) by status. */
export function weekTally(items: PlanItem[], today: string): SATPlanView["week"] {
  const week = weekItemsOf(items, today).filter(isDaily);
  const count = (status: PlanItem["status"]) => week.filter((i) => i.status === status).length;
  return { scheduled: week.length, done: count("done"), late: count("late"), missed: count("missed") };
}

/** Plan sessions (anything but the SAT itself) done ON their day, in a row,
 *  counting back from the latest one due. Today's item still open doesn't
 *  break it; a late or missed one does. */
export function planStreak(items: PlanItem[], today: string): number {
  const due = items
    .filter((i) => i.kind !== "exam" && (i.date < today || (i.date === today && i.status !== "scheduled")))
    .sort(byDateDesc);
  let streak = 0;
  for (const item of due) {
    if (item.status !== "done") break;
    streak += 1;
  }
  return streak;
}

/** Today's items, then up to 3 of the last week's still worth a tap: a
 *  missed one that can still be done (late), or one just done late today.
 *  A missed full exam that was re-placed shows as its replacement instead. */
export function todayItems(items: PlanItem[], today: string): PlanItem[] {
  const replaced = new Set(items.flatMap((i) => (i.replacementFor ? [i.replacementFor] : [])));
  const since = addDays(today, -RECENT_DAYS);
  const recent = items
    .filter((i) => i.date < today && i.date >= since && i.kind !== "exam" && !replaced.has(i.id))
    .filter((i) => i.status === "missed" || (i.status === "late" && i.completedAt === today))
    .sort(byDateDesc)
    .slice(0, MAX_RECENT);
  return [...items.filter((i) => i.date === today), ...recent];
}

/** The plan part of the home payload. */
export function planView(plan: SATPlan, today: string): SATPlanView {
  const end = horizonEnd(plan.profileSnapshot);
  const last = addDays(today, UPCOMING_DAYS);
  return {
    today: todayItems(plan.items, today),
    upcoming: plan.items.filter((i) => i.date > today && i.date <= last),
    fullExams: plan.items.filter((i) => i.kind === "mock" && i.date >= today),
    examDate: plan.profileSnapshot.examDate,
    horizonEnd: end,
    daysToExam: end ? daysBetween(today, end) : null,
    streak: planStreak(plan.items, today),
    week: weekTally(plan.items, today),
  };
}

/** The analytics part of the home payload: section accuracy, the three
 *  weakest skills and the latest real score (official or estimated). */
export function analyticsSummary(a: Pick<SATAnalytics, "sections" | "weakSkills" | "scores">): NonNullable<CoachPayload["analyticsSummary"]> {
  const history = a.scores.history;
  return { sections: a.sections, weakSkills: a.weakSkills.slice(0, SUMMARY_WEAK_SKILLS), latestScore: history.length ? history[history.length - 1] : null };
}

/** The strongest skills by mastery, among those with enough recent evidence
 *  (confidence >= 3) -- "Coach says" and the parent email's strongest area. */
export function strongSkills(skills: MasteryRow[], n: number = MAX_STRONG): MasteryRow[] {
  return skills
    .filter((s) => s.confidence >= STRONG_MIN_CONFIDENCE)
    .sort((x, y) => y.mastery - x.mastery)
    .slice(0, n);
}

/** The next full exam still to sit, from today on. */
function nextMockOf(view: SATPlanView | null): { date: string; title: string } | null {
  const next = view?.fullExams.find((i) => i.status === "scheduled" && !i.sessionId);
  return next ? { date: formatPkDay(next.date), title: planItemTitle(next) } : null;
}

/** "Coach says" input (ruling 9, AI data minimisation): the first name,
 *  target, days to go, aggregated analytics and this week's tallies --
 *  nothing else about the student. A passed SAT has no countdown. */
export function insightsInputOf(input: {
  firstName: string;
  targetScore: number;
  analytics: Pick<SATAnalytics, "sections" | "skills" | "weakSkills" | "pacingFlags" | "scores"> | null;
  view: SATPlanView | null;
  horizonPassed: boolean;
  today: string;
}): InsightsInput {
  const { analytics: a, view } = input;
  const history = a?.scores.history ?? [];
  return {
    firstName: sanitiseFirstName(input.firstName),
    daysToExam: input.horizonPassed ? null : view?.daysToExam ?? null,
    targetScore: input.targetScore,
    latestScore: history.length ? history[history.length - 1].score : null,
    sections: { rw: { accuracy: a?.sections.rw.accuracy ?? null }, math: { accuracy: a?.sections.math.accuracy ?? null } },
    weakSkills: (a?.weakSkills ?? []).map((w) => ({ label: w.label, mastery: w.mastery })),
    strongSkills: strongSkills(a?.skills ?? []).map((s) => ({ label: s.label, mastery: s.mastery })),
    pacingFlags: (a?.pacingFlags ?? []).map((f) => ({ label: f.label, medianSec: f.medianSec, accuracy: f.accuracy })),
    week: view?.week ?? { scheduled: 0, done: 0, late: 0, missed: 0 },
    nextMock: nextMockOf(view),
  };
}

/** Tips name a skill in the bank's own spelling (case-insensitive match), so
 *  "Drill this" always finds questions; a skill the bank doesn't have (an
 *  AI slip) loses its Drill button rather than failing on tap. */
export function normaliseTipSkills(view: InsightsView, bankSkills: string[]): InsightsView {
  const spelling = new Map(bankSkills.map((s) => [s.toLowerCase(), s]));
  return {
    ...view,
    tips: view.tips.map(({ skill, ...tip }) => {
      const known = skill ? spelling.get(skill.toLowerCase()) : undefined;
      return known ? { ...tip, skill: known } : tip;
    }),
  };
}

/** The daily cron's reminder for today's plan work not started yet: a full
 *  exam first, then the diagnostic, then the challenge or review. Null when
 *  there is nothing (left) to start today. */
export function reminderFor(items: PlanItem[], today: string): { title: string; body: string } | null {
  const open = items.filter((i) => i.date === today && i.kind !== "exam" && i.status === "scheduled" && !i.sessionId);
  const mock = open.find((i) => i.kind === "mock");
  if (mock) return { title: "Today's SAT full exam is ready", body: `${planItemTitle(mock)} — a full, timed practice exam.` };
  const diagnostic = open.find((i) => i.kind === "diagnostic");
  if (diagnostic) return { title: "Today's SAT diagnostic is ready", body: `${diagnostic.size ?? DIAGNOSTIC_SIZE} questions to find your starting point.` };
  const daily = open.find(isDaily);
  if (!daily) return null;
  const noun = daily.kind === "review" ? "review" : "challenge";
  const picked = "picked for what you need most right now.";
  return { title: `Today's SAT ${noun} is ready`, body: daily.size ? `${daily.size} questions, ${picked}` : `Questions ${picked}` };
}
