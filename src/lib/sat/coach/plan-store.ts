// src/lib/sat/coach/plan-store.ts
//
// SERVER-ONLY. The student's stored study plan (SAT Coach spec 6) at
// portal-data/sat/plan/<uid>.json, kept fresh by ensureSatPlan on every SAT
// Lab visit and in the 06:00 PKT cron; plus the three things a student does
// with it: start today's work (startPlanItem), finish it
// (recordPlanCompletion, from the sessions route) and move a full exam
// (moveMock). The decisions are pure (plan-logic.ts); this module reads,
// writes and starts docs.
//
// Storage fails closed (storage-fresh.ts): a failed plan read throws and is
// never "no plan" followed by a write. Every write is a fresh read, the
// change, a write and a verifying read -- retried once when another writer
// landed in between. That confirms our write landed at the moment of the
// verify; it is not compare-and-swap. A writer that read before a
// confirmed write (a move, say) and writes after it can still replace it
// with its own view, and the earlier save stays reported as done. Each such
// race needs two writes within a fraction of a second; a lost completion is
// healed by the next maintenance (statuses are rebuilt from the finished
// work itself), a lost move is not.
import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { formatPkDay, pkToday } from "@/lib/portal/pk-time";
import { loadQuestionBank } from "../bank.ts";
import { assembleForm } from "../forms.ts";
import { startAdaptive, startPractice, type TimedPracticeTest } from "../session.ts";
import { startChallenge } from "../drills.ts";
import { practiceTest, practiceTestList } from "../serve.ts";
import { inPlayQuestionIds, listSummaries, mockExclusions, saveDoc, type SATDoc } from "../store.ts";
import { studentAnalytics } from "../analytics-data.ts";
import type { PlanItem, SATAnalytics, SessionSummary } from "../client-types.ts";
import { buildChallenge, type BankLite } from "./challenge-builder.ts";
import { ensureDiagnostic } from "./diagnostic-drill.ts";
import { readProfile } from "./profile-store.ts";
import type { SATProfile } from "./profile.ts";
import { applyMove, challengeSize, checkMove, horizonEnd } from "./planner.ts";
import {
  attachSession, challengeAnalytics, completeItem, doneMapFrom, existingSessionFor, latestDiagnosticId, nextPlan,
  practiceTakenFrom, startDecision, weakSnapshot, weekRolled, type SATPlan, type WeakAtWeekStart,
} from "./plan-logic.ts";

export type { SATPlan };

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const docPath = (uid: string) => `sat/plan/${uid}.json`;
const WRITE_ATTEMPTS = 2;

const newDocId = () => randomBytes(12).toString("base64url");
// crypto-backed Rng: which questions a challenge or form holds must not be predictable.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const unreadable = () => new Error("Your SAT plan couldn't be read.");
const unsaved = () => new Error("Your SAT plan couldn't be saved.");
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A stored doc as a plan; anything else is unreadable (never overwritten). */
function asPlan(raw: unknown): SATPlan {
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.generatedAt !== "string" || !isRecord(raw.profileSnapshot) || !Array.isArray(raw.items)) {
    throw unreadable();
  }
  return raw as unknown as SATPlan;
}

/** The student's plan, or null before the first build. Throws when it can't be read. */
export async function readPlan(uid: string): Promise<SATPlan | null> {
  if (!SAFE_UID.test(uid)) throw unreadable();
  const fresh = await readFreshJson<unknown>(BUCKET, docPath(uid));
  if (!fresh.ok) throw unreadable();
  return fresh.data == null ? null : asPlan(fresh.data);
}

type Step<T> = (prev: SATPlan | null) => Promise<{ next: SATPlan | null; result: T }>;

/** Fresh read -> `step` -> write -> verify, once more if another write landed
 *  in between. `step` returning `next` = null or `prev` itself writes
 *  nothing. Throws on a failed read or a write that can't be confirmed. */
async function updatePlan<T>(uid: string, step: Step<T>): Promise<T> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const prev = await readPlan(uid);
    const { next, result } = await step(prev);
    if (!next || next === prev) return result;
    if (!(await writeFreshJson(BUCKET, docPath(uid), next))) throw unsaved();
    const verify = await readFreshJson<unknown>(BUCKET, docPath(uid));
    if (verify.ok && JSON.stringify(verify.data) === JSON.stringify(next)) return result;
  }
  throw unsaved();
}

