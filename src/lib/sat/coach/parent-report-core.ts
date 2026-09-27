// src/lib/sat/coach/parent-report-core.ts
//
// Pure SAT section of the Saturday parent email (SAT Coach spec 9), Node-
// testable: no server-only imports, no `@/` alias, no answer data. The
// server side (parent-report.ts) loads the plan, the analytics and the
// week's finished items and hands them to satWeekFrom; weekly-reports.ts
// joins the rendered section to the (unchanged) Physics email with
// composeParentEmail.
//
// "This week" is the Monday-to-Sunday ISO week (PKT calendar days) holding
// the run date -- the cron runs Saturday 18:00 PKT, so Sunday's session and
// any still-open session dated today are "still to come", never missed.
// Sessions = the plan's daily challenges and review days (as goals.ts
// counts them). Late (done after its day) counts as missed for the warning
// (spec 6.2) but is still shown as practice.
//
// No invented scores (spec 3, rule 3): only the official practice ranges and
// the labelled adaptive estimates the analytics already hold are shown, and
// an AI summary that mentions any score-like number -- or any "points"
// figure -- it wasn't given is rejected. AI data minimisation (rule 4): the
// summary prompt carries the first name and the week's numbers only.
//
// The weekly run's pure rules live here too: which sections a student's
// email has (sectionsFor / sectionsOrPhysics) and the deadline loop that
// checkpoints after every student (runBeforeDeadline).
//
// Email HTML: table-based, inline styles only, max 600 px wide, dark text on
// white; every interpolated string goes through escapeHtml.
import type { PlanItem, SATAnalytics, SessionSummary } from "../client-types.ts";
import { planItemTitle } from "../client-types.ts";
import type { SATScore } from "../types.ts";
import type { AnalyticsItem, SittingScore } from "../analytics.ts";
import type { DoneMap } from "./plan-logic.ts";
import type { Course } from "../../portal/course-labels.ts";
import { formatPk, formatPkDay, pkToday } from "../../portal/pk-time.ts";
import { addDays, daysBetween, horizonEnd } from "./planner.ts";
import { SAT_SCALE_MIN, isoWeekRange, onTargetScale } from "./goals.ts";
import { planStreak, strongSkills } from "./coach-view.ts";
import { onlyKnownNumbers, sanitiseFirstName, sentenceCount } from "./insights-core.ts";

export type SatScoreRow = { label: string; range: string; lower: number; upper: number; date: string; official: boolean };

/** One student's SAT week, ready to render. Percentages are whole numbers
 *  0-100; shown dates are already formatted (PKT). */
export type SatWeek = {
  firstName: string;
  weekLabel: string;          // "Mon 21 Sept – Sun 27 Sept"
  asOf: string;               // the run day sessions are counted up to, "Sat 26 Sept"
  scheduled: number;          // sessions due so far this week (their day over, or finished)
  done: number;               // on their day
  late: number;               // finished after their day
  missed: number;             // day over, not finished
  upcoming: number;           // later this week, or today's still open
  answered: number;
  accuracy: number | null;
  accuracyPrev: number | null;
  minutes: number;
  fullExam: { title: string; score: string | null; status: "done" | "missed" | "none" | "scheduled" };
  streak: number;
  daysToExam: number | null;
  examWhen: string | null;    // "7 November 2026", or "December 2026 (not booked yet)"
  targetScore: number;
  scores: SatScoreRow[];      // newest first, at most 5
  estimateBasis: string | null;
  sections: { rw: number | null; math: number | null };
  strongest: string | null;
  weakest: string | null;
  summary: string;
  summarySource: "ai" | "rules";
};

export type WarningLevel = "missed-week" | "partial" | "none";
export type ReportWeek = { start: string; end: string; runDate: string; prevStart: string; prevEnd: string };
export type SessionTally = Pick<SatWeek, "scheduled" | "done" | "late" | "missed" | "upcoming">;
export type ActivityItem = Pick<AnalyticsItem, "at" | "correct" | "timeMs" | "blank">;
/** `attempted`: every finished item (the accuracy base, a blank is wrong);
 *  `answered`: those not left blank. */
export type WeekActivity = { answered: number; attempted: number; correct: number; ms: number };

/** Email colours: dark text on white, a red and an amber warning. */
export const COLORS = {
  text: "#1f2937",
  strong: "#111827",
  muted: "#5f6b7a",
  rule: "#e5e7eb",
  tile: "#f8fafc",
  bar: "#2563eb",
  band: "#93c5fd",
  track: "#e5e7eb",
  red: "#b91c1c",
  redBg: "#fdecec",
  redText: "#7f1d1d",
  amber: "#b45309",
  amberBg: "#fff7e6",
  amberText: "#78350f",
} as const;

