import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { takeHit } from "@/lib/exam-lab/answer-rules";
import { examLabKey } from "@/lib/exam-lab/keys";
import { markSet, practiceSetOk, type PracticeSetPayload } from "@/lib/exam-lab/practice-set";
import { openSealed } from "@/lib/exam-lab/seal";

export const runtime = "nodejs";

const schema = z.object({
  mode: z.enum(["public", "portal"]).default("portal"),
  /** The sealed set /api/exam-lab/generate issued with the questions. */
  set: z.string().min(20).max(400_000),
  answers: z.record(z.string(), z.number().int().min(0).max(3)), // qId -> chosen option index (MCQ only)
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

// Per warm instance: a practice paper is submitted once; a wall for scripts.
const hits = new Map<string, number[]>();

/**
 * POST — marks a WHOLE generated practice set and returns its answers and
 * mark schemes. Only a set /generate issued (sealed, unreadable in the
 * browser), for the same mode and -- in the portal -- the same student, and
 * no older than a few hours: it cannot check a hand-picked question id, one
 * at a time, against the key.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!takeHit(hits, ip, Date.now(), 60_000, 20)) return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  const d = parsed.data;

  let uid: string | null = null;
  if (d.mode === "portal") {
    const user = await getPortalUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    uid = user.id;
  }
  const key = examLabKey("practice-set");
  const set = key ? openSealed<PracticeSetPayload>(d.set, key) : null;
  if (!practiceSetOk(set, { mode: d.mode, uid, now: Date.now() })) {
    return NextResponse.json({ error: "This practice paper has expired. Generate a new one." }, { status: 400 });
  }

  // Authoritative MCQ score (1 mark each), and the answers + schemes to show.
  const { mcqScore, mcqTotal, items } = markSet(set, d.answers);

  let stored = false;
  if (d.mode === "portal" && uid) {
    try {
      const supabase = createAdminClient();
      const { data: test } = await supabase
        .from("el_tests")
        .insert({ mode: "portal", config: d.config, question_ids: set.items.map((it) => it.id), created_by: uid })
        .select("id")
        .single();
      if (test?.id) {
        await supabase.from("el_attempts").insert({
          test_id: test.id,
          user_id: uid,
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

  return NextResponse.json({ ok: true, mcqScore, mcqTotal, stored, items }, { status: 200, headers: { "cache-control": "no-store" } });
}
