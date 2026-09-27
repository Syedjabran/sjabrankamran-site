// src/lib/sat/coach/profile.ts
//
// The student's SAT profile (SAT Coach spec 5): exam date or target month,
// target score, starting point, practice days and minutes per session.
// Pure and isomorphic -- no `@/` alias, no server imports -- so Node tests,
// the API route and the setup form all validate with the same rules.
//
// Dates are Pakistan calendar days ("YYYY-MM-DD", months "YYYY-MM") compared
// as plain strings; `today` is always passed in (the server computes it with
// pkToday), never read from a clock here.
import { z } from "zod";
import { zodIssueMessage } from "../zod-issue-message.ts";
import { mockDates } from "./planner.ts";

export type PracticeMinutes = 15 | 30 | 45 | 60;
export const PRACTICE_MINUTES: readonly PracticeMinutes[] = [15, 30, 45, 60];

export type StartingPoint =
  | { kind: "diagnostic" }
  | { kind: "score"; total: number; rw?: number; math?: number; source: "SAT" | "PSAT"; date?: string }
  | { kind: "skip" };

export interface SATProfile {
  examDate: string | null;
  targetMonth: string | null;
  targetScore: number;
  start: StartingPoint;
  days: number[];
  minutes: PracticeMinutes;
  createdAt: string;
  updatedAt: string;
  changes: { at: string; field: string; from: unknown; to: unknown }[];
}

export type ProfileInput = Omit<SATProfile, "createdAt" | "updatedAt" | "changes">;
export type ProfileField = keyof ProfileInput;

export const TARGET_MIN = 400;
export const TARGET_MAX = 1600;
export const SCORE_STEP = 10;
export const DEFAULT_TARGET = 1200;
export const DEFAULT_MINUTES: PracticeMinutes = 30;
/** How far ahead an exam date or target month may be. */
export const HORIZON_MONTHS = 18;
const CHANGES_CAP = 50;
const FIELDS: readonly ProfileField[] = ["examDate", "targetMonth", "targetScore", "start", "days", "minutes"];

// Official score scales: SAT 400-1600 (sections 200-800); the PSAT family
// (PSAT 8/9, PSAT 10, PSAT/NMSQT) spans 240-1520 (sections 120-760).
const SCALES = {
  SAT: { article: "An", total: [400, 1600], section: [200, 800] },
  PSAT: { article: "A", total: [240, 1520], section: [120, 760] },
} as const;

