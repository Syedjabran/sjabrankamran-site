// src/app/api/sat/tutor/action/route.ts
//
// Runs one action the tutor proposed, on the student's tap (SAT Coach spec
// 8.4): POST { id } -> { href, note? }. Only the latest reply's actions are
// live (410 once used or replaced); a drill goes through the shared filter
// schema and drill builder, a full-exam move through the planner's rules.
// Refused while a timed module runs (423).
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidRequest } from "@/lib/sat/zod-messages";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";
import { runTutorAction } from "@/lib/sat/coach/tutor";

export const runtime = "nodejs";

const body = z.object({
  id: z.custom<string>((v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v), { message: "That suggestion has expired — ask the tutor again." }),
});

export async function POST(req: Request) {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed);
  const done = await runTutorAction(caller.user.id, parsed.data.id);
  if (!done.ok) return errorResponse(done.error, done.status);
  return NextResponse.json({ href: done.href, ...(done.note ? { note: done.note } : {}) });
}
