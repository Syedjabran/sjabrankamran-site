import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listAllocations, getAllocation, markSubmitted, markStarted, withProctorStatus } from "@/lib/exam-lab/allocations";
import { getAttemptsStrict } from "@/lib/exam-lab/attempts";
import { getSession, requestUnlock } from "@/lib/exam-lab/proctor";
import { completeTaskBySource } from "@/lib/portal/tasks";

export const runtime = "nodejs";

const UNAVAILABLE = () => NextResponse.json({ error: "Exam Lab is temporarily unavailable. Please retry." }, { status: 503 });

/** GET — the signed-in student's Exam Lab allocations (test status reconciled). */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let items;
  try { items = await listAllocations(user.id); } catch { return UNAVAILABLE(); }

  // For strict tests the proctor session is the source of truth for lock state.
  const out = await Promise.all(items.map((it) => withProctorStatus(user.id, it)));
  return NextResponse.json({ items: out }, { status: 200 });
}

/** POST — student updates their own allocation. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: string; action?: string; note?: string } | null;
  if (!b?.id || !b.action) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (b.action === "started") {
    // Persist the sitting's start on the server (first call wins) so a reload
    // or Back-and-reopen resumes the same clock instead of a full new one.
    // `now` lets the runner convert to its own clock without trusting it.
    try {
      const alloc = await getAllocation(user.id, b.id);
      if (!alloc) return NextResponse.json({ error: "Not found." }, { status: 404 });
      // A super-admin unlock grants ONE fresh sitting: the proctor session is
      // then "unlocked", or already re-opened (its start is newer than ours).
      let restart = false;
      const session = await getSession(user.id, alloc.attemptId);
      if (session) restart = session.status === "unlocked" || (session.status === "active" && !!alloc.startedAt && session.startedAt > alloc.startedAt);
      const it = await markStarted(user.id, b.id, restart);
      if (!it) return NextResponse.json({ error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, startedAt: it.startedAt ?? null, now: Date.now(), status: it.status }, { status: 200 });
    } catch { return UNAVAILABLE(); }
  }

  if (b.action === "submitted") {
    // Score-integrity gate (owner rule): a submission only counts — and only
    // completes its linked task/challenge — when the stored attempt for this
    // allocation actually contains at least one attempted answer. Blank
    // submissions are still marked submitted (the record is kept) but flagged
    // "unattempted" and earn zero points/credit. A genuine submission that ran
    // past the countdown is flagged "late submission". The runner posts this
    // only AFTER its attempt was stored, so a missing linked attempt means
    // nothing was recorded: unattempted. An unreadable attempts doc is retried
    // by the runner rather than guessed.
    let flags: { late?: boolean; unattempted?: boolean };
    try {
      const attempts = await getAttemptsStrict(user.id);
      const linked = attempts.filter((a) => a.context?.allocationId === b.id && !a.context?.cancelled);
      const last = linked[linked.length - 1];
      if (!last) flags = { unattempted: true };
      else {
        const attempted = typeof last.attemptedCount === "number"
          ? last.attemptedCount
          : last.questions.filter((q) => (q.response && q.response.trim()) || q.correct !== null || q.earned !== null).length;
        flags = attempted === 0 ? { unattempted: true } : last.context?.late ? { late: true } : {};
      }
    } catch { return UNAVAILABLE(); }
    let ok: boolean;
    try { ok = await markSubmitted(user.id, b.id, flags); } catch { return UNAVAILABLE(); }
    // Blank submissions do NOT auto-complete the linked personal task/challenge.
    if (ok && !flags.unattempted) await completeTaskBySource(user.id, b.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (b.action === "unlock-request") {
    let alloc;
    try { alloc = await getAllocation(user.id, b.id); } catch { return UNAVAILABLE(); }
    if (!alloc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const ok = await requestUnlock(user.id, alloc.attemptId, String(b.note || ""));
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