/** The timed official practice tests a plan can schedule (ruling 4). */
function practiceAvailable(): number[] {
  return practiceTestList().filter((t) => t.timed).map((t) => t.testNo);
}

/**
 * Keeps the plan current and returns it (null: no SAT profile yet). Idempotent:
 * builds on the first visit, re-plans only what a profile edit changed
 * (ruling 1), always runs the daily maintenance (statuses from finished work,
 * missed full exams re-placed, practice tests re-validated) and snapshots the
 * weakest skill when a new ISO week begins (ruling 5). Writes only when
 * something changed. Throws on any failed read or unconfirmed write.
 *
 * `known`: what the caller already read, so it isn't read twice -- the
 * analytics (used for the week snapshot; null = they couldn't be loaded)
 * and the profile.
 */
export async function ensureSatPlan(
  uid: string, today: string, known?: { analytics?: SATAnalytics | null; profile?: SATProfile },
): Promise<SATPlan | null> {
  const profile = known?.profile ?? (await readProfile(uid));
  if (!profile) return null;
  const summaries = await listSummaries(uid);
  if (summaries === null) throw unreadable();
  const taken = practiceTakenFrom(summaries);
  const available = practiceAvailable();
  const diagnosticId = latestDiagnosticId(summaries);
  let weak: WeakAtWeekStart | null | undefined;
  return updatePlan(uid, async (prev) => {
    if (weak === undefined && weekRolled(prev, today)) {
      const analytics = known?.analytics !== undefined ? known.analytics : (await studentAnalytics(uid, Date.now()).catch(() => null))?.analytics ?? null;
      // No analytics (a failed read) leaves the week to roll on a later pass.
      weak = analytics ? weakSnapshot(analytics) : undefined;
    }
    const next = nextPlan(prev, {
      today, profile, practiceTaken: taken, practiceAvailable: available, done: doneMapFrom(summaries, prev?.items ?? []),
      diagnosticId, weak, nowIso: new Date().toISOString(),
    });
    return { next, result: next };
  });
}

/** Marks the item a finished drill/sitting was started from done (or late,
 *  after its day) -- that item only. Throws when the plan can't be read or
 *  saved; callers treat it as best effort (the next ensureSatPlan also
 *  finds the finish through the summaries). */
export async function recordPlanCompletion(uid: string, planItemId: string, sessionId: string, finishedAt: number): Promise<void> {
  await updatePlan(uid, async (prev) => {
    if (!prev) return { next: null, result: undefined };
    const items = completeItem(prev.items, planItemId, sessionId, pkToday(finishedAt));
    return { next: items === prev.items ? prev : { ...prev, items, generatedAt: new Date().toISOString() }, result: undefined };
  });
}

type Refusal = { ok: false; error: string; status: number };

const noPlan: Refusal = { ok: false, error: "Set up your SAT plan first.", status: 404 };

/** Moves full exam `itemId` to `date` under the student's rules (spec 6.4,
 *  planner.ts checkMove), on a freshly maintained plan. Throws when the plan
 *  can't be read or saved. */
export async function moveMock(uid: string, itemId: string, date: string): Promise<{ ok: true; plan: SATPlan } | Refusal> {
  const today = pkToday();
  if (!(await ensureSatPlan(uid, today))) return noPlan;
  return updatePlan<{ ok: true; plan: SATPlan } | Refusal>(uid, async (prev) => {
    if (!prev) return { next: null, result: noPlan };
    const item = prev.items.find((i) => i.id === itemId);
    if (!item) return { next: null, result: { ok: false, error: "That full exam wasn't found — reload the page.", status: 404 } };
    // A repeat of the move that just landed (a retried request) is done.
    if (item.date === date && item.moves?.at(-1)?.to === date) return { next: null, result: { ok: true, plan: prev } };
    const exam = horizonEnd(prev.profileSnapshot);
    if (!exam || exam < today) return { next: null, result: { ok: false, error: "Your SAT date has passed.", status: 409 } };
    const check = checkMove(prev.items, itemId, date, today, exam);
    if (!check.ok) return { next: null, result: { ok: false, error: check.error, status: 409 } };
    const nowIso = new Date().toISOString();
    const next: SATPlan = { ...prev, items: applyMove(prev.items, itemId, date, nowIso), generatedAt: nowIso };
    return { next, result: { ok: true, plan: next } };
  });
}

type Created = { ok: true; sessionId: string } | Refusal;

const historyUnavailable: Refusal = { ok: false, error: "Your SAT history couldn't be checked. Please try again.", status: 503 };
const notSaved: Refusal = { ok: false, error: "Couldn't start it. Please try again.", status: 503 };

