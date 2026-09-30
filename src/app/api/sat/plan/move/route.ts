// src/app/api/sat/plan/move/route.ts
//
// Moves one of the student's full exams to another day (SAT Coach spec
// 6.4): only a scheduled, unstarted full exam, at most twice, to today or
// later, at least 2 days before the SAT, and not onto a day that already
// has one -- each rule refused in its own plain sentence (planner.ts
// checkMove). Answers the refreshed plan view.
import { NextResponse } from "next/server";
import { z } from "zod";
import { pkToday } from "@/lib/portal/pk-time";
import { invalidRequest } from "@/lib/sat/zod-messages";
import { planView } from "@/lib/sat/coach/coach-view";
import { moveMock } from "@/lib/sat/coach/plan-store";
import { isCalendarDate } from "@/lib/sat/coach/profile";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";

export const runtime = "nodejs";

const body = z.object({
  itemId: z.custom<string>((v) => typeof v === "string" && v.length >= 1 && v.length <= 64, { message: "Choose a full exam to move." }),
  date: z.custom<string>((v) => isCalendarDate(v), { message: "Pick a valid day." }),
});

export async function POST(req: Request) {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed);
  let moved;
  try {
    moved = await moveMock(caller.user.id, parsed.data.itemId, parsed.data.date);
  } catch {
    return errorResponse("Your plan couldn't be saved. Please try again.", 503);
  }
  if (!moved.ok) return errorResponse(moved.error, moved.status);
  return NextResponse.json({ plan: planView(moved.plan, pkToday()) });
}
