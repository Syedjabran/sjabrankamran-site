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
import { listSummaries, loadDoc, saveDoc } from "@/lib/sat/store";

export const runtime = "nodejs";

const newId = () => randomBytes(12).toString("base64url");
// crypto-backed Rng: forms and drills must not be predictable from the client.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

// A student's own sittings started within this window are treated as
// currently "in play" for drill-exclusion purposes -- long enough to cover
// any adaptive/practice sitting actually in progress, short enough that an
// old, abandoned, unfinished sitting stops narrowing the drill pool forever.
const RECENT_MS = 4 * 60 * 60 * 1000;

const SAT_DOMAINS = [
  "information-ideas", "craft-structure", "expression-ideas", "standard-english",
  "algebra", "advanced-math", "psda", "geometry-trig",
] as const;

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adaptive"), assignmentId: z.string().max(64).optional() }),
  z.object({ kind: z.literal("practice"), testNo: z.number().int().min(1).max(99), assignmentId: z.string().max(64).optional() }),
  z.object({
    kind: z.literal("drill"),
    section: z.enum(["rw", "math"]).optional(),
    domain: z.enum(SAT_DOMAINS).optional(),
    skill: z.string().max(120).optional(),
    difficulty: z.enum(["E", "M", "H"]).optional(),
    count: z.number().int().min(DRILL_MIN).max(DRILL_MAX),
    assignmentId: z.string().max(64).optional(),
  }),
]);

const accessUnavailable = () => NextResponse.json({ error: "Your access couldn't be checked. Please try again." }, { status: 503 });

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let access;
  try {
    access = await satAccess(user);
  } catch {
    return accessUnavailable();
  }
  if (!access.ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const sessions = await listSummaries(user.id);
  if (sessions === null) return NextResponse.json({ error: "Your SAT history couldn't be loaded. Please try again." }, { status: 503 });
  return NextResponse.json({ sessions, practiceTests: practiceTestList(), conversionTables: hasConversionTables() });
}

/** Question ids the student must not be drilled on right now: everything
 *  planned, or possibly still to be routed to, in their own unfinished
 *  adaptive/practice sittings started in the last four hours -- otherwise a
 *  drill opened in another tab, filtered to match, becomes a way to look up
 *  a mid-exam answer. Reads fail closed: any failure returns `null` and the
 *  caller must refuse to build an unfiltered drill rather than silently
 *  show one. */
async function recentUnfinishedIds(uid: string, now: number): Promise<Set<string> | null> {
  const summaries = await listSummaries(uid);
  if (summaries === null) return null;
  const recent = summaries.filter((s) => s.kind !== "drill" && s.finishedAt === null && now - s.createdAt <= RECENT_MS);
  const exclude = new Set<string>();
  for (const summary of recent) {
    const loaded = await loadDoc(uid, summary.id);
    if (!loaded.ok) return null;
    const doc = loaded.doc;
    if (!doc || doc.kind === "drill") continue;
    for (const list of Object.values(doc.plan)) for (const id of list ?? []) exclude.add(id);
    for (const variant of Object.values(doc.variants)) {
      if (!variant) continue;
      for (const id of variant.lower) exclude.add(id);
      for (const id of variant.upper) exclude.add(id);
    }
  }
  return exclude;
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let access;
  try {
    access = await satAccess(user);
  } catch {
    return accessUnavailable();
  }
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
    const exclude = await recentUnfinishedIds(user.id, ids.now);
    if (exclude === null) return NextResponse.json({ error: "Your SAT history couldn't be checked. Please try again." }, { status: 503 });
    try {
      doc = startDrill(loadQuestionBank(), { section: b.section, domain: b.domain, skill: b.skill, difficulty: b.difficulty }, b.count, rng, ids, exclude);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (!(await saveDoc(doc))) return NextResponse.json({ error: "Couldn't start the sitting. Please try again." }, { status: 503 });
  // ASSIGNMENT HOOK (Task 9): mark ids.assignmentId in_progress with sessionId doc.id.
  return NextResponse.json({ id: doc.id, kind: doc.kind });
}
