// src/app/api/sat/sessions/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { canViewStudent, satAccess } from "@/lib/sat/access";
import { beginStage, isStaleStage, saveAnswers, settleBreak, submitStage, type SATSession } from "@/lib/sat/session";
import { checkDrillAnswer, type SATDrill } from "@/lib/sat/drills";
import { answerOf, drillState, finishSession, reviewItem, sessionState } from "@/lib/sat/serve";
import { listSummaries, loadDoc, saveDoc } from "@/lib/sat/store";

export const runtime = "nodejs";

const answersSchema = z.record(z.string().max(80), z.string().max(12)).refine((a) => Object.keys(a).length <= 60);
const flaggedSchema = z.array(z.string().max(80)).max(60);
const stageSchema = z.enum(["rw.m1", "rw.m2", "math.m1", "math.m2"]);
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), stage: stageSchema, answers: answersSchema, flagged: flaggedSchema }),
  z.object({ action: z.literal("submit"), stage: stageSchema, answers: answersSchema, flagged: flaggedSchema }),
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("check"), questionId: z.string().max(80), response: z.string().min(1).max(12) }),
]);

const unavailable = () => NextResponse.json({ error: "Your sitting couldn't be loaded. Nothing has been lost — please try again." }, { status: 503 });

function stateOf(doc: SATSession | SATDrill, now: number) {
  return doc.kind === "drill" ? drillState(doc, now) : sessionState(doc, now);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  const ownerUid = new URL(req.url).searchParams.get("uid") || user.id;
  if (ownerUid === user.id) {
    if (!(await satAccess(user)).ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  } else if (!(await canViewStudent(user, ownerUid))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const loaded = await loadDoc(ownerUid, id);
  if (!loaded.ok) return unavailable();
  if (!loaded.doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const now = Date.now();
  let doc = loaded.doc;
  if (doc.kind !== "drill" && ownerUid === user.id) {
    const settled = settleBreak(doc, now);
    if (settled !== doc && (await saveDoc(settled))) doc = settled;
  }
  // Index self-healing: the LAST save of a sitting (the submit that finishes
  // it, or the final drill check) can write the doc but fail the index
  // write, leaving the hub showing it unfinished forever. Owner-only, and
  // only for an already-finished doc, so this never runs on the hot path of
  // an in-progress sitting -- one cheap extra read, and a repair write only
  // when the summary actually needs it.
  if (ownerUid === user.id && doc.finishedAt !== null) {
    const summaries = await listSummaries(ownerUid);
    const entry = summaries?.find((x) => x.id === doc.id);
    if (!entry || entry.finishedAt === null) {
      await saveDoc(doc); // best effort; a repeat failure just retries on the next GET
    }
  }
  // Staff viewing an unfinished sitting see only the finished-report shape when it exists.
  return NextResponse.json(stateOf(doc, now));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await satAccess(user)).ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const { id } = await params;
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const loaded = await loadDoc(user.id, id);
  if (!loaded.ok) return unavailable();
  if (!loaded.doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const now = Date.now();
  const a = parsed.data;
  const doc = loaded.doc;

  if (doc.kind === "drill") {
    if (a.action !== "check") return NextResponse.json({ error: "Drills are answered one question at a time." }, { status: 400 });
    let result;
    try {
      result = checkDrillAnswer(doc, a.questionId, a.response, answerOf, now);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    if (!(await saveDoc(result.drill))) return unavailable();
    // ASSIGNMENT HOOK (Task 9): when result.drill.finishedAt, mark its assignment done.
    const n = result.drill.questionIds.indexOf(a.questionId) + 1;
    return NextResponse.json({ state: drillState(result.drill, now), item: reviewItem(a.questionId, n, result.drill.answers[a.questionId] ?? null) });
  }

  let next: SATSession = settleBreak(doc, now);
  // A stale tab, a double click or a retried request names a module that has
  // already ended: never apply it to the module the student is now in.
  if ((a.action === "save" || a.action === "submit") && isStaleStage(next, a.stage)) {
    if (next !== doc) await saveDoc(next);
    return NextResponse.json({ stale: true, state: sessionState(next, now) }, { status: 409 });
  }
  if (a.action === "save") next = saveAnswers(next, a.stage, a.answers, a.flagged);
  else if (a.action === "submit") next = finishSession(submitStage(next, a.stage, a.answers, a.flagged, now, answerOf));
  else if (a.action === "begin") next = beginStage(next, now);
  else return NextResponse.json({ error: "Only drills are checked question by question." }, { status: 400 });

  if (next !== doc && !(await saveDoc(next))) return unavailable();
  // ASSIGNMENT HOOK (Task 9): when next.finishedAt, mark its assignment done.
  return NextResponse.json(sessionState(next, now));
}
