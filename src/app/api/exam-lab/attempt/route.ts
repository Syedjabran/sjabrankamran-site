import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { appendAttempt, type Attempt } from "@/lib/exam-lab/attempts";

export const runtime = "nodejs";

const qSchema = z.object({
  id: z.string().max(80),
  topic: z.string().max(80).nullable(),
  level: z.enum(["LOT", "HOT"]),
  paperType: z.enum(["P1", "P2", "P4"]),
  marks: z.number().int().min(0).max(30),
  earned: z.number().int().min(0).max(30).nullable(),
  correct: z.boolean().nullable(),
});

const schema = z.object({
  mode: z.enum(["paper", "drill"]),
  paperType: z.enum(["P1", "P2", "P4", "mixed"]),
  code: z.string().max(40).optional(),
  ref: z.string().max(60).optional(),
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  qCount: z.number().int().min(1).max(60),
  scoredCount: z.number().int().min(0).max(60),
  durationSec: z.number().int().min(0).max(20000).optional(),
  questions: z.array(qSchema).min(1).max(60),
});

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });

  const attempt: Attempt = { ts: Date.now(), ...parsed.data };
  const ok = await appendAttempt(user.id, attempt);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
