import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { appendAttempt, type Attempt, type AttemptQuestion } from "@/lib/exam-lab/attempts";
import { ALL_QUESTIONS, questionById } from "@/lib/exam-lab/bank-all";
import { getAllocation, type AllocContent } from "@/lib/exam-lab/allocations";

export const runtime = "nodejs";

// Limits CLAMP rather than reject: a 400 here used to lose the whole attempt
// silently (a 500-question drill, or a relaxed practice sat for hours).
const MAX_QUESTIONS = 500;       // exam-allocate accepts up to 500 ids
const MAX_SEC = 12 * 3600;
const secs = z.number().min(0).transform((n) => Math.min(MAX_SEC, Math.round(n)));
const text = (max: number) => z.string().transform((s) => s.slice(0, max));
const count = (max: number) => z.number().int().min(0).transform((n) => Math.min(max, n));

// topic / level / paperType / marks / correct are accepted for compatibility
// but ignored: the bank entry is authoritative for all of them.
const qSchema = z.object({
  id: z.string().max(80),
  topic: z.string().nullable().optional(),
  level: z.string().optional(),
  paperType: z.string().optional(),
  marks: z.number().nullable().optional(),
  earned: z.number().min(0).nullable(),
  correct: z.boolean().nullable().optional(),
  spentSec: secs.nullable().optional(),
  expectedSec: secs.optional(),
  response: text(12000).nullable().optional(),
  feedback: text(12000).nullable().optional(),
});

const contextSchema = z.object({
  integrity: z.enum(["off", "standard", "strict"]),
  kind: z.enum(["practice", "assignment", "test"]),
  help: z.boolean(),
  revealsUsed: count(500),
  proctored: z.boolean(),
  cancelled: z.boolean(),
  lockedReason: text(300).nullable().optional(),
  flags: count(1000),
  allocationId: z.string().max(80).nullable().optional(),
  attemptId: z.string().max(80).nullable().optional(),
  late: z.boolean().optional(),
  lateKind: text(40).optional(),
  pausedSec: secs.optional(),
  submissionId: z.string().max(80).optional(),
}).optional();

// score / total / qCount / scoredCount are recomputed below; the client's
// figures are accepted for compatibility and never stored.
const schema = z.object({
  mode: z.enum(["paper", "drill"]),
  paperType: z.enum(["P1", "P2", "P4", "mixed"]),
  code: z.string().max(40).optional(),
  ref: z.string().max(80).optional(),
  score: z.number().optional(),
  total: z.number().optional(),
  qCount: z.number().optional(),
  scoredCount: z.number().optional(),
  durationSec: secs.optional(),
  questions: z.array(qSchema).min(1).max(MAX_QUESTIONS),
  context: contextSchema,
});

/** The exact question ids an allocation sits, or null for a legacy randomised spec. */
function allocationIds(c: AllocContent): string[] | null {
  if (c.type === "drillref" || c.type === "custom") return c.ids;
  if (c.type === "paper") return ALL_QUESTIONS.filter((q) => q.code === c.code).map((q) => q.id);
  return null;
}

function sameIds(a: string[], b: string[]): boolean {
  const sa = new Set(a), sb = new Set(b);
  return sa.size === sb.size && [...sa].every((id) => sb.has(id));
}

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });

  const d = parsed.data;
  let kind = d.context?.kind;
  let help = d.context?.help ?? true;

  // An allocation attempt must be the caller's own allocation and the exact
  // paper it froze; its mode (not the client) decides whether help was allowed.
  const allocationId = d.context?.allocationId || null;
  if (allocationId) {
    let alloc;
    try { alloc = await getAllocation(user.id, allocationId); } catch {
      return NextResponse.json({ error: "Could not verify the assignment. Please retry." }, { status: 503 });
    }
    if (!alloc) return NextResponse.json({ error: "This attempt does not belong to one of your assignments." }, { status: 403 });
    const expected = allocationIds(alloc.content);
    if (expected && !sameIds(expected, d.questions.map((q) => q.id))) {
      return NextResponse.json({ error: "This attempt does not match the assigned paper." }, { status: 400 });
    }
    help = alloc.mode === "assignment_help";
    kind = alloc.mode === "test" ? "test" : "assignment";
  }

  // ---- SCORING INTEGRITY (owner rule, server-authoritative) ----
  // Every figure is recomputed from the bank. MCQs are marked from the
  // submitted letter against the key; a blank MCQ is not attempted (correct
  // null) and earns 0. A structured mark (Maxwell) is kept only where help was
  // allowed, and clamped to the question's marks. "Attempted" = a non-empty
  // response, so a student tampering with the payload cannot turn a blank
  // paper into a scored one.
  const questions: AttemptQuestion[] = [];
  for (const q of d.questions) {
    const bq = questionById(q.id);
    if (!bq) return NextResponse.json({ error: "The attempt contains an unknown question." }, { status: 400 });
    const marks = bq.marks || 1;
    const response = q.response && q.response.trim() ? q.response : null;
    let earned: number | null = null;
    let correct: boolean | null = null;
    if (bq.paperType === "P1") {
      if (bq.answer) {
        const letter = response ? response.trim().toUpperCase() : null;
        correct = letter ? letter === bq.answer : null;
        earned = correct ? marks : 0;
      }
    } else if (help && q.earned != null) {
      earned = Math.min(marks, Math.max(0, Math.round(q.earned)));
    }
    questions.push({
      id: bq.id, topic: bq.topic, level: bq.level, paperType: bq.paperType, marks,
      earned, correct, spentSec: q.spentSec ?? null, expectedSec: q.expectedSec,
      response, feedback: help ? q.feedback ?? null : null,
    });
  }
  const scored = questions.filter((q) => q.earned !== null);
  const attemptedCount = questions.filter((q) => q.response !== null).length;

  let score = scored.reduce((s, q) => s + (q.earned || 0), 0);
  const total = scored.reduce((s, q) => s + q.marks, 0);
  let status: string | undefined;
  if (attemptedCount === 0) {
    // Entirely blank: force zero, flag "unattempted". Unanswered questions
    // already earn 0 per-question; here the whole submission is zeroed and
    // flagged so it earns no points/leaderboard credit downstream.
    score = 0;
    status = "unattempted";
  } else if (d.context?.late) {
    // Finished past the countdown — allowed, recorded for staff.
    status = d.context.lateKind === "late submission" ? "late submission" : "late attempt";
  }

  const attempt: Attempt = {
    id: d.context?.attemptId || crypto.randomUUID(),
    ts: Date.now(),
    mode: d.mode, paperType: d.paperType, code: d.code, ref: d.ref,
    score, total,
    qCount: questions.length,
    scoredCount: scored.length,
    attemptedCount,
    durationSec: d.durationSec,
    questions,
    context: d.context ? { ...d.context, kind: kind ?? d.context.kind, help, status } : undefined,
  };
  const ok = await appendAttempt(user.id, attempt);
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