const MAX_SCORE_ROWS = 5;
const SUMMARY_MAX_CHARS = 280;
const SUMMARY_MAX_SENTENCES = 2;
const NAME_FALLBACK = "Your child";
const FONT = "Arial,Helvetica,sans-serif";
const EXAM_DAY_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
const SCORE_DAY_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const LATE_NOTE = "Sessions finished after their day count as missed here.";
const NO_SCORE_YET = "No full-exam score yet — one appears after the first full practice exam.";
const SAT_UNAVAILABLE = "Digital SAT: this week's SAT summary couldn't be prepared. It will be in next week's email.";
const SIGN_OFF = ["Warm regards,", "Syed Jabran Ali Kamran", "sjabrankamran.com"];
const TEXT_RULE = "------------------------------";

// --- the weekly run ---------------------------------------------------------------

export type Sections = { physics: boolean; sat: boolean };

/** The sections a student's email has, from their courses: Digital SAT for
 *  SAT; Physics for a physics course -- and for every student without SAT,
 *  so each family that got the Saturday email before SAT existed still gets
 *  it (a student with no active class and no grant included). Only SAT-only
 *  students skip Physics. */
export function sectionsFor(allowed: readonly Course[]): Sections {
  const sat = allowed.includes("SAT");
  return { physics: allowed.includes("9702") || allowed.includes("5054") || !sat, sat };
}

/** sectionsFor the courses `read` resolves. When that read fails: the email
 *  the student got before SAT existed -- Physics only -- after reporting the
 *  failure, so a registry or grants outage never costs a family its email. */
export async function sectionsOrPhysics(read: () => Promise<readonly Course[]>, onError: (e: unknown) => void): Promise<Sections> {
  try {
    return sectionsFor(await read());
  } catch (e) {
    onError(e);
    return { physics: true, sat: false };
  }
}

/** Works through `items` in order, starting each one only while `now()` is
 *  before `deadlineAt`. `handle` says whether the item is complete, and a
 *  complete one is checkpointed (`onComplete`) straight away, so a run the
 *  platform kills re-sends nobody already done. `partial`: the deadline
 *  stopped it with items left. */
export async function runBeforeDeadline<T>(
  items: readonly T[],
  opts: { now: () => number; deadlineAt: number; handle: (item: T) => Promise<boolean>; onComplete: (item: T) => Promise<void> },
): Promise<{ processed: number; partial: boolean }> {
  let processed = 0;
  for (const item of items) {
    if (opts.now() >= opts.deadlineAt) return { processed, partial: true };
    if (await opts.handle(item)) await opts.onComplete(item);
    processed++;
  }
  return { processed, partial: false };
}

// --- the week ------------------------------------------------------------------

/** The student's first name for a parent: first word, at most 30 characters
 *  (sanitiseFirstName), never an email; "Your child" when there is none. Unlike the tutor/insights fallback ("there"),
 *  a parent email never addresses the student as "there" -- any source
 *  containing "@", or a sanitised result of "there", falls back here too. */
export function parentFirstName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || raw.includes("@")) return NAME_FALLBACK;
  const name = sanitiseFirstName(trimmed);
  return name === "there" ? NAME_FALLBACK : name;
}

/** The name inside a sentence: "your child", not "Your child". */
function nameMidSentence(firstName: string): string {
  return firstName === NAME_FALLBACK ? NAME_FALLBACK.toLowerCase() : firstName;
}

