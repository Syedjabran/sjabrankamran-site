import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { helpAllowed } from "@/lib/exam-lab/answer-rules";
import { getAllocation, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { questionById } from "@/lib/exam-lab/bank-all";
import { heldIds, readSitting } from "@/lib/exam-lab/sittings";
import { imageUrls } from "@/lib/sat/signed-images";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(10).max(20000), id: z.string().min(1).max(80) });

const HELD = "This mark scheme isn't available right now.";

/**
 * POST — one question's official mark scheme WHILE sitting: only in a
 * help-allowed sitting (practice, or a help-allowed assignment still open),
 * only for a question of that sitting, and never for a question held back
 * for the student (in one of their open tests or no-help assignments). The
 * runner freezes the student's answer to that question once it is shown.
 * Tests and no-help assignments get their mark schemes from /review, after
 * submission.
 */
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const sitting = readSitting(parsed.data.token, user.id);
  if (!sitting) return NextResponse.json({ error: "This sitting has expired. Go back and open it again." }, { status: 403 });
  const id = parsed.data.id;
  if (!sitting.ids.includes(id)) return NextResponse.json({ error: "That question is not part of this sitting." }, { status: 403 });
  const q = questionById(id);
  if (!q?.ms_img) return NextResponse.json({ error: "There is no mark scheme for this question." }, { status: 404 });

  const now = Date.now();
  let live: ExamAllocation | null = null;
  try {
    if (sitting.alloc) live = await getAllocation(user.id, sitting.alloc);
    if (!helpAllowed(sitting, live)) return NextResponse.json({ error: "Mark schemes open after you submit." }, { status: 403 });
    if (!isExamLabStaff(user.roles) && (await heldIds(user.id, now, sitting.alloc)).has(id)) {
      return NextResponse.json({ error: HELD }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Exam Lab is temporarily unavailable. Please retry." }, { status: 503 });
  }
  const signed = await imageUrls([q.ms_img]);
  const url = signed.ok ? signed.urls[q.ms_img] : undefined;
  if (!url) return NextResponse.json({ error: "Could not load the mark scheme." }, { status: 500 });
  return NextResponse.json({ url }, { status: 200, headers: { "cache-control": "no-store" } });
}
