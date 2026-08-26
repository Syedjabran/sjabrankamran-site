import { NextResponse } from "next/server";
import { z } from "zod";
import { BANK } from "@/lib/exam-lab/bank";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  mode: z.enum(["public", "portal"]).default("portal"),
  questionIds: z.array(z.string().max(64)).min(1).max(60),
  answers: z.record(z.string(), z.number().int().min(0).max(3)), // qId -> chosen option index (MCQ only)
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Authoritative MCQ marking from the seed bank + ingested portal bank. */
async function correctAnswers(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const q of BANK) {
    if (ids.includes(q.id) && q.type === "mcq" && typeof q.ans === "number") map.set(q.id, q.ans);
  }
  const uuidIds = ids.filter((id) => !id.startsWith("seed-") && !id.startsWith("ai-"));
  if (uuidIds.length) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("el_questions")
        .select("id,qtype,answer_index")
        .in("id", uuidIds);
      for (const r of data ?? []) {
        if (r.qtype === "mcq" && typeof r.answer_index === "number") map.set(r.id as string, r.answer_index as number);
      }
    } catch {
      /* table not migrated yet — ignore */
    }
  }
  return map;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  const d = parsed.data;

  // Authoritative MCQ score (1 mark each).
  const correct = await correctAnswers(d.questionIds);
  let mcqTotal = 0;
  let mcqScore = 0;
  for (const id of d.questionIds) {
    if (!correct.has(id)) continue;
    mcqTotal += 1;
    if (d.answers[id] === correct.get(id)) mcqScore += 1;
  }

  let stored = false;
  if (d.mode === "portal") {
    const user = await getPortalUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    try {
      const supabase = createAdminClient();
      const { data: test } = await supabase
        .from("el_tests")
        .insert({ mode: "portal", config: d.config, question_ids: d.questionIds, created_by: user.id })
        .select("id")
        .single();
      if (test?.id) {
        await supabase.from("el_attempts").insert({
          test_id: test.id,
          user_id: user.id,
          answers: d.answers,
          mcq_score: mcqScore,
          mcq_total: mcqTotal,
        });
        stored = true;
      }
    } catch {
      /* tables not migrated yet — marking still returned, logging skipped */
    }
  }

  return NextResponse.json({ ok: true, mcqScore, mcqTotal, stored }, { status: 200 });
}
