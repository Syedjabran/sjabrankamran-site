import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { revealAfterSubmit } from "@/lib/exam-lab/answer-rules";
import { getAllocation, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { getAttemptsStrict, type Attempt } from "@/lib/exam-lab/attempts";
import { questionById } from "@/lib/exam-lab/bank-all";
import { heldIds, readSitting } from "@/lib/exam-lab/sittings";
import { imageUrls } from "@/lib/sat/signed-images";

export const runtime = "nodejs";

// `fresh`: questions whose mark-scheme image failed to load -- signed again
// (a new signature is a genuinely new request: the one retry).
const schema = z.object({ token: z.string().min(10).max(20000), fresh: z.array(z.string().max(80)).max(80).optional() });

type Item = { answer?: string; correct?: boolean | null; ms?: string; held?: true };

/**
 * POST — a finished sitting's results, from its STORED attempt: the MCQ
 * score always; per question, the correct letter, whether the student had it
 * and the official mark scheme only where the product shows them after
 * submission (everything but a proctored test), and never for a question
 * still held back for the student elsewhere (an open test or no-help
 * assignment). An allocation must already be marked submitted, so a sitting
 * that is still open (or re-openable) never sees its answers.
 */
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const sitting = readSitting(parsed.data.token, user.id);
  if (!sitting) return NextResponse.json({ error: "This sitting has expired. Your answers are saved — see My question records." }, { status: 403 });

  const now = Date.now();
  let attempt: Attempt | undefined;
  let alloc: ExamAllocation | null = null;
  let held: Set<string>;
  try {
    const attempts = await getAttemptsStrict(user.id);
    // A practice sitting's own attempt; an allocation's recorded submission
    // (which may be an earlier sitting of it, when it was reopened).
    attempt = [...attempts].reverse().find((a) => !a.context?.cancelled && (sitting.alloc ? a.context?.allocationId === sitting.alloc : a.context?.sittingId === sitting.sid));
    if (!attempt) return NextResponse.json({ error: "Submit your answers first." }, { status: 409 });
    if (sitting.alloc) {
      alloc = await getAllocation(user.id, sitting.alloc);
      if (!alloc || alloc.status !== "submitted") return NextResponse.json({ error: "Submit your answers first." }, { status: 409 });
    }
    // Held as of the sitting's opening (not now): when a hold starts is
    // plannable (a test's start - 14 days), so judging it now would let a
    // sitting blank-submitted just before and reviewed just after name the
    // test's questions.
    held = isExamLabStaff(user.roles) ? new Set() : await heldIds(user.id, sitting.iat, sitting.alloc);
  } catch {
    return NextResponse.json({ error: "Exam Lab is temporarily unavailable. Please retry." }, { status: 503 });
  }

  const own = new Set(sitting.ids);
  const mine = attempt.questions.filter((q) => own.has(q.id));
  const mcqs = mine.filter((q) => q.paperType === "P1");
  const mcq = { got: mcqs.filter((q) => q.correct === true).length, total: mcqs.length };
  if (!revealAfterSubmit(sitting.strict, alloc?.mode ?? null)) {
    return NextResponse.json({ mcq }, { status: 200, headers: { "cache-control": "no-store" } });
  }

  const items: Record<string, Item> = {};
  const msPaths: Record<string, string> = {};
  for (const aq of mine) {
    if (held.has(aq.id)) { items[aq.id] = { held: true }; continue; }
    const bq = questionById(aq.id);
    if (!bq) continue;
    if (bq.paperType === "P1") items[aq.id] = { answer: bq.answer ?? undefined, correct: aq.correct };
    else {
      items[aq.id] = {};
      if (bq.ms_img) msPaths[aq.id] = bq.ms_img;
    }
  }
  const again = new Set(parsed.data.fresh ?? []);
  const reuse = Object.entries(msPaths).filter(([id]) => !again.has(id));
  const renew = Object.entries(msPaths).filter(([id]) => again.has(id));
  const none = { ok: true as const, urls: {} as Record<string, string> };
  const [signed, resigned] = await Promise.all([
    reuse.length ? imageUrls(reuse.map(([, p]) => p)) : none,
    renew.length ? imageUrls(renew.map(([, p]) => p), { fresh: true }) : none,
  ]);
  for (const [list, got] of [[reuse, signed], [renew, resigned]] as const) {
    if (got.ok) for (const [id, path] of list) if (got.urls[path]) items[id].ms = got.urls[path];
  }
  return NextResponse.json({ mcq, items }, { status: 200, headers: { "cache-control": "no-store" } });
}
