// src/app/api/sat/coach/route.ts
//
// Everything the SAT Lab home shows but "Coach says", in one call (SAT Coach
// spec 7.4): the profile, the study plan kept fresh by ensureSatPlan (today,
// the next 14 days, countdown, streak, this week), an analytics summary and
// this week's goals. "Coach says" comes from GET /api/sat/coach/insights,
// which the home asks for afterwards -- the plan never waits on the AI. A
// plan that can't be loaded never fails the call: the home still opens with
// planError and the rest (spec 11).
import { NextResponse } from "next/server";
import { pkToday } from "@/lib/portal/pk-time";
import { studentAnalytics } from "@/lib/sat/analytics-data";
import type { CoachPayload } from "@/lib/sat/client-types";
import { analyticsSummary, planView, weekItemsOf } from "@/lib/sat/coach/coach-view";
import { weeklyGoals } from "@/lib/sat/coach/goals";
import { currentWeak } from "@/lib/sat/coach/plan-logic";
import { ensureSatPlan, type SATPlan } from "@/lib/sat/coach/plan-store";
import { horizonEnd } from "@/lib/sat/coach/planner";
import { readProfile } from "@/lib/sat/coach/profile-store";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";

export const runtime = "nodejs";

const PLAN_UNAVAILABLE = "Your plan couldn't be loaded — retry.";

export async function GET() {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const { user } = caller;
  let profile;
  try {
    profile = await readProfile(user.id);
  } catch {
    return errorResponse(PLAN_UNAVAILABLE, 503);
  }
  if (!profile) return errorResponse("Set up your SAT plan first.", 404);

  const now = Date.now();
  const today = pkToday(now);
  const stats = await studentAnalytics(user.id, now).catch(() => null);
  const analytics = stats?.analytics ?? null;
  let plan: SATPlan | null = null;
  let planError: string | null = null;
  try {
    plan = await ensureSatPlan(user.id, today, { analytics, profile });
  } catch {
    planError = PLAN_UNAVAILABLE;
  }

  const end = horizonEnd(profile);
  const horizonPassed = end !== null && end < today;
  const goals = plan && !horizonPassed
    ? weeklyGoals({ analytics, weekItems: weekItemsOf(plan.items, today), today, targetScore: profile.targetScore, weakAtWeekStart: currentWeak(plan, today) })
    : [];

  const payload: CoachPayload = {
    today,
    profile: { examDate: profile.examDate, targetMonth: profile.targetMonth, targetScore: profile.targetScore },
    plan: plan ? planView(plan, today) : null,
    planError,
    horizonPassed,
    analyticsSummary: analytics ? analyticsSummary(analytics) : null,
    goals,
  };
  return NextResponse.json(payload);
}
