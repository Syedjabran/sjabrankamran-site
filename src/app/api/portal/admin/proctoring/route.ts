import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin, audit } from "@/lib/portal/admin";
import { listLocks, getSession, signSnapshots, unlockTest } from "@/lib/exam-lab/proctor";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Super-admin / admin review of locked strict tests.
 *   GET  ?list=1                     → the lock queue (admins)
 *   GET  ?uid=..&attemptId=..        → one forensic session + signed snapshots
 *   POST { uid, attemptId, note }    → unlock a test (SUPER-ADMIN only)
 */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const url = new URL(req.url);

  if (url.searchParams.get("list") === "1") {
    const locks = await listLocks();
    return NextResponse.json({ locks }, { status: 200 });
  }

  const uid = url.searchParams.get("uid");
  const attemptId = url.searchParams.get("attemptId");
  if (uid && attemptId) {
    const session = await getSession(uid, attemptId);
    if (!session) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const snapshots = await signSnapshots(session);
    return NextResponse.json({ session: { ...session, snapshots: undefined }, snapshots }, { status: 200 });
  }
  return NextResponse.json({ error: "Provide list=1 or uid+attemptId." }, { status: 400 });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can unlock a test." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { uid?: string; attemptId?: string; note?: string } | null;
  if (!b?.uid || !b.attemptId) return NextResponse.json({ error: "uid and attemptId are required." }, { status: 400 });
  const ok = await unlockTest(b.uid, b.attemptId, admin.id, admin.fullName || admin.email, String(b.note || ""));
  if (!ok) return NextResponse.json({ error: "Could not unlock (session not found)." }, { status: 400 });
  await audit(admin.id, "proctor.unlock", "exam_test", b.attemptId, { student: b.uid, note: b.note || "" });
  return NextResponse.json({ ok: true }, { status: 200 });
}
