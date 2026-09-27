import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { appendAttemptChecked, type Attempt, type AttemptContext, type AttemptQuestion } from "@/lib/exam-lab/attempts";
import { idsOfPaper, questionById } from "@/lib/exam-lab/bank-all";
import { getAllocation, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { allocationQuestionIds, hasStarted, receiptMatches, sameIdSet, sittingAlreadySubmitted, type MarkReceipt } from "@/lib/exam-lab/answer-rules";
import { examLabKey } from "@/lib/exam-lab/keys";
import { verifyToken } from "@/lib/exam-lab/seal";
import { readSitting } from "@/lib/exam-lab/sittings";

export const runtime = "nodejs";

// Limits CLAMP rather than reject: a 400 here used to lose the whole attempt
// silently (a 500-question drill, or a relaxed practice sat for hours).
const MAX_QUESTIONS = 500;       // exam-allocate accepts up to 500 ids
const MAX_SEC = 12 * 3600;
const secs = z.number().min(0).transform((n) => Math.min(MAX_SEC, Math.round(n)));
const text = (max: number) => z.string().transform((s) => s.slice(0, max));
const count = (max: number) => z.number().int().min(0).transform((n) => Math.min(max, n));

// topic / level / paperType / marks / correct / earned are accepted for
// compatibility but ignored: the bank entry is authoritative for all of
// them, an MCQ is marked here, and a structured mark counts only with the
// Maxwell receipt (/api/exam-lab/mark) for exactly this answer.
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
  receipt: z.string().max(4000).nullable().optional(),
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
  /** The signed sitting token (/api/exam-lab/sitting). Required for practice. */
  sitting: z.string().max(20000).optional(),
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

const ALREADY = "This sitting's answers were already recorded — these were not saved again.";

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });

  const d = parsed.data;
  const now = Date.now();
  const ids = d.questions.map((q) => q.id);

  // The sitting this attempt submits: signed when it opened, so its question
  // set, help rule and allocation cannot be changed by the browser.
  const sittingToken = d.context?.sitting;
  const sitting = sittingToken ? readSitting(sittingToken, user.id, now) : null;
  if (sittingToken && !sitting) return NextResponse.json({ error: "This sitting has expired, so your answers could not be verified. Open the paper again." }, { status: 403 });
  if (sitting && !sameIdSet(sitting.ids, ids)) return NextResponse.json({ error: "This attempt does not match the paper that was opened." }, { status: 400 });

  let kind: AttemptContext["kind"];
  let help: boolean;
  let alloc: ExamAllocation | null = null;
  const allocationId = sitting ? sitting.alloc : d.context?.allocationId || null;
  if (allocationId) {
    // An allocation attempt must be the caller's own allocation, after it
    // opened, and the exact paper it froze; its mode (not the client) decides
    // whether help was allowed.
    try { alloc = await getAllocation(user.id, allocationId); } catch {
      return NextResponse.json({ error: "Could not verify the assignment. Please retry." }, { status: 503 });
    }
    if (!alloc) return NextResponse.json({ error: "This attempt does not belong to one of your assignments." }, { status: 403 });
    if (!hasStarted(alloc, now)) return NextResponse.json({ error: "This activity has not opened yet." }, { status: 403 });
    const expected = allocationQuestionIds(alloc, idsOfPaper)?.filter((id) => questionById(id));
    if (!expected) return NextResponse.json({ error: "Open this assignment from Exam Lab, then submit it." }, { status: 409 });
    if (!sameIdSet(expected, ids)) return NextResponse.json({ error: "This attempt does not match the assigned paper." }, { status: 400 });
    help = alloc.mode === "assignment_help";
    kind = alloc.mode === "test" ? "test" : "assignment";
  } else {
    // Self-serve practice is only ever a sitting the server opened: no
    // hand-built id list is marked (a secure-bank or held-back question).
    if (!sitting) return NextResponse.json({ error: "This practice paper could not be verified. Refresh the page and open it again." }, { status: 400 });
    help = sitting.help;
    kind = sitting.strict ? "test" : "practice"; // a staff proctored preview stays recorded as a test
  }

  // ---- SCORING INTEGRITY (owner rule, server-authoritative) ----
  // Every figure is recomputed from the bank. MCQs are marked from the
  // submitted letter against the key; a blank MCQ is not attempted (correct
  // null) and earns 0. A structured mark counts only where help was allowed
  // and only with a Maxwell receipt for exactly the submitted answer (the
  // browser's own figure never counts), clamped to the question's marks.
  // "Attempted" = a non-empty response, so a student tampering with the
  // payload cannot turn a blank paper into a scored one.
  const receiptKey = examLabKey("receipt");
  const questions: AttemptQuestion[] = [];
  for (const q of d.questions) {
    const bq = questionById(q.id);
    if (!bq) return NextResponse.json({ error: "The attempt contains an unknown question." }, { status: 400 });
    const marks = bq.marks || 1;
    const response = q.response && q.response.trim() ? q.response : null;
    let earned: number | null = null;
    let correct: boolean | null = null;
    let feedback: string | null = null;
    if (bq.paperType === "P1") {
      if (bq.answer) {
        const letter = response ? response.trim().toUpperCase() : null;
        correct = letter ? letter === bq.answer : null;
        earned = correct ? marks : 0;
      }
    } else if (help && sitting && receiptKey && q.receipt) {
      const r = verifyToken<MarkReceipt>(q.receipt, receiptKey);
      if (receiptMatches(r, { uid: user.id, sid: sitting.sid, qid: bq.id, response })) {
        earned = Math.min(marks, Math.max(0, Math.round(r.awarded)));
        feedback = q.feedback ?? null;
      }
    }
    questions.push({
      id: bq.id, topic: bq.topic, level: bq.level, paperType: bq.paperType, marks,
      earned, correct, spentSec: q.spentSec ?? null, expectedSec: q.expectedSec,
      response, feedback,
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

  let context: AttemptContext | undefined;
  if (d.context) {
    const { sitting: _token, ...client } = d.context;
    void _token;
    context = {
      ...client, kind, help, status,
      allocationId: alloc?.id ?? null,
      // A proctored practice preview is proctored whatever the browser says.
      ...(sitting?.strict ? { integrity: "strict" as const, proctored: true } : {}),
      ...(sitting ? { sittingId: sitting.sid } : {}),
    };
  }
  const cancelled = !!d.context?.cancelled;
  const attempt: Attempt = {
    id: d.context?.attemptId || crypto.randomUUID(),
    ts: now,
    mode: d.mode, paperType: d.paperType, code: d.code, ref: d.ref,
    score, total,
    qCount: questions.length,
    scoredCount: scored.length,
    attemptedCount,
    durationSec: d.durationSec,
    questions,
    context,
  };
  const result = await appendAttemptChecked(user.id, attempt, (existing) => sittingAlreadySubmitted(existing, {
    sittingId: sitting?.sid ?? null, allocationId: alloc?.id ?? null, allocSubmitted: alloc?.status === "submitted",
    allocStartedAt: alloc?.startedAt ?? null, cancelled,
  }));
  if (result === "refused") return NextResponse.json({ ok: false, alreadySubmitted: true, error: ALREADY }, { status: 409 });
  const ok = result === "stored" || result === "duplicate";
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