// --- calendar-day arithmetic ---------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");
const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
const fromUtcDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A real calendar day written "YYYY-MM-DD" (not "2026-02-30"). */
export function isCalendarDate(v: unknown): v is string {
  const m = typeof v === "string" ? DATE.exec(v) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** A month written "YYYY-MM". */
export function isCalendarMonth(v: unknown): v is string {
  const m = typeof v === "string" ? MONTH.exec(v) : null;
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** `b − a` in calendar days. */
export function daysBetween(a: string, b: string): number {
  return utcDay(...parts(b)) - utcDay(...parts(a));
}

export function addDays(date: string, days: number): string {
  return fromUtcDay(utcDay(...parts(date)) + days);
}

/** Same day `months` later, clamped to the month's last day (31 Aug + 18 → 29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** The last day the plan runs to: the exam date, or the first day of the target month. */
export function horizonEnd(p: Pick<SATProfile, "examDate" | "targetMonth">): string | null {
  if (p.examDate) return p.examDate;
  return p.targetMonth ? `${p.targetMonth}-01` : null;
}

/** The months a "Not booked yet" student may aim for: next month up to 18 months ahead. */
export function targetMonthOptions(today: string): string[] {
  const out: string[] = [];
  const last = addMonths(today, HORIZON_MONTHS);
  for (let i = 1; i <= HORIZON_MONTHS; i++) {
    const month = addMonths(`${today.slice(0, 7)}-01`, i).slice(0, 7);
    if (`${month}-01` > last) break;
    out.push(month);
  }
  return out;
}

/** The month picker's choices: targetMonthOptions, plus the saved month when
 *  it has since started -- first, so it can be kept while other settings
 *  change and the picker never shows blank. */
export function targetMonthChoices(today: string, saved: string | null): string[] {
  const list = targetMonthOptions(today);
  return saved && isCalendarMonth(saved) && !list.includes(saved) ? [saved, ...list] : list;
}

// --- validation ------------------------------------------------------------------

const onScale = (v: unknown, [lo, hi]: readonly [number, number]): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi && v % SCORE_STEP === 0;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isWeekday = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;

type Refine = z.RefinementCtx;
const fail = (ctx: Refine, message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });

function checkExamDate(v: unknown, ctx: Refine, today: string | null) {
  if (v === null) return;
  if (!isCalendarDate(v)) return fail(ctx, "Choose a valid SAT date.");
  if (today && v <= today) return fail(ctx, "Your SAT date must be after today.");
  if (today && v > addMonths(today, HORIZON_MONTHS)) fail(ctx, `Your SAT date must be within the next ${HORIZON_MONTHS} months.`);
}

function checkTargetMonth(v: unknown, ctx: Refine, today: string | null) {
  if (v === null) return;
  if (!isCalendarMonth(v)) return fail(ctx, "Choose a valid target month.");
  if (today && v <= today.slice(0, 7)) return fail(ctx, "Your target month must be after this month.");
  if (today && `${v}-01` > addMonths(today, HORIZON_MONTHS)) fail(ctx, `Your target month must be within the next ${HORIZON_MONTHS} months.`);
}

function checkPastScore(s: Extract<StartingPoint, { kind: "score" }>, ctx: Refine, today: string | null) {
  const scale = SCALES[s.source];
  const [lo, hi] = scale.total;
  if (!onScale(s.total, scale.total)) return fail(ctx, `${scale.article} ${s.source} total score runs from ${lo} to ${hi}, in steps of ${SCORE_STEP}.`, ["total"]);
  for (const key of ["rw", "math"] as const) {
    if (s[key] !== undefined && !onScale(s[key], scale.section)) {
      return fail(ctx, `${scale.article} ${s.source} section score runs from ${scale.section[0]} to ${scale.section[1]}, in steps of ${SCORE_STEP}.`, [key]);
    }
  }
  if (s.rw !== undefined && s.math !== undefined && s.rw + s.math !== s.total) return fail(ctx, "Your section scores must add up to your total.", ["total"]);
  if (s.date === undefined) return;
  if (!isCalendarDate(s.date)) return fail(ctx, "Choose a valid test date.", ["date"]);
  if (today && s.date > today) fail(ctx, "The date you took that test can’t be in the future.", ["date"]);
}

const sectionScore = z.custom<number>((v) => isNumber(v), { message: "Enter your section scores as numbers." }).optional();

function startSchema(today: string | null) {
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("diagnostic") }),
    z.object({
      kind: z.literal("score"),
      total: z.custom<number>((v) => isNumber(v), { message: "Enter your total score." }),
      rw: sectionScore,
      math: sectionScore,
      source: z.enum(["SAT", "PSAT"]),
      date: z.string().optional(),
    }),
    z.object({ kind: z.literal("skip") }),
  ]).superRefine((s, ctx) => {
    if (s.kind === "score" && isNumber(s.total)) checkPastScore(s, ctx, today);
  });
}

/** The stored date fields a save is judged against (see profileSchemaFor). */
export type StoredDates = Pick<SATProfile, "examDate" | "targetMonth">;

/** The profile schema; `today` switches on the date-window rules (future,
 *  within 18 months). Stored profiles are re-read with `today: null`, so an
 *  exam date that has since passed still loads. With `stored`, a date field
 *  sent back unchanged skips the window (it is still checked as a date): the
 *  window judges a date the student sets now, not one kept from before.
 *  Every rule a student can break carries a plain-sentence custom message,
 *  in the order the setup page asks. */
function buildSchema(today: string | null, stored: StoredDates | null = null) {
  const windowFor = (v: unknown, kept: string | null | undefined) => (kept != null && v === kept ? null : today);
  return z.object({
    examDate: z.custom<string | null>().superRefine((v, ctx) => checkExamDate(v, ctx, windowFor(v, stored?.examDate))),
    targetMonth: z.custom<string | null>().superRefine((v, ctx) => checkTargetMonth(v, ctx, windowFor(v, stored?.targetMonth))),
    targetScore: z.custom<number>((v) => onScale(v, [TARGET_MIN, TARGET_MAX]), {
      message: `Choose a target score between ${TARGET_MIN} and ${TARGET_MAX}, in steps of ${SCORE_STEP}.`,
    }),
    start: startSchema(today),
    days: z.custom<number[]>().superRefine((v, ctx) => {
      if (!Array.isArray(v) || v.length === 0) fail(ctx, "Choose at least one practice day.");
      else if (!v.every(isWeekday)) fail(ctx, "Practice days must be days of the week.");
    }),
    minutes: z.custom<PracticeMinutes>((v) => PRACTICE_MINUTES.includes(v as PracticeMinutes), {
      message: "Choose 15, 30, 45 or 60 minutes per session.",
    }),
  }).superRefine((p, ctx) => {
    if (p.examDate == null && p.targetMonth == null) fail(ctx, "Choose your SAT date, or pick “Not booked yet” and a month.", ["examDate"]);
  }).transform((p): ProfileInput => ({
    ...p,
    // A booked date wins: the month only stands in while there is no date.
    targetMonth: p.examDate ? null : p.targetMonth,
    days: [...new Set(p.days)].sort((a, b) => a - b),
  }));
}

