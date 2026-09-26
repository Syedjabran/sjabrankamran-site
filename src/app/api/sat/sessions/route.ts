// src/app/api/sat/sessions/route.ts
import { NextResponse } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { assembleForm } from "@/lib/sat/forms";
import { loadQuestionBank } from "@/lib/sat/bank";
import { startAdaptive, startPractice, type TimedPracticeTest } from "@/lib/sat/session";
import { startDrill } from "@/lib/sat/drills";
import { hasConversionTables, practiceTest, practiceTestList } from "@/lib/sat/serve";
import { ROUTING_DISCLOSURE } from "@/lib/sat/adaptive";
import { inPlayQuestionIds, listSummaries, saveDoc } from "@/lib/sat/store";
import { listAssignments, markAssignment, resolveStart, type SATAssignment } from "@/lib/sat/assignments";
import { satFilterSchema } from "@/lib/sat/filter-schema";
import { invalidRequest } from "@/lib/sat/zod-messages";
import type { SATFilter } from "@/lib/sat/bank";
import { DRILL_COUNT_MAX, DRILL_COUNT_MIN } from "@/lib/sat/client-types";
import { ensureDiagnostic } from "@/lib/sat/coach/diagnostic-drill";

export const runtime = "nodejs";

const newId = () => randomBytes(12).toString("base64url");
// crypto-backed Rng: forms and drills must not be predictable from the client.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

// testNo/filter/count are OPTIONAL here: starting from an assignment (Task
// 9), the client sends only `assignmentId` (plus `kind`, used solely to
// pick which of these three shapes to validate against) -- the server
// takes kind, testNo, filter and count FROM THE STORED ASSIGNMENT, never
// from this body. The superRefine below is what still requires them when
// there is no assignmentId (the pre-Task-9 direct-start path). `filter`
// uses the same shared schema (and its domain/section + bank-match
// validation) as the assign route's drill filter -- fix round 1 ruling.
// `diagnostic` (SAT Coach) takes nothing else: its questions always come
// from pickDiagnostic, and an unfinished one is resumed, not duplicated.
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adaptive"), assignmentId: z.string().max(64).optional() }),
  z.object({ kind: z.literal("practice"), testNo: z.number().int().min(1).max(99).optional(), assignmentId: z.string().max(64).optional() }),
  z.object({
    kind: z.literal("drill"),
    filter: satFilterSchema.optional(),
    count: z.number().int().min(DRILL_COUNT_MIN).max(DRILL_COUNT_MAX).optional(),
    assignmentId: z.string().max(64).optional(),
  }),
  z.object({ kind: z.literal("diagnostic") }),
]).superRefine((b, ctx) => {
  if (b.kind === "diagnostic" || b.assignmentId) return;
  if (b.kind === "practice" && b.testNo === undefined) ctx.addIssue({ code: "custom", message: "testNo is required.", path: ["testNo"] });
  if (b.kind === "drill" && b.count === undefined) ctx.addIssue({ code: "custom", message: "count is required.", path: ["count"] });
});

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
  return NextResponse.json({
    sessions, practiceTests: practiceTestList(), conversionTables: hasConversionTables(),
    routingDisclosure: ROUTING_DISCLOSURE,
  });
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
  if (!parsed.success) return invalidRequest(parsed);
  const b = parsed.data;

  if (b.kind === "diagnostic") {
    const started = await ensureDiagnostic(user.id, Date.now());
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
    return NextResponse.json({ id: started.id, kind: "drill" });
  }

  // Starting from an assignment: load the CALLER'S OWN assignment and take
  // kind/testNo/filter/count from it -- b.kind is used only to satisfy the
  // schema above, never trusted for what to build. An assignmentId not in
  // the caller's own list is a 404; `resolveStart` (assignment-rules.ts)
  // decides whether this is a fresh start, a resume, or a 409 conflict.
  let assignment: SATAssignment | null = null;
  if (b.assignmentId) {
    const list = await listAssignments(user.id);
    if (list === null) return NextResponse.json({ error: "Your assignments couldn't be checked. Please try again." }, { status: 503 });
    assignment = list.find((x) => x.id === b.assignmentId) ?? null;
    if (!assignment) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const outcome = resolveStart(assignment);
    if (outcome.type === "conflict") return NextResponse.json({ error: "You've already completed this assignment." }, { status: 409 });
    if (outcome.type === "resume") return NextResponse.json({ id: outcome.sessionId, kind: assignment.kind });
  }

  const kind = assignment?.kind ?? b.kind;
  const ids = { id: newId(), uid: user.id, now: Date.now(), assignmentId: b.assignmentId ?? null };

  let doc;
  if (kind === "adaptive") {
    const exclude = await inPlayQuestionIds(user.id, ids.now);
    if (exclude === null) return NextResponse.json({ error: "Your SAT history couldn't be checked. Please try again." }, { status: 503 });
    doc = startAdaptive(assembleForm(loadQuestionBank(), rng, exclude), ids);
  } else if (kind === "practice") {
    const testNo = assignment ? assignment.testNo : (b.kind === "practice" ? (b.testNo ?? null) : null);
    if (testNo === null) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const test = practiceTest(testNo) as TimedPracticeTest | null;
    if (!test) return NextResponse.json({ error: "That practice test is not available." }, { status: 404 });
    if (!test.minutes) return NextResponse.json({ error: "That practice test's timings are not loaded." }, { status: 409 });
    doc = startPractice(test, ids);
  } else {
    const filter: SATFilter = assignment ? (assignment.filter ?? {}) : (b.kind === "drill" ? (b.filter ?? {}) : {});
    const count = assignment ? assignment.count : (b.kind === "drill" ? (b.count ?? null) : null);
    if (count === null) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const exclude = await inPlayQuestionIds(user.id, ids.now);
    if (exclude === null) return NextResponse.json({ error: "Your SAT history couldn't be checked. Please try again." }, { status: 503 });
    try {
      doc = startDrill(loadQuestionBank(), filter, count, rng, ids, exclude);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (!(await saveDoc(doc))) return NextResponse.json({ error: "Couldn't start the sitting. Please try again." }, { status: 503 });
  // ASSIGNMENT HOOK (Task 9): best-effort -- awaited so it's actually
  // attempted before the response is sent (a serverless function may not
  // outlive an un-awaited promise), but a failed marker write never loses
  // the sitting just started; the hub just keeps showing "Start" for it.
  if (assignment) await markAssignment(user.id, assignment.id, { status: "in_progress", sessionId: doc.id });
  return NextResponse.json({ id: doc.id, kind: doc.kind });
}
