// src/lib/sat/coach/insights-core.ts
//
// Pure "Coach says" builders (Node-testable, no server-only imports, no
// answer data, no `@/` alias -- SAT Coach spec 8.2): the LLM prompt, the
// zod-validated JSON parser, the deterministic rules fallback and the
// inputs fingerprint. `src/lib/sat/coach/insights.ts` (server) wires these
// to the LLM adapter and the cache; `InsightsView` (the client-safe output
// shape) lives in ../client-types.ts.
//
// AI data minimisation (global-constraints.md): the prompt carries only the
// first name (sanitised -- see sanitiseFirstName), days to exam, target,
// latest score, section accuracy, top weak/strong skills, pacing flags,
// this week's tallies and the next full exam. Never email, phone, guardian,
// school or photos.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SATScore, SATSection } from "../types.ts";
import type { InsightsView } from "../client-types.ts";
import type { LlmResult } from "../../ai/llm-core.ts";

/** The whole "Coach says" LLM call -- retry and fallback model included --
 *  ends within this long (its route runs for at most 60 s). */
export const INSIGHTS_DEADLINE_MS = 50_000;

/** Whether the view an LLM `result` led to may be cached for the day. A
 *  fallback caused by a passing provider failure -- a timeout, an HTTP
 *  error, the network -- is not, so the next visit tries again; a spent
 *  budget, no provider, or a reply that came back unusable is (retrying
 *  those on every visit would only spend budget on the same outcome). */
export function insightsCacheable(result: LlmResult): boolean {
  return result.ok || (result.reason !== "timeout" && result.reason !== "http");
}

export type InsightsSkill = { label: string; mastery: number };
export type InsightsPacingFlag = { label: string; medianSec: number; accuracy: number };

export type InsightsInput = {
  firstName: string;
  daysToExam: number | null;
  targetScore: number;
  latestScore: SATScore | null;
  sections: Record<SATSection, { accuracy: number | null }>;
  weakSkills: InsightsSkill[];    // top 5 (insightsPrompt slices defensively)
  strongSkills: InsightsSkill[];  // top 3 by mastery, confidence >= 3
  pacingFlags: InsightsPacingFlag[];
  week: { scheduled: number; done: number; late: number; missed: number };
  nextMock?: { date: string; title: string } | null;
};

const MAX_WEAK_SKILLS = 5;
const MAX_STRONG_SKILLS = 3;
/** Controller ruling (Task 5): the final two days before the exam keep
 *  challenges, so the coach's job in that window is test-day guidance. */
const TEST_DAY_THRESHOLD = 2;
const NAME_FALLBACK = "there";

/** The first word of `raw`, or "there" when `raw` has an "@" anywhere --
 *  an email (or a name field holding one) is never used, not even its
 *  local part, so no email or domain can reach an AI prompt. */
export function sanitiseFirstName(raw: string): string {
  if (raw.includes("@")) return NAME_FALLBACK;
  return raw.trim().split(/\s+/)[0] || NAME_FALLBACK;
}

function pct(fraction: number): number {
  return Math.round(fraction * 100);
}

function fmtDays(n: number): string {
  if (n <= 0) return "today";
  return `${n} ${n === 1 ? "day" : "days"}`;
}

// --- prompt -------------------------------------------------------------------

/** Compact system + user prompt (kept well under ~2,500 tokens: a handful
 *  of short skill/section rows, never the question bank or free text). */
export function insightsPrompt(input: InsightsInput): { system: string; user: string } {
  const name = sanitiseFirstName(input.firstName);
  const testDay = input.daysToExam !== null && input.daysToExam <= TEST_DAY_THRESHOLD;

  const system = [
    "You are a Digital SAT coach writing a short \"Coach says\" note for a self-study student.",
    "Voice: specific and encouraging, plain sentences, no filler and no generic motivational phrases.",
    "Never invent a score -- use only the latest score given, labelled exactly as given (official or estimated).",
    "Reply with ONLY a JSON object, no markdown fences and no prose outside it, exactly this shape: " +
      '{"headline": string, "summary": string, "tips": [{"title": string, "body": string, "skill": string (optional)}]}.',
    "headline is at most 90 characters. summary is at most two sentences and 280 characters. " +
      "At most 3 tips, each body at most 280 characters; set \"skill\" only when the tip names one specific skill to drill.",
    testDay
      ? "The student's exam is in 2 days or fewer: include one tip with test-day logistics and mindset advice (sleep, ID/admission ticket, arrival time, pacing) instead of a new drill."
      : null,
  ].filter((line): line is string => line !== null).join(" ");

  const user = JSON.stringify({
    name,
    daysToExam: input.daysToExam,
    targetScore: input.targetScore,
    latestScore: input.latestScore,
    sectionAccuracy: input.sections,
    weakSkills: input.weakSkills.slice(0, MAX_WEAK_SKILLS),
    strongSkills: input.strongSkills.slice(0, MAX_STRONG_SKILLS),
    pacingFlags: input.pacingFlags,
    thisWeek: input.week,
    nextFullExam: input.nextMock ?? null,
  });

  return { system, user };
}