/** The Monday-to-Sunday week holding `runDate`, and the week before it. */
export function reportWeek(runDate: string): ReportWeek {
  const [start, end] = isoWeekRange(runDate);
  return { start, end, runDate, prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
}

const inWeek = (item: PlanItem, week: ReportWeek) => item.date >= week.start && item.date <= week.end;
const isSession = (item: PlanItem) => item.kind === "challenge" || item.kind === "review";

/** Where one plan item stands on the run date. A finish the plan hasn't
 *  recorded yet (the summaries' done map) counts; an unfinished item whose
 *  day is over is missed even before the daily maintenance marks it. */
function outcomeOf(item: PlanItem, runDate: string, done: DoneMap): "done" | "late" | "missed" | "upcoming" {
  if (item.status === "done" || item.status === "late") return item.status;
  const finish = done[item.id];
  if (finish) return finish.finishedDate <= item.date ? "done" : "late";
  if (item.status === "missed" || item.date < runDate) return "missed";
  return "upcoming";
}

/** The plan with the finishes it hasn't recorded yet applied (done on the
 *  item's day, late after it) -- what the streak is counted from, so it
 *  agrees with the tallies. */
function withFinishes(items: PlanItem[], done: DoneMap): PlanItem[] {
  return items.map((item): PlanItem => {
    const finish = done[item.id];
    if (!finish || item.status === "done" || item.status === "late") return item;
    return { ...item, status: finish.finishedDate <= item.date ? "done" : "late", sessionId: finish.sessionId, completedAt: finish.finishedDate };
  });
}

/** This week's daily sessions: due so far (done / late / missed) and still
 *  to come (later this week, or today's still open). */
export function sessionTally(items: PlanItem[], week: ReportWeek, done: DoneMap): SessionTally {
  const tally = { scheduled: 0, done: 0, late: 0, missed: 0, upcoming: 0 };
  for (const item of items) {
    if (!isSession(item) || !inWeek(item, week)) continue;
    const outcome = outcomeOf(item, week.runDate, done);
    if (outcome === "upcoming") {
      tally.upcoming++;
      continue;
    }
    tally.scheduled++;
    tally[outcome]++;
  }
  return tally;
}

export function scoreRange(s: { lower: number; upper: number }): string {
  return `${s.lower}–${s.upper}`;
}

function scoreText(s: SATScore): string {
  return `${scoreRange(s)} (${s.authority === "official" ? "official range" : "estimated"})`;
}

/** This week's full exam: one sat (done or late, with its real score when it
 *  has one), else one still to come, else one missed (and where the planner
 *  moved it), else none. */
export function weekFullExam(
  items: PlanItem[], week: ReportWeek, done: DoneMap, scoreOf: (sessionId: string) => SATScore | null,
): SatWeek["fullExam"] {
  const mocks = items
    .filter((i) => i.kind === "mock" && inWeek(i, week))
    .map((item) => ({ item, outcome: outcomeOf(item, week.runDate, done) }));
  const sat = mocks.find((m) => m.outcome === "done" || m.outcome === "late");
  if (sat) {
    const sessionId = done[sat.item.id]?.sessionId ?? sat.item.sessionId;
    const score = sessionId ? scoreOf(sessionId) : null;
    return { title: planItemTitle(sat.item), score: score ? scoreText(score) : null, status: "done" };
  }
  const next = mocks.find((m) => m.outcome === "upcoming");
  if (next) return { title: `${planItemTitle(next.item)} · ${formatPkDay(next.item.date)}`, score: null, status: "scheduled" };
  const missed = mocks.find((m) => m.outcome === "missed");
  if (missed) {
    const moved = items.find((i) => i.replacementFor === missed.item.id);
    const title = moved ? `${planItemTitle(missed.item)} — moved to ${formatPkDay(moved.date)}` : planItemTitle(missed.item);
    return { title, score: null, status: "missed" };
  }
  return { title: "", score: null, status: "none" };
}

/** Finished items dated on PKT days `from`..`to` (inclusive): how many were
 *  answered (not left blank), attempted and correct, and the time spent on
 *  them (items without timing data add none). */
export function activityIn(items: ActivityItem[], from: string, to: string): WeekActivity {
  const out: WeekActivity = { answered: 0, attempted: 0, correct: 0, ms: 0 };
  for (const it of items) {
    const day = pkToday(it.at);
    if (day < from || day > to) continue;
    out.attempted++;
    if (!it.blank) out.answered++;
    if (it.correct) out.correct++;
    if (typeof it.timeMs === "number" && Number.isFinite(it.timeMs) && it.timeMs > 0) out.ms += it.timeMs;
  }
  return out;
}

const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
const fractionPercent = (x: number | null | undefined): number | null => (x == null ? null : Math.round(x * 100));

function scoreRows(history: SittingScore[]): { rows: SatScoreRow[]; basis: string | null } {
  const shown = history.filter((s): s is SittingScore & { score: SATScore } => s.score != null).slice(-MAX_SCORE_ROWS).reverse();
  const estimate = shown.find((s) => s.score.authority === "estimated")?.score;
  return {
    rows: shown.map((s) => ({
      label: s.title,
      range: scoreRange(s.score),
      lower: s.score.lower,
      upper: s.score.upper,
      date: formatPk(s.finishedAt, SCORE_DAY_FORMAT),
      official: s.score.authority === "official",
    })),
    basis: estimate?.authority === "estimated" ? estimate.basis : null,
  };
}

function examTiming(profile: SatWeekInput["profile"], runDate: string): Pick<SatWeek, "daysToExam" | "examWhen"> {
  const end = horizonEnd(profile);
  const daysToExam = end && end >= runDate ? daysBetween(runDate, end) : null;
  if (profile.examDate) return { daysToExam, examWhen: formatPkDay(profile.examDate, EXAM_DAY_FORMAT) };
  if (profile.targetMonth) {
    return { daysToExam, examWhen: `${formatPkDay(`${profile.targetMonth}-01`, { month: "long", year: "numeric" })} (not booked yet)` };
  }
  return { daysToExam, examWhen: null };
}

export type SatWeekInput = {
  fullName: string;
  runDate: string;
  profile: { examDate: string | null; targetMonth: string | null; targetScore: number };
  planItems: PlanItem[];
  done: DoneMap;
  analytics: Pick<SATAnalytics, "sections" | "skills" | "weakSkills" | "scores"> | null;
  summaries: Pick<SessionSummary, "id" | "score">[];
  items: ActivityItem[];   // finished items of (at least) this week and the week before
};

/** The student's SAT week from raw inputs, with the deterministic summary. */
export function satWeekFrom(input: SatWeekInput): SatWeek {
  const week = reportWeek(input.runDate);
  const thisWeek = activityIn(input.items, week.start, week.runDate);
  const lastWeek = activityIn(input.items, week.prevStart, week.prevEnd);
  const scoreById = new Map(input.summaries.map((s) => [s.id, s.score]));
  const a = input.analytics;
  const { rows, basis } = scoreRows(a?.scores.history ?? []);
  const weakest = a?.weakSkills[0] ?? null;
  const strongest = a ? strongSkills(a.skills).find((s) => s.key !== weakest?.key) ?? null : null;
  const base: SatWeek = {
    firstName: parentFirstName(input.fullName),
    weekLabel: `${formatPkDay(week.start)} – ${formatPkDay(week.end)}`,
    asOf: formatPkDay(week.runDate),
    ...sessionTally(input.planItems, week, input.done),
    answered: thisWeek.answered,
    accuracy: percent(thisWeek.correct, thisWeek.attempted),
    accuracyPrev: percent(lastWeek.correct, lastWeek.attempted),
    minutes: Math.round(thisWeek.ms / 60_000),
    fullExam: weekFullExam(input.planItems, week, input.done, (id) => scoreById.get(id) ?? null),
    streak: planStreak(withFinishes(input.planItems, input.done), week.runDate),
    ...examTiming(input.profile, week.runDate),
    targetScore: input.profile.targetScore,
    scores: rows,
    estimateBasis: basis,
    sections: { rw: fractionPercent(a?.sections.rw.accuracy), math: fractionPercent(a?.sections.math.accuracy) },
    strongest: strongest?.label ?? null,
    weakest: weakest?.label ?? null,
    summary: "",
    summarySource: "rules",
  };
  return { ...base, summary: fallbackSummary(base) };
}

// --- warning ---------------------------------------------------------------------

type WeekCounts = Pick<SatWeek, "scheduled" | "done" | "late" | "missed">;

/** missed-week: sessions were due and none was done on its day (late counts
 *  as missed); partial: some missed or late; otherwise none. */
export function warningLevel(w: WeekCounts): WarningLevel {
  if (w.scheduled > 0 && w.done === 0) return "missed-week";
  if (w.missed + w.late > 0) return "partial";
  return "none";
}

export function warningText(w: WeekCounts & Pick<SatWeek, "firstName">): string | null {
  const level = warningLevel(w);
  if (level === "missed-week") {
    return w.scheduled === 1
      ? `⚠ ${w.firstName} missed the one SAT practice session this week.`
      : `⚠ ${w.firstName} missed all ${w.scheduled} SAT practice sessions this week.`;
  }
  if (level === "partial") return `${w.firstName} missed ${w.missed + w.late} of ${w.scheduled} SAT sessions this week.`;
  return null;
}

// --- the two-line summary -----------------------------------------------------------

/** The deterministic summary: always true, at most two sentences. */
export function fallbackSummary(w: SatWeek): string {
  const answered = w.answered > 0
    ? `answered ${w.answered} question${w.answered === 1 ? "" : "s"}${w.accuracy !== null ? ` at ${w.accuracy}% accuracy` : ""}`
    : "answered no questions";
  const first = w.scheduled > 0
    ? `${w.firstName} practised on ${w.done} of ${w.scheduled} planned days and ${answered}.`
    : `${w.firstName} had no SAT sessions planned this week and ${answered}.`;
  const focus = w.strongest && w.weakest
    ? `Strongest: ${w.strongest}; next focus: ${w.weakest}.`
    : w.weakest ? `Next focus: ${w.weakest}.` : w.strongest ? `Strongest: ${w.strongest}.` : "";
  return focus ? `${first} ${focus}` : first;
}

/** Compact prompt: the first name and the week's numbers (plus the strongest
 *  and weakest skill labels) -- never a score, email, guardian or school. */
export function summaryPrompt(w: SatWeek): { system: string; user: string } {
  const system = [
    "You write the two-line summary in a parent's weekly Digital SAT email.",
    "Write about the student in the third person, by first name, in plain, warm, factual British English: no greeting, no sign-off, no lists.",
    "Use only the facts given. Never state, estimate or predict any SAT score or score gain.",
    "Late sessions (finished after their day) count as missed; sessions still to come are not missed.",
    `At most ${SUMMARY_MAX_SENTENCES} sentences and ${SUMMARY_MAX_CHARS} characters.`,
    'Reply with ONLY a JSON object, no markdown fences: {"summary": string}.',
  ].join(" ");
  const user = JSON.stringify({
    name: w.firstName,
    thisWeek: {
      sessionsPlanned: w.scheduled,
      onTime: w.done,
      late: w.late,
      missed: w.missed,
      stillToCome: w.upcoming,
      questionsAnswered: w.answered,
      accuracyPercent: w.accuracy,
      lastWeekAccuracyPercent: w.accuracyPrev,
      accuracyChangePoints: accuracyChange(w),
      minutesPractised: w.minutes,
      fullExam: w.fullExam.status,
      streak: w.streak,
    },
    daysToSat: w.daysToExam,
    strongestSkill: w.strongest,
    weakestSkill: w.weakest,
  });
  return { system, user };
}

/** This week's accuracy minus last week's, in percentage points; null
 *  unless both weeks had answers. */
function accuracyChange(w: Pick<SatWeek, "accuracy" | "accuracyPrev">): number | null {
  return w.accuracy !== null && w.accuracyPrev !== null ? w.accuracy - w.accuracyPrev : null;
}

/** The numbers the summary prompt carried -- all the summary may state at
 *  score size or as a "points" figure (onlyKnownNumbers, shared with
 *  "Coach says" in insights-core.ts). */
function knownWeekNumbers(w: SatWeek): Set<number> {
  const change = accuracyChange(w);
  return new Set(
    [w.scheduled, w.done, w.late, w.missed, w.upcoming, w.answered, w.accuracy, w.accuracyPrev, w.minutes, w.streak, w.daysToExam, change === null ? null : Math.abs(change)]
      .filter((n): n is number => typeof n === "number"),
  );
}

/** The AI reply's summary when it is usable: one or two sentences, at most
 *  280 characters, and no score-like number -- nor any points figure -- it
 *  wasn't given. Else null. */
export function parseSummary(json: unknown, w: SatWeek): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = (json as { summary?: unknown }).summary;
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > SUMMARY_MAX_CHARS || sentenceCount(text) > SUMMARY_MAX_SENTENCES) return null;
  return onlyKnownNumbers(text, knownWeekNumbers(w)) ? text : null;
}

