import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin, audit } from "@/lib/portal/admin";
import { getPortalUser, isAdmin, isStaff } from "@/lib/edu/auth";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { createAdminClient } from "@/lib/supabase/admin";
import { listLocks, getSession, signSnapshots, unlockTest } from "@/lib/exam-lab/proctor";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Student uids enrolled (active) in any of the given classes. */
async function studentsInClasses(classIds: string[]): Promise<Set<string>> {
  if (!classIds.length) return new Set();
  const { data } = await createAdminClient()
    .from("edu_enrolments")
    .select("edu_students(profile_id)")
    .in("class_id", classIds)
    .eq("status", "active");
  return new Set(
    ((data || []) as unknown as { edu_students?: { profile_id?: string } }[])
      .map((r) => r.edu_students?.profile_id)
      .filter((x): x is string => !!x),
  );
}

/**
 * Review of locked strict tests.
 *   GET  ?list=1                     → the lock queue
 *   GET  ?uid=..&attemptId=..        → one forensic session + signed snapshots
 *   POST { uid, attemptId, note }    → unlock a test (SUPER-ADMIN only)
 *
 * GET is open to staff (the page already is): admins see every lock, other
 * staff only locks of students in the classes they can see — the same class
 * visibility the drill-records routes use. Out-of-scope sessions answer 404.
 */
export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user || !isStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const url = new URL(req.url);
  const scope = isAdmin(user.roles) ? null : await studentsInClasses(await visibleClassIdsForUid(user.id, user.roles));
  const inScope = (uid: string) => !scope || scope.has(uid);

  if (url.searchParams.get("list") === "1") {
    const locks = (await listLocks()).filter((l) => inScope(l.uid));
    return NextResponse.json({ locks }, { status: 200 });
  }

  const uid = url.searchParams.get("uid");
  const attemptId = url.searchParams.get("attemptId");
  if (uid && attemptId) {
    // getSession rejects ids that are not plain ids (they form a storage key).
    if (!inScope(uid)) return NextResponse.json({ error: "Not found." }, { status: 404 });
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