// --- parsing / validation -------------------------------------------------------

const MAX_HEADLINE = 90;
const MAX_SUMMARY = 280;
const MAX_TIP_TITLE = 120;
const MAX_TIP_BODY = 280;
const MAX_TIPS = 3;
const MAX_SUMMARY_SENTENCES = 2;

/** A rough sentence count -- good enough to gate "at most two sentences"
 *  without a full NLP pass: consecutive non-terminator runs each ending in
 *  ./!/?, or one trailing run with no terminator at all. */
export function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const terminated = trimmed.match(/[^.!?]+[.!?]+/g) ?? [];
  const consumed = terminated.join("").length;
  return terminated.length + (consumed < trimmed.length ? 1 : 0);
}

const tipSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TIP_TITLE),
  body: z.string().trim().min(1).max(MAX_TIP_BODY),
  skill: z.string().trim().min(1).max(MAX_TIP_TITLE).optional(),
});

const insightsSchema = z.object({
  headline: z.string().trim().min(1).max(MAX_HEADLINE),
  summary: z.string().trim().min(1).max(MAX_SUMMARY).superRefine((s, ctx) => {
    if (sentenceCount(s) > MAX_SUMMARY_SENTENCES) ctx.addIssue({ code: "custom", message: "summary must be at most two sentences" });
  }),
  tips: z.array(tipSchema).max(MAX_TIPS),
});

// --- the unknown-number guard (no invented scores, spec 3 rule 3) ---------------

/** The lowest SAT section score: any number this big in AI text must be one
 *  of the numbers it was given, or it may be an invented score. */
const SCORE_LIKE_MIN = 200;
// "120 points", "50 pts", "7 percentage points", "a 150-point gain": a points
// figure must be one the AI was given, whatever its size (a score gain is
// still a score).
const POINTS = /(\d+)[\s-]*(?:percentage[\s-]+)?(?:points?|pts?)\b/gi;

/** True when every score-sized number (200 or more) in `text`, and every
 *  "N points" figure whatever its size, is one of `known` -- the guard both
 *  AI texts go through ("Coach says" here, the parent email's two-line
 *  summary in parent-report-core.ts). "1,200" reads as 1200. */
export function onlyKnownNumbers(text: string, known: ReadonlySet<number>): boolean {
  const plain = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const numbers = plain.match(/\d+/g) ?? [];
  const points = [...plain.matchAll(POINTS)].map((m) => Number(m[1]));
  return numbers.every((n) => Number(n) < SCORE_LIKE_MIN || known.has(Number(n))) && points.every((n) => known.has(n));
}

/** The numbers a "Coach says" text may state: every number in the prompt
 *  it was built from (the target, the latest range's bounds, days to go,
 *  this week's counts, pacing seconds...) and the whole percentages of its
 *  fractions (section accuracy, mastery, pacing accuracy). */
export function insightsKnownNumbers(input: InsightsInput): Set<number> {
  const known = new Set((insightsPrompt(input).user.match(/\d+/g) ?? []).map(Number));
  const fractions = [
    input.sections.rw.accuracy, input.sections.math.accuracy,
    ...input.weakSkills.map((s) => s.mastery), ...input.strongSkills.map((s) => s.mastery), ...input.pacingFlags.map((f) => f.accuracy),
  ];
  for (const f of fractions) if (typeof f === "number" && Number.isFinite(f)) known.add(pct(f));
  for (const f of input.pacingFlags) known.add(Math.round(f.medianSec));
  known.add(input.targetScore);
  if (input.latestScore) for (const n of [input.latestScore.lower, input.latestScore.upper]) known.add(n);
  return known;
}

/** Validates an AI reply's parsed JSON against the "Coach says" shape:
 *  headline <= 90 chars, summary <= 2 sentences/280 chars, <= 3 tips each
 *  with a body <= 280 chars -- and no score-sized number or "points" figure
 *  anywhere in it that `input` (what the prompt carried) doesn't hold. Returns
 *  null (never throws) on any mismatch, including non-object input, so the
 *  caller shows the rules view instead. */