// --- shared wording ----------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${Math.floor(m / 60)} h`;
}

function sessionParts(w: SatWeek): string[] {
  return [w.late ? `${w.late} late` : "", w.missed ? `${w.missed} missed` : "", w.upcoming ? `${w.upcoming} still to come` : ""].filter(Boolean);
}

function countedLine(w: SatWeek): string {
  const upcoming = w.upcoming ? `; ${plural(w.upcoming, "session", "sessions")} still to come` : "";
  return `sessions counted up to ${w.asOf}${upcoming}`;
}

function accuracyValue(w: SatWeek): string {
  return w.accuracy === null ? "—" : `${w.accuracy}%`;
}

function accuracyDetail(w: SatWeek): string {
  if (w.accuracy === null) return w.accuracyPrev === null ? "no questions answered" : `last week ${w.accuracyPrev}%`;
  if (w.accuracyPrev === null) return "no practice last week";
  const change = w.accuracy - w.accuracyPrev;
  if (change === 0) return `same as last week's ${w.accuracyPrev}%`;
  return `${change > 0 ? "up" : "down"} ${plural(Math.abs(change), "point", "points")} on last week's ${w.accuracyPrev}%`;
}

function streakDetail(n: number): string {
  return n === 1 ? "session in a row on its day" : "sessions in a row on their day";
}

