// src/app/api/sat/coach/insights/route.ts
//
// "Coach says" for the SAT Lab home (SAT Coach spec 8.2, ruling 9), apart
// from GET /api/sat/coach so the plan never waits on the AI: the home asks
// for it once the plan is showing. Built from the profile, the analytics,
// the stored plan (just refreshed by GET /api/sat/coach) and the student's
// first name; studentInsights never throws -- no AI, no budget or a bad
// reply gives the rules view. The student's finished-work key goes into
// its fingerprint, so every finished attempt brings a new card. Tip skills
// take the bank's own spelling so "Drill this" always finds questions.
import { NextResponse } from "next/server";
import { pkToday } from "@/lib/portal/pk-time";
import { studentAnalytics } from "@/lib/sat/analytics-data";
import { loadQuestionBank } from "@/lib/sat/bank";
import type { CoachInsightsPayload } from "@/lib/sat/client-types";
import { insightsInputOf, normaliseTipSkills, planView } from "@/lib/sat/coach/coach-view";
import { studentInsights } from "@/lib/sat/coach/insights";
import { INSIGHTS_DEADLINE_MS } from "@/lib/sat/coach/insights-core";
import { readPlan } from "@/lib/sat/coach/plan-store";
import { horizonEnd } from "@/lib/sat/coach/planner";
import { readProfile } from "@/lib/sat/coach/profile-store";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";

export const runtime = "nodejs";
// One LLM call at most (20 s timeout, one retry, the fallback model), all
// of it ending INSIGHTS_DEADLINE_MS (50 s) after the request started.
export const maxDuration = 60;

/** Every skill spelling the bank uses -- what a "Drill this" filter can match. */
function bankSkills(): string[] {
  return [...new Set(loadQuestionBank().map((q) => q.skill))];
}

export async function GET() {
  const startedAt = Date.now();
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const { user } = caller;
  let profile;
  try {
    profile = await readProfile(user.id);
  } catch {
    return errorResponse("Coach says couldn't be loaded. Please try again.", 503);
  }
  if (!profile) return errorResponse("Set up your SAT plan first.", 404);

  const now = Date.now();
  const today = pkToday(now);
  const [stats, plan] = await Promise.all([
    studentAnalytics(user.id, now).catch(() => null),
    readPlan(user.id).catch(() => null),
  ]);
  const end = horizonEnd(profile);
  const input = insightsInputOf({
    firstName: user.fullName, targetScore: profile.targetScore, analytics: stats?.analytics ?? null,
    view: plan ? planView(plan, today) : null, horizonPassed: end !== null && end < today, today,
  });
  const payload: CoachInsightsPayload = { insights: normaliseTipSkills(await studentInsights(user.id, input, today, { deadlineAt: startedAt + INSIGHTS_DEADLINE_MS, work: stats?.work }), bankSkills()) };
  return NextResponse.json(payload);
}