export function parseInsights(json: unknown, input: InsightsInput): InsightsView | null {
  const parsed = insightsSchema.safeParse(json);
  if (!parsed.success) return null;
  const known = insightsKnownNumbers(input);
  const texts = [parsed.data.headline, parsed.data.summary, ...parsed.data.tips.flatMap((t) => [t.title, t.body, t.skill ?? ""])];
  if (!texts.every((text) => onlyKnownNumbers(text, known))) return null;
  return { ...parsed.data, source: "ai", generatedAt: new Date().toISOString() };
}

// --- deterministic fallback -----------------------------------------------------

/** Deterministic "Coach says" view built from rules alone (spec 8.2): the
 *  weakest skill, a pacing flag, this week's adherence and days to exam --
 *  used whenever AI is unavailable, over budget, or its reply doesn't
 *  parse. Never throws. */
export function fallbackInsights(input: InsightsInput): InsightsView {
  const weakest = input.weakSkills[0] ?? null;
  const pacing = input.pacingFlags[0] ?? null;
  const testDay = input.daysToExam !== null && input.daysToExam <= TEST_DAY_THRESHOLD;
  const missed = input.week.missed > 0;

  const headline = testDay
    ? `${fmtDays(input.daysToExam as number)} to your SAT`
    : weakest
      ? `Focus on ${weakest.label} this week`
      : input.daysToExam !== null
        ? `${fmtDays(input.daysToExam)} to your SAT`
        : "Keep building your SAT skills";

  const summaryParts: string[] = [];
  if (weakest) summaryParts.push(`Your weakest skill right now is ${weakest.label} at ${pct(weakest.mastery)}% mastery.`);
  if (missed) summaryParts.push(`You missed ${input.week.missed} of ${input.week.scheduled} session${input.week.scheduled === 1 ? "" : "s"} this week -- let's get back on track.`);
  else if (input.week.scheduled > 0) summaryParts.push(`You've completed ${input.week.done} of ${input.week.scheduled} sessions this week.`);
  else if (!weakest) summaryParts.push("Finish a session or two and your weekly picture shows up here.");
  const summary = summaryParts.slice(0, MAX_SUMMARY_SENTENCES).join(" ").slice(0, MAX_SUMMARY);

  const tips: { title: string; body: string; skill?: string }[] = [];
  if (testDay) {
    tips.push({
      title: "Test-day basics",
      body: "Sleep well tonight, lay out your admission ticket and photo ID, and arrive early. Pace yourself by section rather than by question.",
    });
  }
  if (weakest) {
    tips.push({
      title: `Drill ${weakest.label}`,
      body: `Spend today's session on ${weakest.label} -- it's your lowest mastery skill right now.`,
      skill: weakest.label,
    });
  }
  if (pacing) {
    tips.push({
      title: "Watch your pace",
      body: `You're averaging ${Math.round(pacing.medianSec)}s on ${pacing.label} -- practice a few questions against a visible clock.`,
      skill: pacing.label,
    });
  }
  if (missed) {
    tips.push({
      title: "Catch up this week",
      body: `You missed ${input.week.missed} session${input.week.missed === 1 ? "" : "s"} this week -- a short session today keeps your streak alive.`,
    });
  }

  return {
    headline: headline.slice(0, MAX_HEADLINE),
    summary: summary || "Keep practising -- your weekly summary appears here once you've finished a session.",
    tips: tips.slice(0, MAX_TIPS),
    source: "rules",
    generatedAt: new Date().toISOString(),
  };
}

// --- fingerprint ----------------------------------------------------------------

/** sha1 over every field that changes what the prompt/fallback would say,
 *  plus `today`: unchanged -> unchanged fingerprint -> the cached view is
 *  served as-is; either the inputs or the PKT calendar day moving on
 *  changes it, which is what tells `studentInsights` to regenerate. */
export function insightsFingerprint(input: InsightsInput, today: string): string {
  const rows = {
    today,
    daysToExam: input.daysToExam,
    targetScore: input.targetScore,
    latestScore: input.latestScore,
    sections: input.sections,
    weakSkills: input.weakSkills,
    strongSkills: input.strongSkills,
    pacingFlags: input.pacingFlags,
    week: input.week,
    nextMock: input.nextMock ?? null,
  };
  return createHash("sha1").update(JSON.stringify(rows)).digest("hex");
}