/** Every bank question's public labels, for the challenge builder (ruling 6). */
function bankLite(): BankLite[] {
  return loadQuestionBank().map((q) => ({ id: q.id, section: q.section, domain: q.domain, skill: q.skill, difficulty: q.difficulty }));
}

async function saved(doc: SATDoc): Promise<Created> {
  return (await saveDoc(doc)) ? { ok: true, sessionId: doc.id } : notSaved;
}

/** A daily challenge or review day: questions chosen now, from the full
 *  bank and the latest analytics, never from the running sittings. */
async function createChallenge(uid: string, item: PlanItem, plan: SATPlan, now: number, summaries: SessionSummary[]): Promise<Created> {
  const stats = await studentAnalytics(uid, now);
  if (!stats) return historyUnavailable;
  const exclude = await inPlayQuestionIds(uid, now, summaries);
  if (exclude === null) return historyUnavailable;
  const size = item.size ?? challengeSize(plan.profileSnapshot.minutes);
  const { ids } = buildChallenge({ bank: bankLite(), analytics: challengeAnalytics(stats.analytics), history: stats.history, size, now, rng, exclude });
  if (!ids.length) return { ok: false, error: "There aren't enough questions for this session right now.", status: 409 };
  const title = `${item.kind === "review" ? "Review" : "Daily challenge"} — ${formatPkDay(item.date)}`;
  return saved(startChallenge(ids, { id: newDocId(), uid, now, planItemId: item.id, title }));
}

/** A full exam: the adaptive mock (never holding a running sitting's or an
 *  open drill's questions -- ruling 7a) or the official practice test. */
async function createMock(uid: string, item: PlanItem, now: number, summaries: SessionSummary[]): Promise<Created> {
  const ids = { id: newDocId(), uid, now };
  if (item.mock?.kind === "practice") {
    const test = practiceTest(item.mock.testNo) as TimedPracticeTest | null;
    if (!test?.minutes) return { ok: false, error: "That practice test isn't available right now.", status: 409 };
    return saved({ ...startPractice(test, ids), planItemId: item.id });
  }
  const exclude = await mockExclusions(uid, now, summaries);
  if (exclude === null) return historyUnavailable;
  return saved({ ...startAdaptive(assembleForm(loadQuestionBank(), rng, exclude.inPlay, exclude.openDrill), ids), planItemId: item.id });
}

async function createFor(uid: string, item: PlanItem, plan: SATPlan, now: number, summaries: SessionSummary[]): Promise<Created> {
  if (item.kind === "diagnostic") {
    const started = await ensureDiagnostic(uid, now, item.id);
    return started.ok ? { ok: true, sessionId: started.id } : { ok: false, error: started.error, status: started.status };
  }
  if (item.kind === "mock") return createMock(uid, item, now, summaries);
  return createChallenge(uid, item, plan, now, summaries);
}

/** Starts (or reopens) plan item `itemId`: only one dated today or earlier
 *  and not finished (plan-logic.ts startDecision). The doc is recorded on
 *  the item at once (ruling 2); should that write fail, the doc still
 *  carries `planItemId`, so the next start or maintenance finds it. Throws
 *  when the plan can't be read. */
export async function startPlanItem(uid: string, itemId: string): Promise<Created> {
  const now = Date.now();
  const today = pkToday(now);
  const plan = await ensureSatPlan(uid, today);
  if (!plan) return noPlan;
  const decision = startDecision(plan, itemId, today);
  if (decision.kind === "refuse") return { ok: false, error: decision.error, status: decision.status };
  if (decision.kind === "resume") return { ok: true, sessionId: decision.sessionId };
  const summaries = await listSummaries(uid);
  if (summaries === null) return historyUnavailable;
  let sessionId = existingSessionFor(summaries, itemId);
  if (!sessionId) {
    const created = await createFor(uid, decision.item, plan, now, summaries);
    if (!created.ok) return created;
    sessionId = created.sessionId;
  }
  const started = sessionId;
  const recorded = await updatePlan(uid, async (prev) => {
    if (!prev) return { next: null, result: started };
    const attached = attachSession(prev.items, itemId, started);
    const next = attached.items === prev.items ? prev : { ...prev, items: attached.items, generatedAt: new Date().toISOString() };
    return { next, result: attached.sessionId };
  }).catch(() => started);
  return { ok: true, sessionId: recorded };
}
