// src/lib/sat/coach/parent-report.ts
//
// SERVER-ONLY. The data behind the SAT section of the Saturday parent email
// (SAT Coach spec 9): the student's plan, profile, analytics and the
// finished items of this week and the week before, assembled by the pure
// satWeekFrom (parent-report-core.ts), plus the two-line AI summary.
//
// Read-only: the plan is read, never maintained here -- an unfinished day
// that is over counts as missed and a finish the plan hasn't recorded
// counts as done, from the summaries (parent-report-core.ts outcomeOf).
// Storage fails closed: any failed read throws (the caller decides what the
// email says), and "no SAT" / "no SAT profile" is null.
//
// The AI summary costs one "parent" budget call per student; any failure
// (no provider, spent budget, a reply that doesn't validate) falls back to
// the deterministic summary -- never an error.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { complete } from "@/lib/ai/llm";
import { pkToday } from "@/lib/portal/pk-time";
import { satAccess } from "../access.ts";
import { studentAnalytics } from "../analytics-data.ts";
import { hasFinishedWork } from "../analytics.ts";
import { itemsOf } from "../serve.ts";
import { listSummaries, loadDocs } from "../store.ts";
import { doneMapFrom } from "./plan-logic.ts";
import { readPlan } from "./plan-store.ts";
import { readProfile } from "./profile-store.ts";
import { parseSummary, reportWeek, satWeekFrom, summaryPrompt, type SatWeek } from "./parent-report-core.ts";

export type { SatWeek };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// A two-sentence JSON reply fits easily; headroom for a model that thinks aloud.
const SUMMARY_MAX_TOKENS = 400;

export type SatWeekOptions = {
  /** Ask the AI for the two-line summary (else the deterministic one). */
  ai: boolean;
  /** The student's full name when the caller already has it (else read). */
  fullName?: string;
  /** The caller already confirmed SAT access (the weekly run resolves every
   *  course at once), so it isn't read twice. */
  accessChecked?: boolean;
};

const unreadable = (what: string) => new Error(`The student's ${what} couldn't be read.`);

async function fullNameOf(uid: string): Promise<string> {
  const { data, error } = await createAdminClient().from("edu_profiles").select("full_name").eq("id", uid).maybeSingle();
  if (error) throw unreadable("name");
  return (data?.full_name as string | null | undefined) ?? "";
}

/** The two-line summary from the AI, validated; null on any failure. */
async function aiSummary(uid: string, week: SatWeek): Promise<string | null> {
  try {
    const { system, user } = summaryPrompt(week);
    const result = await complete(
      { system, messages: [{ role: "user", content: user }], json: true, maxTokens: SUMMARY_MAX_TOKENS, temperature: 0.4 },
      "parent",
      uid,
    );
    return result.ok ? parseSummary(result.json, week) : null;
  } catch {
    return null;
  }
}

/**
 * The student's SAT week for the parent email, counted up to `weekKey` (the
 * run's PKT day, "YYYY-MM-DD"): null when the student has no SAT access or
 * hasn't set SAT up (no profile). Throws when anything can't be read.
 */
export async function buildSatWeek(uid: string, weekKey: string, opts: SatWeekOptions): Promise<SatWeek | null> {
  if (!DAY.test(weekKey)) throw new Error("The report week must be a YYYY-MM-DD day.");
  if (!opts.accessChecked) {
    const access = await satAccess({ id: uid, email: "", fullName: "", roles: ["student"], status: "active" });
    if (!access.ok || access.isStaff) return null;
  }
  const profile = await readProfile(uid);
  if (!profile) return null;

  // The summaries are read once: the week's docs come from them, and both go
  // on to the analytics, which then reads neither again.
  const summaries = await listSummaries(uid);
  if (summaries === null) throw unreadable("SAT history");
  // Only docs with finished work that can hold an item answered since the
  // week before this one: a drill's items are dated at its finish (or its
  // start while open), a sitting's between its start and its finish.
  const week = reportWeek(weekKey);
  const recent = summaries.filter((s) => hasFinishedWork(s)
    && pkToday(s.finishedAt ?? s.createdAt) >= week.prevStart && pkToday(s.createdAt) <= week.runDate);
  const docs = await loadDocs(uid, recent.map((s) => s.id));
  if (docs === null) throw unreadable("SAT sessions");

  const [plan, stats, fullName] = await Promise.all([
    readPlan(uid),
    studentAnalytics(uid, Date.now(), { summaries, docs }),
    opts.fullName ?? fullNameOf(uid),
  ]);
  if (!stats) throw unreadable("SAT analytics");

  const planItems = plan?.items ?? [];
  const base = satWeekFrom({
    fullName,
    runDate: weekKey,
    profile,
    planItems,
    done: doneMapFrom(summaries, planItems),
    analytics: stats.analytics,
    summaries,
    items: docs.flatMap((doc) => itemsOf(doc)),
  });
  if (!opts.ai) return base;
  const summary = await aiSummary(uid, base);
  return summary ? { ...base, summary, summarySource: "ai" } : base;
}