function examWhenDetail(daysToExam: number | null): string {
  if (daysToExam === null) return "passed";
  return daysToExam === 0 ? "today" : `${plural(daysToExam, "day", "days")} to go`;
}

function examLine(w: SatWeek): string {
  return w.examWhen ? `SAT date: ${w.examWhen} (${examWhenDetail(w.daysToExam)})` : "SAT date: not set yet";
}

function authority(row: SatScoreRow): string {
  return row.official ? "official" : "estimated";
}

function sectionLine(w: SatWeek): string {
  const v = (n: number | null) => (n === null ? "—" : `${n}%`);
  return `Section accuracy (all practice so far): Reading and Writing ${v(w.sections.rw)} · Math ${v(w.sections.math)}`;
}

// --- plain text ----------------------------------------------------------------------

function fullExamText(e: SatWeek["fullExam"]): string {
  if (e.status === "done") return `Full exam: ${e.title} — ${e.score ?? "done"}`;
  if (e.status === "missed") return `Full exam: missed — ${e.title}`;
  if (e.status === "scheduled") return `Full exam: coming up — ${e.title}`;
  return "Full exam: none this week";
}

function sessionsText(w: SatWeek): string {
  const parts = sessionParts(w);
  if (w.scheduled === 0) return `Practice sessions: none due so far${w.upcoming ? ` (${w.upcoming} still to come)` : ""}`;
  return `Practice sessions: ${w.done} of ${w.scheduled} done on their day${parts.length ? ` (${parts.join(", ")})` : " (all on time)"}`;
}

