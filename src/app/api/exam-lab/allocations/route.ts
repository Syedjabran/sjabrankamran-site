import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listAllocations, getAllocation, markSubmitted } from "@/lib/exam-lab/allocations";
import { getSession, requestUnlock } from "@/lib/exam-lab/proctor";
import { completeTaskBySource } from "@/lib/portal/tasks";

export const runtime = "nodejs";

/** GET — the signed-in student's Exam Lab allocations (test status reconciled). */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const items = await listAllocations(user.id);

  // For strict tests the proctor session is the source of truth for lock state.
  const out = await Promise.all(items.map(async (it) => {
    if (it.mode !== "test") return it;
    const s = await getSession(user.id, it.attemptId);
    if (!s) return it;
    const map: Record<string, typeof it.status> = { locked: "locked", unlocked: "unlocked", submitted: "submitted", cancelled: "cancelled", active: "assigned" };
    return { ...it, status: map[s.status] ?? it.status };
  }));
  return NextResponse.json({ items: out }, { status: 200 });
}

/** POST — student updates their own allocation. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: string; action?: string; note?: string } | null;
  if (!b?.id || !b.action) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (b.action === "submitted") {
    const ok = await markSubmitted(user.id, b.id);
    if (ok) await completeTaskBySource(user.id, b.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (b.action === "unlock-request") {
    const alloc = await getAllocation(user.id, b.id);
    if (!alloc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const ok = await requestUnlock(user.id, alloc.attemptId, String(b.note || ""));
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
