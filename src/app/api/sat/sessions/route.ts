// src/app/api/sat/sessions/route.ts
import { NextResponse } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { assembleForm } from "@/lib/sat/forms";
import { loadQuestionBank } from "@/lib/sat/bank";
import { startAdaptive, startPractice, type TimedPracticeTest } from "@/lib/sat/session";
import { startDrill, DRILL_MAX, DRILL_MIN } from "@/lib/sat/drills";
import { hasConversionTables, practiceTest, practiceTestList } from "@/lib/sat/serve";
import { listSummaries, saveDoc } from "@/lib/sat/store";

export const runtime = "nodejs";

const newId = () => randomBytes(12).toString("base64url");
// crypto-backed Rng: forms and drills must not be predictable from the client.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adaptive"), assignmentId: z.string().max(64).optional() }),
  z.object({ kind: z.literal("practice"), testNo: z.number().int().min(1).max(99), assignmentId: z.string().max(64).optional() }),
  z.object({
    kind: z.literal("drill"),
    section: z.enum(["rw", "math"]).optional(),
    domain: z.string().max(40).optional(),
    skill: z.string().max(120).optional(),
    difficulty: z.enum(["E", "M", "H"]).optional(),
    count: z.number().int().min(DRILL_MIN).max(DRILL_MAX),
    assignmentId: z.string().max(64).optional(),
  }),
]);

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const access = await satAccess(user);
  if (!access.ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const sessions = await listSummaries(user.id);
  if (sessions === null) return NextResponse.json({ error: "Your SAT history couldn't be loaded. Please try again." }, { status: 503 });
  return NextResponse.json({ sessions, practiceTests: practiceTestList(), conversionTables: hasConversionTables() });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const access = await satAccess(user);
  if (!access.ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data;
  const ids = { id: newId(), uid: user.id, now: Date.now(), assignmentId: b.assignmentId ?? null };

  let doc;
  if (b.kind === "adaptive") {
    doc = startAdaptive(assembleForm(loadQuestionBank(), rng), ids);
  } else if (b.kind === "practice") {
    const test = practiceTest(b.testNo) as TimedPracticeTest | null;
    if (!test) return NextResponse.json({ error: "That practice test is not available." }, { status: 404 });
    if (!test.minutes) return NextResponse.json({ error: "That practice test's timings are not loaded." }, { status: 409 });
    doc = startPractice(test, ids);
  } else {
    try {
      doc = startDrill(loadQuestionBank(), { section: b.section, domain: b.domain as never, skill: b.skill, difficulty: b.difficulty }, b.count, rng, ids);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (!(await saveDoc(doc))) return NextResponse.json({ error: "Couldn't start the sitting. Please try again." }, { status: 503 });
  // ASSIGNMENT HOOK (Task 9): mark ids.assignmentId in_progress with sessionId doc.id.
  return NextResponse.json({ id: doc.id, kind: doc.kind });
}