/** The SAT section as plain text: the warning first, then every metric. */
export function renderSatSectionText(w: SatWeek): string {
  const lines: string[] = [];
  const warning = warningText(w);
  if (warning) lines.push(warning, ...(w.late > 0 ? [LATE_NOTE] : []), "");
  lines.push("DIGITAL SAT", `Week of ${w.weekLabel} (${countedLine(w)})`, "");
  lines.push(
    "THIS WEEK",
    `• ${sessionsText(w)}`,
    `• Questions answered: ${w.answered}`,
    `• Accuracy: ${accuracyValue(w)} (${accuracyDetail(w)})`,
    `• Time practised: ${formatMinutes(w.minutes)}`,
    `• ${fullExamText(w.fullExam)}`,
    `• Streak: ${w.streak} ${streakDetail(w.streak)}`,
    "",
    "IN TWO LINES",
    w.summary,
    "",
    "PROGRESS SO FAR",
    `• ${examLine(w)}`,
    `• Target score: ${w.targetScore}`,
  );
  const latest = w.scores[0];
  if (latest) {
    lines.push(`• Latest score: ${latest.range} (${latest.official ? "official range" : "estimated"}, ${latest.date})`, "• Score history:");
    for (const s of w.scores) lines.push(`    ${s.date} — ${s.label}: ${s.range} (${authority(s)})`);
    if (w.estimateBasis && w.scores.some((s) => !s.official)) lines.push(`    * ${w.estimateBasis}`);
  } else {
    lines.push(`• ${NO_SCORE_YET}`);
  }
  lines.push(`• ${sectionLine(w)}`);
  if (w.strongest) lines.push(`• Strongest skill: ${w.strongest}`);
  if (w.weakest) lines.push(`• Next focus (weakest skill): ${w.weakest}`);
  return lines.join("\n");
}

// --- HTML ----------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const esc = escapeHtml;
const TABLE_ATTRS = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

function table(rows: string, style = ""): string {
  return `<table ${TABLE_ATTRS} style="border-collapse:collapse;${style}">${rows}</table>`;
}

function row(html: string, style = ""): string {
  return `<tr><td colspan="2" style="${style}">${html}</td></tr>`;
}

function bold(text: string): string {
  return `<b style="color:${COLORS.strong}">${esc(text)}</b>`;
}

function subhead(text: string): string {
  return row(esc(text), `padding:22px 0 8px;font-size:12px;line-height:1.4;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.muted}`);
}

function line(html: string): string {
  return row(html, `padding:3px 0;font-size:14px;line-height:1.5;color:${COLORS.text}`);
}

function note(text: string): string {
  return row(esc(text), `padding:2px 0 6px;font-size:12px;line-height:1.4;color:${COLORS.muted}`);
}

function barCell(width: number, color: string): string {
  return `<td width="${width}%" height="10" bgcolor="${color}" style="width:${width}%;height:10px;background:${color};font-size:0;line-height:0">&nbsp;</td>`;
}

/** A horizontal bar of coloured segments (percent widths, clamped to 100)
 *  on a grey track. */
function bar(segments: { pct: number; color: string }[]): string {
  let used = 0;
  const cells = segments.map(({ pct, color }) => {
    const width = Math.max(0, Math.min(100 - used, Math.round(pct)));
    used += width;
    return width > 0 ? barCell(width, color) : "";
  });
  const rest = 100 - used;
  return `<table ${TABLE_ATTRS} style="border-collapse:collapse"><tr>${cells.join("")}${rest > 0 ? barCell(rest, COLORS.track) : ""}</tr></table>`;
}

function warningHtml(w: SatWeek): string {
  const text = warningText(w);
  if (!text) return "";
  const red = warningLevel(w) === "missed-week";
  const edge = red ? COLORS.red : COLORS.amber;
  const bg = red ? COLORS.redBg : COLORS.amberBg;
  const fg = red ? COLORS.redText : COLORS.amberText;
  const late = w.late > 0 ? `<div style="margin-top:4px;font-size:12px;font-weight:normal">${esc(LATE_NOTE)}</div>` : "";
  const block = `<tr><td bgcolor="${bg}" style="background:${bg};border-left:4px solid ${edge};padding:12px 14px;font-size:15px;line-height:1.4;font-weight:bold;color:${fg}">${esc(text)}${late}</td></tr>`;
  return row(table(block), "padding:0 0 16px");
}

type Tile = { label: string; value: string; detail: string };

function fullExamTile(e: SatWeek["fullExam"]): Tile {
  if (e.status === "done") return { label: "Full exam", value: "Done", detail: e.score ? `${e.title} · ${e.score}` : e.title };
  if (e.status === "missed") return { label: "Full exam", value: "Missed", detail: e.title };
  if (e.status === "scheduled") return { label: "Full exam", value: "Coming up", detail: e.title };
  return { label: "Full exam", value: "None", detail: "none planned this week" };
}

