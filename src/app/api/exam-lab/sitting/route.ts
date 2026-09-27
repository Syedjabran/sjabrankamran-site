import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { takeHit } from "@/lib/exam-lab/answer-rules";
import { openAllocation, openPractice, practiceHolds, UNAVAILABLE, type SittingResult } from "@/lib/exam-lab/sittings";

export const runtime = "nodejs";

const level = z.enum(["LOT", "HOT"]);
const topic = z.string().min(1).max(80);
const practice = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paper"), code: z.string().min(3).max(40) }),
  z.object({ type: z.literal("drill"), paperType: z.enum(["P1", "P2", "P4"]), topics: z.array(topic).max(40), levels: z.array(level).min(1).max(2), count: z.number().int().min(1).max(40) }),
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("focus"), topics: z.array(topic).min(1).max(20) }),
]);
const schema = z.union([
  z.object({ allocationId: z.string().min(1).max(80) }),
  z.object({ practice, course: z.enum(["9702", "5054"]), mode: z.enum(["practice", "exam", "test"]) }),
]);

// Per warm instance: generous for real use, a wall for scripted harvesting.
const hits = new Map<string, number[]>();

/**
 * POST — open an Exam Lab sitting: one of the caller's allocations (only
 * once it has opened), or a self-serve practice paper / drill / daily
 * challenge / focus drill in a course they may use. Returns the questions
 * with no answers or mark-scheme paths, their signed images, and the signed
 * sitting token every later call of the sitting carries.
 */
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });
  if (!takeHit(hits, user.id, Date.now(), 60_000, 30)) return NextResponse.json({ error: "Please slow down a moment." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const d = parsed.data;

  let result: SittingResult;
  if ("allocationId" in d) {
    result = await openAllocation(user.id, d.allocationId);
  } else {
    let access;
    try { access = await resolveCourseAccess(user); } catch { return NextResponse.json({ error: UNAVAILABLE.error }, { status: 503 }); }
    if (!access.allowed.includes(d.course)) return NextResponse.json({ error: "You do not have access to this course's papers." }, { status: 403 });
    if (d.mode === "test" && !access.isStaff) return NextResponse.json({ error: "Proctored tests are set by your teacher." }, { status: 403 });
    let holds: { held: Set<string>; paused: Record<"9702" | "5054", Set<string>> };
    try {
      holds = access.isStaff ? { held: new Set(), paused: { "9702": new Set(), "5054": new Set() } } : await practiceHolds(user.id, Date.now());
    } catch { return NextResponse.json({ error: UNAVAILABLE.error }, { status: 503 }); }
    result = await openPractice(user.id, d.course, d.practice, d.mode, holds.held, holds.paused[d.course]);
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...body } = result;
  void _ok;
  return NextResponse.json(body, { status: 200, headers: { "cache-control": "no-store" } });
}
