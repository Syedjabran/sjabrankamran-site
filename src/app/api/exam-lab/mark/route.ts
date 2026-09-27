import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { questionById } from "@/lib/exam-lab/bank-all";
import { getAllocation, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { answerHash, helpAllowed, markAllowedAfterReveal, revealScope, takeHit, type MarkReceipt } from "@/lib/exam-lab/answer-rules";
import { readReveal } from "@/lib/exam-lab/reveals";
import { examLabKey } from "@/lib/exam-lab/keys";
import { signToken } from "@/lib/exam-lab/seal";
import { heldIds, readSitting } from "@/lib/exam-lab/sittings";
import { markWithMaxwell } from "@/lib/ai/maxwell";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(10).max(20000), id: z.string().max(80), answer: z.string().min(1).max(6000) });

// Per warm instance, per student (was per IP, which a class behind one
// school connection shared).
const hits = new Map<string, number[]>();

async function b64(supabase: ReturnType<typeof createAdminClient>, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("exam-assets").download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString("base64");
}

/**
 * POST — Maxwell marks one structured answer against the official scheme.
 * Its reply names the scheme points, so it is HELP: only in a help-allowed
 * sitting (practice, or a help-allowed assignment still open), only for a
 * question of that sitting, never for a question held back for the student
 * (an open test or no-help assignment), and -- once the question's mark
 * scheme has been revealed -- only for the answer frozen at the reveal.
 * Returns a signed receipt for exactly this answer: the attempt route counts
 * a structured mark only with it.
 */
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!takeHit(hits, user.id, Date.now(), 60_000, 12)) return NextResponse.json({ error: "Please slow down a moment." }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const sitting = readSitting(parsed.data.token, user.id);
  if (!sitting) return NextResponse.json({ error: "This sitting has expired. Go back and open it again." }, { status: 403 });
  if (!sitting.ids.includes(parsed.data.id)) return NextResponse.json({ error: "That question is not part of this sitting." }, { status: 403 });

  // Every course (9702, secure bank, O Level 5054) — IMAGE_BANK alone meant
  // O Level structured answers could never be AI-marked.
  const q = questionById(parsed.data.id);
  if (!q) return NextResponse.json({ error: "Unknown question." }, { status: 404 });
  if (q.paperType === "P1" || !q.ms_img) {
    return NextResponse.json({ error: "Maxwell marks structured questions only." }, { status: 400 });
  }

  let live: ExamAllocation | null = null;
  try {
    if (sitting.alloc) live = await getAllocation(user.id, sitting.alloc);
    if (!helpAllowed(sitting, live)) return NextResponse.json({ error: "Maxwell isn't available in this sitting." }, { status: 403 });
    if (!isExamLabStaff(user.roles) && (await heldIds(user.id, Date.now(), sitting.alloc)).has(q.id)) {
      return NextResponse.json({ error: "Maxwell isn't available for this question right now." }, { status: 403 });
    }
    const reveal = await readReveal(user.id, revealScope(sitting), q.id);
    if (reveal === null) throw new Error("reveals unreadable");
    if (!markAllowedAfterReveal(parsed.data.answer, reveal)) {
      return NextResponse.json({ error: "This answer is final: you've seen its mark scheme." }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Exam Lab is temporarily unavailable. Please retry." }, { status: 503 });
  }
  const receiptKey = examLabKey("receipt");
  if (!receiptKey) return NextResponse.json({ error: "Maxwell is unavailable right now." }, { status: 503 });

  const supabase = createAdminClient();
  const [qImg, msImg] = await Promise.all([b64(supabase, q.img), b64(supabase, q.ms_img)]);
  if (!qImg || !msImg) return NextResponse.json({ error: "Could not load the paper images." }, { status: 500 });

  const res = await markWithMaxwell({
    questionImage: qImg,
    markSchemeImage: msImg,
    answer: parsed.data.answer,
    outOf: q.marks || 1,
    topic: q.topic,
  });
  if (!res.ok || res.awarded === null) {
    return NextResponse.json({ error: "Maxwell couldn’t mark this one — reveal the mark scheme and self-mark." }, { status: 502 });
  }
  const receipt: MarkReceipt = {
    v: 1, uid: user.id, sid: sitting.sid, qid: q.id, h: answerHash(parsed.data.answer),
    awarded: res.awarded, outOf: res.outOf, iat: Date.now(),
  };
  return NextResponse.json(
    { ok: true, awarded: res.awarded, outOf: res.outOf, feedback: res.feedback, points: res.points, receipt: signToken(receipt, receiptKey) },
    { status: 200 }
  );
}