function tiles(w: SatWeek): Tile[] {
  const parts = sessionParts(w);
  return [
    {
      label: "Practice sessions",
      value: w.scheduled > 0 ? `${w.done} of ${w.scheduled}` : "None due",
      detail: w.scheduled > 0 ? ["done on their day", ...parts].join(" · ") : parts.join(" · ") || "none planned",
    },
    { label: "Questions answered", value: String(w.answered), detail: "this week" },
    { label: "Accuracy", value: accuracyValue(w), detail: accuracyDetail(w) },
    { label: "Time practised", value: formatMinutes(w.minutes), detail: "on finished questions" },
    fullExamTile(w.fullExam),
    { label: "Streak", value: String(w.streak), detail: streakDetail(w.streak) },
  ];
}

function tileHtml(t: Tile): string {
  return `<table ${TABLE_ATTRS} style="border-collapse:separate;background:${COLORS.tile};border:1px solid ${COLORS.rule};border-radius:8px"><tr><td style="padding:10px 12px">`
    + `<div style="font-size:12px;line-height:1.4;color:${COLORS.muted}">${esc(t.label)}</div>`
    + `<div style="font-size:22px;line-height:1.3;font-weight:bold;color:${COLORS.strong}">${esc(t.value)}</div>`
    + `<div style="font-size:12px;line-height:1.4;color:${COLORS.muted}">${esc(t.detail)}</div>`
    + "</td></tr></table>";
}

/** Two tiles per row: readable down to a 320 px phone. */
function tilesHtml(list: Tile[]): string {
  const rows: string[] = [];
  for (let i = 0; i < list.length; i += 2) {
    const [left, right] = [list[i], list[i + 1]];
    rows.push(`<tr><td width="50%" valign="top" style="width:50%;padding:0 4px 8px 0">${tileHtml(left)}</td>`
      + `<td width="50%" valign="top" style="width:50%;padding:0 0 8px 4px">${right ? tileHtml(right) : "&nbsp;"}</td></tr>`);
  }
  return table(rows.join(""), "table-layout:fixed");
}

/** The latest score against the target, on the SAT scale from 400 (the same
 *  scale as the home's score goal, goals.ts onTargetScale): solid to the
 *  range's lower bound, lighter across the range. */
function targetRows(w: SatWeek): string {
  const latest = w.scores[0];
  if (!latest) return line(`${esc(NO_SCORE_YET)} Target ${bold(String(w.targetScore))}.`);
  const lower = onTargetScale(latest.lower, w.targetScore) * 100;
  const upper = onTargetScale(latest.upper, w.targetScore) * 100;
  const label = `Latest score ${bold(latest.range)} (${esc(latest.official ? "official range" : "estimated")}, ${esc(latest.date)}) · Target ${bold(String(w.targetScore))}`;
  const caption = latest.lower >= w.targetScore
    ? "Target reached."
    : `Bar: from ${SAT_SCALE_MIN} (the lowest SAT score) to the target; the lighter part is the score range.`;
  return line(label)
    + row(bar([{ pct: lower, color: COLORS.bar }, { pct: upper - lower, color: COLORS.band }]), "padding:6px 0 2px")
    + note(caption);
}

function historyRows(w: SatWeek): string {
  if (!w.scores.length) return "";
  const rows = w.scores.map((s) => `<tr><td style="padding:3px 8px 3px 0;font-size:13px;line-height:1.4;color:${COLORS.text}">${esc(`${s.date} · ${s.label}`)}</td>`
    + `<td align="right" style="padding:3px 0;font-size:13px;line-height:1.4;color:${COLORS.muted};white-space:nowrap">${bold(s.range)} ${esc(authority(s))}</td></tr>`);
  const basis = w.estimateBasis && w.scores.some((s) => !s.official) ? note(w.estimateBasis) : "";
  return row(esc("Score history"), `padding:12px 0 4px;font-size:13px;font-weight:bold;color:${COLORS.strong}`) + rows.join("") + basis;
}

function sectionBar(label: string, value: number | null): string {
  return `<tr><td style="padding:8px 0 4px;font-size:13px;line-height:1.4;color:${COLORS.text}">${esc(label)}</td>`
    + `<td align="right" style="padding:8px 0 4px;font-size:13px;line-height:1.4;font-weight:bold;color:${COLORS.strong};white-space:nowrap">${value === null ? "—" : `${value}%`}</td></tr>`
    + row(bar(value === null ? [] : [{ pct: value, color: COLORS.bar }]));
}

