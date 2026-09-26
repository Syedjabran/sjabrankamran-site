// src/app/api/sat/coach/route.ts
//
// Everything the SAT Lab home shows, in one call (SAT Coach spec 7.4): the
// profile, the study plan kept fresh by ensureSatPlan (today, the next 14
// days, countdown, streak, this week), an analytics summary, this week's
// goals and "Coach says" (ruling 9). A plan that can't be loaded never fails
// the call: the home still opens with planError and the rest.
import { NextResponse } from "next/server";
import { pkToday } from "@/lib/portal/pk-time";
import { studentAnalytics } from "@/lib/sat/analytics-data";
import { loadQuestionBank } from "@/lib/sat/bank";
import type { CoachPayload } from "@/lib/sat/client-types";
import { analyticsSummary, insightsInputOf, normaliseTipSkills, planView, weekItemsOf } from "@/lib/sat/coach/coach-view";
import { weeklyGoals } from "@/lib/sat/coach/goals";
import { studentInsights } from "@/lib/sat/coach/insights";
import { currentWeak } from "@/lib/sat/coach/plan-logic";
import { ensureSatPlan, type SATPlan } from "@/lib/sat/coach/plan-store";
import { horizonEnd } from "@/lib/sat/coach/planner";
import { readProfile } from "@/lib/sat/coach/profile-store";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";

export const runtime = "nodejs";

/** Every skill spelling the bank uses -- what a "Drill this" filter can match. */
function bankSkills(): string[] {
  return [...new Set(loadQuestionBank().map((q) => q.skill))];
}

export async function GET() {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const { user } = caller;
  let profile;
  try {
    profile = await readProfile(user.id);
  } catch {
    return errorResponse("Your SAT settings couldn't be loaded. Please try again.", 503);
  }
  if (!profile) return errorResponse("Set up your SAT plan first.", 404);

  const now = Date.now();
  const today = pkToday(now);
  const stats = await studentAnalytics(user.id, now).catch(() => null);
  const analytics = stats?.analytics ?? null;
  let plan: SATPlan | null = null;
  let planError: string | null = null;
  try {
    plan = await ensureSatPlan(user.id, today, { analytics });
  } catch {
    planError = "Your plan couldn't be loaded — retry.";
  }

  const end = horizonEnd(profile);
  const horizonPassed = end !== null && end < today;
  const view = plan ? planView(plan, today) : null;
  const goals = plan
    ? weeklyGoals({ analytics, weekItems: weekItemsOf(plan.items, today), today, targetScore: profile.targetScore, weakAtWeekStart: currentWeak(plan, today) })
    : [];
  const insights = await studentInsights(
    user.id,
    insightsInputOf({ firstName: user.fullName, targetScore: profile.targetScore, analytics, view, horizonPassed, today }),
    today,
  );

  const payload: CoachPayload = {
    today,
    profile: { examDate: profile.examDate, targetMonth: profile.targetMonth, targetScore: profile.targetScore },
    plan: view,
    planError,
    horizonPassed,
    analyticsSummary: analytics ? analyticsSummary(analytics) : null,
    goals: horizonPassed ? [] : goals,
    insights: normaliseTipSkills(insights, bankSkills()),
  };
  return NextResponse.json(payload);
}
