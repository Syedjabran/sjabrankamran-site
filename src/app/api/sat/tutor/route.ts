// src/app/api/sat/tutor/route.ts
//
// The Digital SAT Tutor (SAT Coach spec 8.4). GET: the student's chat,
// messages left today, whether the tutor is paused and their newest
// finished wrong answer. POST { message, explainQuestionId? }: one turn ->
// { reply, actions, remaining }. Paused while a timed module runs (423,
// not counted); 40 messages a day (429). Students only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidRequest } from "@/lib/sat/zod-messages";
import { errorResponse, satStudent } from "@/lib/sat/coach/student-guard";
import { tutorHistory, tutorTurn } from "@/lib/sat/coach/tutor";
import { MAX_MESSAGE_CHARS } from "@/lib/sat/coach/tutor-core";

export const runtime = "nodejs";
// One turn can wait on the model (20 s per attempt, a retry and a fallback).
export const maxDuration = 60;

const QUESTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

const body = z.object({
  message: z.custom<string>((v) => typeof v === "string" && v.length <= MAX_MESSAGE_CHARS, { message: `Keep your message under ${MAX_MESSAGE_CHARS} characters.` }).optional(),
  explainQuestionId: z.custom<string>((v) => typeof v === "string" && QUESTION_ID.test(v), { message: "That question can't be explained." }).optional(),
}).superRefine((b, ctx) => {
  if (!b.explainQuestionId && !b.message?.trim()) ctx.addIssue({ code: "custom", message: "Type a message first." });
});

export async function GET() {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const history = await tutorHistory(caller.user.id);
  if ("error" in history) return errorResponse(history.error, history.status);
  return NextResponse.json(history);
}

export async function POST(req: Request) {
  const caller = await satStudent();
  if ("refused" in caller) return caller.refused;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed);
  const turn = await tutorTurn(caller.user.id, caller.user.fullName, parsed.data.message ?? "", parsed.data.explainQuestionId);
  if ("error" in turn) return errorResponse(turn.error, turn.status);
  return NextResponse.json(turn);
}