function skillRows(w: SatWeek): string {
  if (!w.strongest && !w.weakest) return note("Strongest and weakest skills appear after a few more practice sessions.");
  return (w.strongest ? line(`Strongest skill: ${bold(w.strongest)}`) : "")
    + (w.weakest ? line(`Next focus (weakest skill): ${bold(w.weakest)}`) : "");
}

function examHtml(w: SatWeek): string {
  if (!w.examWhen) return esc(examLine(w));
  return `SAT date: ${bold(w.examWhen)} (${esc(examWhenDetail(w.daysToExam))})`;
}

function progressHtml(w: SatWeek): string {
  return table([
    line(examHtml(w)),
    targetRows(w),
    historyRows(w),
    row(esc("Section accuracy (all practice so far)"), `padding:12px 0 0;font-size:13px;font-weight:bold;color:${COLORS.strong}`),
    sectionBar("Reading and Writing", w.sections.rw),
    sectionBar("Math", w.sections.math),
    row("", "padding:6px 0 0"),
    skillRows(w),
  ].join(""), "table-layout:auto");
}

/** The SAT section: the warning (when there is one) first, then the week's
 *  tiles, the two-line summary and progress so far. */
export function renderSatSectionHtml(w: SatWeek): string {
  const rows = [
    warningHtml(w),
    row(esc("Digital SAT"), `padding:0;font-size:20px;line-height:1.3;font-weight:bold;color:${COLORS.strong}`),
    row(esc(`Week of ${w.weekLabel} · ${countedLine(w)}`), `padding:2px 0 0;font-size:13px;line-height:1.4;color:${COLORS.muted}`),
    subhead("This week"),
    row(tilesHtml(tiles(w))),
    subhead("In two lines"),
    row(esc(w.summary), `font-size:15px;line-height:1.55;color:${COLORS.text}`),
    subhead("Progress so far"),
    row(progressHtml(w)),
  ];
  return table(rows.join(""), `width:100%;max-width:600px;background:#ffffff;font-family:${FONT};color:${COLORS.text}`);
}

// --- the whole email ---------------------------------------------------------------

/** The Physics email's HTML exactly as weekly-reports.ts has always built it:
 *  the plain-text body, escaped, line breaks kept. */
export function textBlockHtml(text: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;
}

const HTML_RULE = `<hr style="border:0;border-top:1px solid ${COLORS.rule};margin:28px 0;max-width:600px">`;
const WRAP_STYLE = `font-family:${FONT};font-size:14px;color:#111;line-height:1.55`;

export type ParentEmailInput = {
  studentName: string;
  guardianName: string;
  physics: { subject: string; body: string } | null;
  /** "unavailable": the student has SAT but its data couldn't be read. */
  sat: SatWeek | "unavailable" | null;
};
export type ParentEmail = { subject: string; text: string; html: string };

function satOnlyEmail(studentName: string, guardianName: string, w: SatWeek): ParentEmail {
  const greeting = `Dear ${guardianName},`;
  const intro = `Here is this week's Digital SAT update for ${nameMidSentence(w.firstName)}.`;
  return {
    subject: `Digital SAT weekly update — ${studentName}`,
    text: [greeting, "", intro, "", renderSatSectionText(w), "", ...SIGN_OFF].join("\n"),
    html: `<div style="${WRAP_STYLE}"><p style="margin:0 0 12px">${esc(greeting)}</p><p style="margin:0 0 20px">${esc(intro)}</p></div>`
      + renderSatSectionHtml(w)
      + `<div style="${WRAP_STYLE}"><p style="margin:24px 0 0">${SIGN_OFF.map(esc).join("<br>")}</p></div>`,
  };
}

/** One guardian's email: the Physics section unchanged (physics-only mail is
 *  byte-for-byte what it always was), the SAT section after it, or the SAT
 *  section alone with its own greeting and sign-off. Null when there is
 *  nothing to send. */
export function composeParentEmail(input: ParentEmailInput): ParentEmail | null {
  const { physics, sat } = input;
  const week = sat && sat !== "unavailable" ? sat : null;
  if (!physics) return week ? satOnlyEmail(input.studentName, input.guardianName, week) : null;
  if (!sat) return { subject: physics.subject, text: physics.body, html: textBlockHtml(physics.body) };
  if (!week) {
    return {
      subject: physics.subject,
      text: `${physics.body}\n\n${TEXT_RULE}\n\n${SAT_UNAVAILABLE}`,
      html: `${textBlockHtml(physics.body)}${HTML_RULE}<div style="${WRAP_STYLE}"><p style="margin:0">${esc(SAT_UNAVAILABLE)}</p></div>`,
    };
  }
  return {
    subject: `Weekly progress update — ${input.studentName} (Physics and Digital SAT)`,
    text: `${physics.body}\n\n${TEXT_RULE}\n\n${renderSatSectionText(week)}`,
    html: `${textBlockHtml(physics.body)}${HTML_RULE}${renderSatSectionHtml(week)}`,
  };
}
