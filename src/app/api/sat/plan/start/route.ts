// src/app/api/sat/plan/start/route.ts
//
// Starts (or reopens) one item of the student's study plan (SAT Coach Task
// 9): a daily challenge or review day built now from the latest analytics,
// the diagnostic, or a full exam sitting -- only items dated today or
// earlier and not finished (plan-store.ts startPlanItem). `{ id }` is the
// drill/sitting to open.
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidRequest } from "@/lib/sat/zod-messages";
import { startPlanItem } from "@/lib/sat/coach/plan-store";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";

export const runtime = "nodejs";

const body = z.object({
  itemId: z.custom<string>((v) => typeof v === "string" && v.length >= 1 && v.length <= 64, { message: "Choose something from your plan to start." }),
});

export async function POST(req: Request) {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed);
  let started;
  try {
    started = await startPlanItem(caller.user.id, parsed.data.itemId);
  } catch {
    return errorResponse("Your plan couldn't be loaded. Please try again.", 503);
  }
  if (!started.ok) return errorResponse(started.error, started.status);
  return NextResponse.json({ id: started.sessionId });
}