/** Shape and score rules without the date window -- what a stored profile must satisfy. */
export const profileInputSchema: z.ZodType<ProfileInput, z.ZodTypeDef, unknown> = buildSchema(null);

/** The full rules for a save made on `today` (PKT) over the `stored`
 *  profile (null on the first save). The date-window rules -- after today /
 *  this month, within 18 months -- apply only to a date field that differs
 *  from the stored one, so a stored SAT date that has passed (or is today),
 *  or a target month that has started, never blocks saving the score, the
 *  target, the days or the minutes; a new date must still be in the window. */
export function profileSchemaFor(today: string, stored: StoredDates | null = null): z.ZodType<ProfileInput, z.ZodTypeDef, unknown> {
  return buildSchema(today, stored);
}

export function validateProfileInput(input: unknown, today: string, stored: StoredDates | null = null):
  { ok: true; value: ProfileInput } | { ok: false; error: string; field?: ProfileField } {
  const parsed = profileSchemaFor(today, stored).safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue?.code === "custom" ? FIELDS.find((f) => f === issue.path[0]) : undefined;
  return field ? { ok: false, error: issue.message, field } : { ok: false, error: zodIssueMessage(parsed.error) };
}

// --- change log ------------------------------------------------------------------

/** Deep equality for JSON values; an `undefined` property counts as absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  return [...keys].every((k) => sameValue(ra[k], rb[k]));
}

/** The next stored profile: `next`'s fields, one `changes` entry per field
 *  that differs from `prev` (newest 50 kept). A first save logs nothing. */
export function applyProfileChange(prev: SATProfile | null, next: ProfileInput, nowIso: string): SATProfile {
  const value: ProfileInput = {
    examDate: next.examDate, targetMonth: next.targetMonth, targetScore: next.targetScore,
    start: next.start, days: next.days, minutes: next.minutes,
  };
  if (!prev) return { ...value, createdAt: nowIso, updatedAt: nowIso, changes: [] };
  const added = FIELDS.filter((f) => !sameValue(prev[f], value[f])).map((field) => ({ at: nowIso, field, from: prev[field], to: value[field] }));
  return { ...value, createdAt: prev.createdAt, updatedAt: nowIso, changes: [...prev.changes, ...added].slice(-CHANGES_CAP) };
}

// --- setup defaults and preview ------------------------------------------------------

/** The default target: 1200, or a past score + 150 rounded to 10, within 400–1600. */
export function targetFromScore(total: number | null): number {
  if (total === null || !Number.isFinite(total)) return DEFAULT_TARGET;
  const rounded = Math.round((total + 150) / SCORE_STEP) * SCORE_STEP;
  return Math.min(TARGET_MAX, Math.max(TARGET_MIN, rounded));
}

const QUESTIONS_PER_SESSION: Record<PracticeMinutes, number> = { 15: 8, 30: 15, 45: 22, 60: 30 };

/** Roughly how many questions a session of this length holds. */
export function questionsPerSession(minutes: PracticeMinutes): number {
  return QUESTIONS_PER_SESSION[minutes];
}

/** "43 days to go · 6 full practice exams · 5 sessions a week of ~15
 *  questions" (spec 5). The full-exam count is the planner's own (mockDates:
 *  what a plan built today would hold); it is left out when there are none
 *  (the last 2 days before the SAT, or no date yet). */
export function previewLine(p: Pick<ProfileInput, "examDate" | "targetMonth" | "days" | "minutes">, today: string): string {
  const end = horizonEnd(p);
  const left = end ? daysBetween(today, end) : null;
  const sessions = p.days.length;
  const exams = end && left !== null && left > 0 ? mockDates(today, end, p.days).length : 0;
  return [
    left !== null && left > 0 ? `${left} ${left === 1 ? "day" : "days"} to go` : null,
    exams > 0 ? `${exams} full practice ${exams === 1 ? "exam" : "exams"}` : null,
    `${sessions} ${sessions === 1 ? "session" : "sessions"} a week of ~${questionsPerSession(p.minutes)} questions`,
  ].filter(Boolean).join(" · ");
}

export type DayPreset = "every" | "weekdays" | "weekends" | "once" | "custom";
export const DAY_PRESETS = {
  every: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
} as const satisfies Partial<Record<DayPreset, readonly number[]>>;

/** Which preset a saved set of days reads as. */
export function presetOf(days: readonly number[]): DayPreset {
  const key = [...days].sort((a, b) => a - b).join(",");
  for (const preset of ["every", "weekdays", "weekends"] as const) if (DAY_PRESETS[preset].join(",") === key) return preset;
  return days.length === 1 ? "once" : "custom";
}
