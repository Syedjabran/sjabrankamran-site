// src/app/api/sat/analytics/route.ts
//
// The signed-in student's full SAT analytics, for the Progress page (SAT
// Coach spec 7.4). Finished work only, computed and cached by
// analytics-data.ts. Staff have no personal analytics: 403. `mistakes`: the
// newest finished questions answered wrong, for the page's "Explain" links
// to the SAT tutor (ids and labels only -- never an answer).
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { studentAnalytics } from "@/lib/sat/analytics-data";
import { mistakeViews } from "@/lib/sat/coach/tutor";

export const runtime = "nodejs";

const RECENT_MISTAKES = 5;

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET() {
  const user = await getPortalUser();
  if (!user) return error("Please sign in.", 401);
  let access;
  try {
    access = await satAccess(user);
  } catch {
    return error("Your access couldn't be checked. Please try again.", 503);
  }
  if (!access.ok) return error("The SAT Lab is not part of your courses.", 403);
  if (access.isStaff) return error("Progress is for students — staff have no SAT history of their own.", 403);
  const result = await studentAnalytics(user.id, Date.now()).catch(() => null);
  if (!result) return error("Your progress couldn't be loaded. Please try again.", 503);
  return NextResponse.json({ analytics: result.analytics, mistakes: mistakeViews(result.history, RECENT_MISTAKES) });
}
