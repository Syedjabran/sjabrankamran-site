// src/lib/sat/coach/tutor.ts
//
// SERVER-ONLY. The Digital SAT Tutor (SAT Coach spec 8.4): one chat turn
// (tutorTurn), the tap on a proposed action (runTutorAction) and the chat
// history (tutorHistory). The prompt, reply validation, pause rule and
// memory caps are pure (tutor-core.ts); this module reads the student's
// record, keeps the memory, calls the LLM adapter and runs actions.
//
// Integrity (spec §3):
//  - Paused: while an adaptive/practice module is running or on its break,
//    every tutor request is refused before anything is counted.
//  - Answer key: "explain" works only for a question this student has
//    FINISHED (the analytics History) and that is not in a sitting in play;
//    its images come from the private bucket with the service role and go
//    to the provider only -- never a URL to the browser.
//  - Limit: 40 messages per student per PKT day, taken before the call
//    (complete() -> takeBudget) and given back when the AI fails.
//  - Storage fails closed: an unreadable memory is never overwritten.
//  - Time: a turn answers within TURN_BUDGET_MS (the LLM call's own
//    deadline skips a retry/fallback that can't fit), well inside the
//    route's maxDuration; folding old turns into the rolling summary runs
//    after the response (next/server after()), never on the student's wait.
//
// Memory: portal-data/sat/tutor/<uid>.json
//   { version: 1, summary, messages: [{ role, text, at, actions?, summarised? }] (last 40),
//     pendingActions: TutorAction[] (the last reply's, until used) }
import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { complete, providerConfig } from "@/lib/ai/llm";
import { modelAcceptsImages, type LlmImage, type ProviderConfig } from "@/lib/ai/llm-core";
import { LIMITS, refundBudget, tutorRemaining } from "@/lib/ai/usage";
import { formatPkDay, pkToday } from "@/lib/portal/pk-time";
import { createAdminClient } from "@/lib/supabase/admin";
import { studentAnalytics, type StudentAnalytics } from "../analytics-data.ts";
import { hasFinishedWork } from "../analytics.ts";
import { loadQuestionBank } from "../bank.ts";
import {
  DIFFICULTY_LABEL, SECTION_LABEL, TUTOR_COUNT_UNAVAILABLE, TUTOR_EXPLAIN_MESSAGE, TUTOR_MAX_MESSAGE_CHARS, TUTOR_PAUSED_MESSAGE, practiceTestTitle,
  type SessionSummary, type TutorAction, type TutorMistake, type TutorPayload,
} from "../client-types.ts";
import { buildFilteredDrill } from "../drill-start.ts";
import { RUNNING_EXAM_REFUSAL } from "../drills.ts";
import { satFilterSchema } from "../filter-schema.ts";
import { itemsOf, publicQuestion, reviewItem } from "../serve.ts";
import { currentStage } from "../session.ts";
import { inPlayQuestionIds, listSummaries, loadDoc, loadDocs, saveDoc } from "../store.ts";
import type { SATDifficulty, SATSection } from "../types.ts";
import { zodIssueMessage } from "../zod-issue-message.ts";
import { cachedInsights } from "./insights.ts";
import { ensureSatPlan, moveMock } from "./plan-store.ts";
import { readProfile } from "./profile-store.ts";
import {
  applySummary, budgetRefusal, compactHistory, isPaused, isSatLabHref, parseSummary, parseTutorReply, pauseCandidateIds, recentMistakes, summaryRequest,
  toSummarise, trimMemory, tutorRequest, type TutorContext, type TutorExplain, type TutorMemory, type TutorMessage, type TutorSkillRef,
} from "./tutor-core.ts";

const BUCKET = "portal-data";
const ASSET_BUCKET = "exam-assets";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const memoryPath = (uid: string) => `sat/tutor/${uid}.json`;
const MEMORY_VERSION = 1;
const MISTAKES_IN_PROMPT = 5;
const MAX_IMAGE_BYTES = 3_000_000;
const IMAGE_TIMEOUT_MS = 8000;
// The route's maxDuration is 60 s. A turn answers within 45 s: the LLM call
// gets what is left of that less a margin for storing the turn; the summary
// fold (after the response) must finish by 55 s.
const TURN_BUDGET_MS = 45_000;
const STORE_MARGIN_MS = 3000;
const FOLD_DEADLINE_MS = 55_000;

const BRAIN = "I can't reach my brain right now — try again in a minute.";
const HISTORY_UNAVAILABLE = "Your SAT history couldn't be checked. Please try again.";
const MEMORY_UNAVAILABLE = "Your chat with the tutor couldn't be loaded. Please try again.";
const EXPIRED = "That suggestion has expired — ask the tutor again.";

type Refusal = { error: string; status: number };
const refuse = (error: string, status: number): Refusal => ({ error, status });

const newId = () => randomBytes(12).toString("base64url");

// --- memory ------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function isMessage(v: unknown): v is TutorMessage {
  return isRecord(v) && (v.role === "user" || v.role === "assistant") && typeof v.text === "string" && typeof v.at === "number";
}

function isAction(v: unknown): v is TutorAction {
  return isRecord(v) && typeof v.id === "string" && (v.type === "create_drill" || v.type === "move_mock" || v.type === "open");
}

/** A stored doc as memory (none yet = empty); any other shape is unreadable
 *  and never overwritten. */
function asMemory(raw: unknown): TutorMemory {
  if (raw == null) return { summary: "", messages: [], pendingActions: [] };
  if (!isRecord(raw) || raw.version !== MEMORY_VERSION || typeof raw.summary !== "string" || !Array.isArray(raw.messages) || !Array.isArray(raw.pendingActions)) {
    throw new Error("unreadable tutor memory");
  }
  return { summary: raw.summary, messages: raw.messages.filter(isMessage), pendingActions: raw.pendingActions.filter(isAction) };
}

/** The student's tutor memory; throws when it can't be read. */
async function readMemory(uid: string): Promise<TutorMemory> {
  if (!SAFE_UID.test(uid)) throw new Error("bad uid");
  const fresh = await readFreshJson<unknown>(BUCKET, memoryPath(uid));
  if (!fresh.ok) throw new Error("tutor memory unreadable");
  return asMemory(fresh.data);
}

async function writeMemory(uid: string, memory: TutorMemory): Promise<boolean> {
  return writeFreshJson(BUCKET, memoryPath(uid), { version: MEMORY_VERSION, ...trimMemory(memory) });
}

/** Fresh read -> change -> write; nothing is written after a failed read.
 *  The memory as stored, or null when it wasn't. */
async function updateMemory(uid: string, change: (prev: TutorMemory) => TutorMemory): Promise<TutorMemory | null> {
  let prev: TutorMemory;
  try {
    prev = await readMemory(uid);
  } catch {
    return null;
  }
  const next = trimMemory(change(prev));
  return (await writeMemory(uid, next)) ? next : null;
}

// --- the student's record --------------------------------------------------------

let SKILLS: TutorSkillRef[] | null = null;

/** Every bank skill (its most common spelling -- the bank spells one skill
 *  two ways), with its domain, section and questions per difficulty. */
function bankSkills(): TutorSkillRef[] {
  if (SKILLS) return SKILLS;
  const byKey = new Map<string, { spellings: Map<string, number>; ref: Omit<TutorSkillRef, "skill"> & { counts: Record<SATDifficulty, number> } }>();
  for (const q of loadQuestionBank()) {
    const key = q.skill.toLowerCase();
    const entry = byKey.get(key) ?? { spellings: new Map(), ref: { domain: q.domain, section: q.section, counts: { E: 0, M: 0, H: 0 } } };
    entry.spellings.set(q.skill, (entry.spellings.get(q.skill) ?? 0) + 1);
    entry.ref.counts[q.difficulty] += 1;
    byKey.set(key, entry);
  }
  SKILLS = [...byKey.values()].map(({ spellings, ref }) => ({ ...ref, skill: [...spellings].sort((a, b) => b[1] - a[1])[0][0] }));
  return SKILLS;
}

const PRACTICE_ID = /^pt(\d+)-(rw|math)-m([12])-q(\d+)$/;

/** How a finished question is named to the student and the tutor. */
function questionLabel(qid: string): string | null {
  const practice = PRACTICE_ID.exec(qid);
  if (practice) return `${practiceTestTitle(Number(practice[1]))} · ${SECTION_LABEL[practice[2] as SATSection]} · Module ${practice[3]} · Q${practice[4]}`;
  const q = publicQuestion(qid, 1);
  if (!q) return null;
  return [q.skill ?? SECTION_LABEL[q.section], q.difficulty ? DIFFICULTY_LABEL[q.difficulty] : null, SECTION_LABEL[q.section]].filter(Boolean).join(" · ");
}

/** The newest finished questions answered wrong, labelled (Progress page
 *  "Explain" and the tutor's context). */
export function mistakeViews(history: StudentAnalytics["history"], limit: number): TutorMistake[] {
  return recentMistakes(history, limit * 2)
    .map(({ qid, at }) => ({ id: qid, label: questionLabel(qid), at }))
    .filter((m): m is TutorMistake => m.label !== null)
    .slice(0, limit);
}

/** True/false: a timed module is running or on its break; null: unknown.
 *  Reads the newest 5 unfinished adaptive/practice sittings, whatever
 *  their age (pauseCandidateIds). */
async function pausedFor(uid: string, now: number, summaries: SessionSummary[]): Promise<boolean | null> {
  const docs = await loadDocs(uid, pauseCandidateIds(summaries));
  if (docs === null) return null;
  return isPaused(docs.flatMap((s) => {
    if (s.kind === "drill") return [];
    const stage = currentStage(s);
    return [{ kind: s.kind, finishedAt: s.finishedAt, stageStartedAt: s.stageStartedAt, breakUntil: s.breakUntil, minutesOfCurrent: stage ? s.minutes[stage] : null }];
  }), now);
}

// --- explain my mistake ------------------------------------------------------------

/** The student's own recorded answer to finished question `qid`, from the
 *  newest doc holding it as finished work (the analytics rule: a checked
 *  drill question, a submitted module of a finished sitting). */
async function finishedResponse(
  uid: string, qid: string, summaries: SessionSummary[], from?: string,
): Promise<{ ok: true; found: boolean; response: string | null } | { ok: false }> {
  // The attempt the "Explain" link came from, when it is this student's own
  // finished work holding the question (loadDoc checks the owner): an
  // unfinished sitting never counts -- its modules may still be resumed.
  if (from) {
    const loaded = await loadDoc(uid, from);
    const doc = loaded.ok ? loaded.doc : null;
    if (doc && (doc.kind === "drill" || doc.finishedAt !== null) && itemsOf(doc).some((item) => item.qid === qid)) {
      return { ok: true, found: true, response: doc.answers[qid] ?? null };
    }
  }
  const ids = summaries.filter(hasFinishedWork).map((s) => s.id);
  const BATCH = 8;
  for (let i = 0; i < ids.length; i += BATCH) {
    const docs = await loadDocs(uid, ids.slice(i, i + BATCH));
    if (docs === null) return { ok: false };
    for (const doc of docs) {
      if (itemsOf(doc).some((item) => item.qid === qid)) return { ok: true, found: true, response: doc.answers[qid] ?? null };
    }
  }
  return { ok: true, found: false, response: null };
}

async function downloadImage(path: string): Promise<LlmImage | null> {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS));
    const got = await Promise.race([createAdminClient().storage.from(ASSET_BUCKET).download(path), timeout]);
    if (!got) return null;
    const { data, error } = got;
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { mime: path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg", base64: bytes.toString("base64") };
  } catch {
    return null;
  }
}

type ExplainFacts = { ok: true; explain: TutorExplain; images: LlmImage[]; label: string } | ({ ok: false } & Refusal);

/** What the tutor may be told about one question: only one this student
 *  has finished and that isn't in a sitting in play. Images (question, then
 *  the official worked answer) only for a model that reads them; otherwise,
 *  or when the worked-answer image is missing, its text version. */
async function explainFacts(
  uid: string, qid: string, from: string | undefined, now: number, summaries: SessionSummary[], stats: StudentAnalytics | null, cfg: ProviderConfig,
): Promise<ExplainFacts> {
  if (!stats) return { ok: false, ...refuse(HISTORY_UNAVAILABLE, 503) };
  const notFinished = { ok: false as const, ...refuse("I can only explain questions you've finished — check your answer first, then ask me.", 409) };
  if (!stats.history.has(qid)) return notFinished;
  const inPlay = await inPlayQuestionIds(uid, now, summaries);
  if (inPlay === null) return { ok: false, ...refuse(HISTORY_UNAVAILABLE, 503) };
  if (inPlay.has(qid)) return { ok: false, ...refuse(RUNNING_EXAM_REFUSAL, 409) };
  const answered = await finishedResponse(uid, qid, summaries, from);
  if (!answered.ok) return { ok: false, ...refuse(HISTORY_UNAVAILABLE, 503) };
  if (!answered.found) return notFinished;
  const item = reviewItem(qid, 1, answered.response);
  const label = questionLabel(qid);
  if (!item || !label) return { ok: false, ...refuse("That question is no longer in the question bank.", 404) };

  const images: LlmImage[] = [];
  let rationale = item.rationale;
  if (modelAcceptsImages(cfg)) {
    const question = await downloadImage(item.img);
    if (question) {
      images.push(question);
      const worked = item.rationaleImg ? await downloadImage(item.rationaleImg) : null;
      if (worked) {
        images.push(worked);
        rationale = null; // the image is the faithful copy; its text layer drops the math symbols
      }
    }
  }
  const explain: TutorExplain = {
    questionId: qid, section: item.section, domain: item.domain, skill: item.skill, difficulty: item.difficulty, kind: item.kind,
    answer: item.answer, response: item.response, correct: item.correct, rationale, withImages: images.length > 0,
  };
  return { ok: true, explain, images, label };
}

// --- a turn ------------------------------------------------------------------------

/** Folds all but the last 8 turns into the rolling summary: a separate,
 *  small call on the global budget only, run after the response (never on
 *  the student's wait) and bounded by `deadlineAt`. The fresh memory then
 *  gets the summary and exactly the folded turns marked (applySummary), so
 *  a turn stored meanwhile is kept. On any failure nothing changes -- the
 *  next turn schedules it again. */
async function foldSummary(uid: string, deadlineAt: number): Promise<void> {
  let memory: TutorMemory;
  try {
    memory = await readMemory(uid);
  } catch {
    return;
  }
  const fold = toSummarise(memory.messages, memory.summary);
  if (!fold.length || !compactHistory(memory.messages, memory.summary).needsSummary) return;
  const result = await complete(summaryRequest(memory.summary, fold), "tutor", null, { deadlineAt }).catch(() => null);
  const summary = result?.ok ? parseSummary(result.json) : null;
  if (summary) await updateMemory(uid, (prev) => applySummary(prev, fold, summary)).catch(() => null);
}

/**
 * One tutor turn: refuses while a timed module runs (423, not counted) or
 * when today's 40 messages are used (429); explains one finished question
 * when `explainQuestionId` is given; otherwise answers from the student's
 * record. The message is counted only when the AI replies -- any AI
 * failure gives it back. The turn (and the reply's actions) is remembered
 * best-effort: a reply is still returned if the memory write fails.
 */
export async function tutorTurn(
  uid: string, firstName: string, message: string, explainQuestionId?: string, explainFrom?: string,
): Promise<{ reply: string; actions: TutorAction[]; remaining: number } | Refusal> {
  const now = Date.now();
  const today = pkToday(now);
  const summaries = await listSummaries(uid);
  if (summaries === null) return refuse(HISTORY_UNAVAILABLE, 503);
  const paused = await pausedFor(uid, now, summaries);
  if (paused === null) return refuse(HISTORY_UNAVAILABLE, 503);
  if (paused) return refuse(TUTOR_PAUSED_MESSAGE, 423);

  const left = await tutorRemaining(uid, today);
  if (left === null) return refuse(TUTOR_COUNT_UNAVAILABLE, 503);
  if (left <= 0) return budgetRefusal("student");
  const cfg = providerConfig();
  if (!cfg) return refuse(BRAIN, 503);

  let memory: TutorMemory;
  try {
    memory = await readMemory(uid);
  } catch {
    return refuse(MEMORY_UNAVAILABLE, 503);
  }
  let profile;
  try {
    profile = await readProfile(uid);
  } catch {
    return refuse("Your SAT settings couldn't be loaded. Please try again.", 503);
  }
  if (!profile) return refuse("Set up your SAT plan first.", 404);

  const stats = await studentAnalytics(uid, now).catch(() => null);
  let explain: TutorExplain | undefined;
  let images: LlmImage[] = [];
  let explainLabel: string | null = null;
  if (explainQuestionId) {
    const facts = await explainFacts(uid, explainQuestionId, explainFrom, now, summaries, stats, cfg);
    if (!facts.ok) return refuse(facts.error, facts.status);
    ({ explain, images } = facts);
    explainLabel = facts.label;
  }
  const plan = await ensureSatPlan(uid, today, { analytics: stats?.analytics ?? null }).catch(() => null);
  const insights = await cachedInsights(uid);

  const ctx: TutorContext = {
    firstName,
    today,
    profile: { examDate: profile.examDate, targetMonth: profile.targetMonth, targetScore: profile.targetScore, start: profile.start, days: profile.days, minutes: profile.minutes },
    plan: plan ? { items: plan.items } : null,
    analytics: stats?.analytics ?? null,
    recordUnavailable: !stats,
    insights: insights ? { headline: insights.headline, summary: insights.summary, tips: insights.tips } : null,
    mistakes: stats ? mistakeViews(stats.history, MISTAKES_IN_PROMPT) : [],
    bankSkills: bankSkills(),
    turnId: randomBytes(6).toString("base64url"),
    explain,
  };
  const text = message.trim().slice(0, TUTOR_MAX_MESSAGE_CHARS) || TUTOR_EXPLAIN_MESSAGE;
  const { send } = compactHistory(memory.messages, memory.summary);
  const request = tutorRequest(ctx, { summary: memory.summary, history: send, message: text, images });
  const result = await complete(request, "tutor", uid, { deadlineAt: now + TURN_BUDGET_MS - STORE_MARGIN_MS });
  if (!result.ok) {
    if (result.reason === "budget") return budgetRefusal(result.scope);
    if (result.reason !== "no-provider") await refundBudget(uid, "tutor", today).catch(() => undefined);
    return refuse(BRAIN, 503);
  }
  const parsed = parseTutorReply(result.json, ctx);
  if (!parsed) {
    await refundBudget(uid, "tutor", today).catch(() => undefined);
    return refuse(BRAIN, 503);
  }

  const asked: TutorMessage = { role: "user", text: explainLabel ? `${text} (${explainLabel})` : text, at: now };
  const answered: TutorMessage = { role: "assistant", text: parsed.reply, at: Date.now(), ...(parsed.actions.length ? { actions: parsed.actions } : {}) };
  const stored = await updateMemory(uid, (prev) => ({ summary: prev.summary, messages: [...prev.messages, asked, answered], pendingActions: parsed.actions }))
    .catch(() => null);
  if (stored && compactHistory(stored.messages, stored.summary).needsSummary) after(() => foldSummary(uid, now + FOLD_DEADLINE_MS));

  return { reply: parsed.reply, actions: parsed.actions, remaining: Math.max(0, left - 1) };
}

// --- actions -----------------------------------------------------------------------

/** Drops a used action so a second tap can't repeat it (best effort). */
async function consume(uid: string, actionId: string): Promise<void> {
  await updateMemory(uid, (prev) => ({ ...prev, pendingActions: prev.pendingActions.filter((a) => a.id !== actionId) })).catch(() => null);
}

/**
 * Runs one of the latest reply's proposed actions, on the student's tap:
 * a drill (the shared filter schema, then the same builder as the drill
 * form -- never a running sitting's question), a full-exam move (the
 * planner's move rules on a freshly maintained plan) or opening a SAT Lab
 * page. Only actions still pending in the memory run; refused while a
 * timed module is running.
 */
export async function runTutorAction(uid: string, actionId: string): Promise<{ ok: true; href: string; note?: string } | ({ ok: false } & Refusal)> {
  const now = Date.now();
  const summaries = await listSummaries(uid);
  if (summaries === null) return { ok: false, ...refuse(HISTORY_UNAVAILABLE, 503) };
  const paused = await pausedFor(uid, now, summaries);
  if (paused === null) return { ok: false, ...refuse(HISTORY_UNAVAILABLE, 503) };
  if (paused) return { ok: false, ...refuse(TUTOR_PAUSED_MESSAGE, 423) };
  let memory: TutorMemory;
  try {
    memory = await readMemory(uid);
  } catch {
    return { ok: false, ...refuse(MEMORY_UNAVAILABLE, 503) };
  }
  const action = memory.pendingActions.find((a) => a.id === actionId);
  if (!action) return { ok: false, ...refuse(EXPIRED, 410) };

  // Re-checked at the tap too: only a SAT Lab page, whatever the memory holds.
  if (action.type === "open") return isSatLabHref(action.href) ? { ok: true, href: action.href } : { ok: false, ...refuse(EXPIRED, 410) };

  if (action.type === "create_drill") {
    const filter = satFilterSchema.safeParse(action.filter);
    if (!filter.success) return { ok: false, ...refuse(zodIssueMessage(filter.error), 409) };
    const built = await buildFilteredDrill(filter.data, action.count, { id: newId(), uid, now });
    if (!built.ok) return { ok: false, ...refuse(built.error, built.status) };
    if (!(await saveDoc(built.doc))) return { ok: false, ...refuse("Couldn't start the drill. Please try again.", 503) };
    await consume(uid, actionId);
    return { ok: true, href: `/portal/sat-lab/${built.doc.id}` };
  }

  let moved;
  try {
    moved = await moveMock(uid, action.itemId, action.date);
  } catch {
    return { ok: false, ...refuse("Your plan couldn't be saved. Please try again.", 503) };
  }
  if (!moved.ok) return { ok: false, ...refuse(moved.error, moved.status) };
  await consume(uid, actionId);
  return { ok: true, href: "/portal/sat-lab", note: `Moved to ${formatPkDay(action.date)}.` };
}

// --- history -----------------------------------------------------------------------

/** GET /api/sat/tutor: the stored chat, the latest reply's live actions,
 *  messages left today, whether the tutor is paused right now, and the
 *  newest finished wrong answer (for "Explain my last wrong answer"). */
export async function tutorHistory(uid: string): Promise<TutorPayload | Refusal> {
  const now = Date.now();
  let memory: TutorMemory;
  try {
    memory = await readMemory(uid);
  } catch {
    return refuse(MEMORY_UNAVAILABLE, 503);
  }
  const summaries = await listSummaries(uid);
  // Unknown reads show the tutor as open; the turn itself re-checks and fails closed.
  const paused = summaries ? (await pausedFor(uid, now, summaries)) ?? false : false;
  const stats = await studentAnalytics(uid, now).catch(() => null);
  return {
    messages: memory.messages.map(({ role, text, at, actions }) => ({ role, text, at, ...(actions?.length ? { actions } : {}) })),
    pending: memory.pendingActions.map((a) => a.id),
    remaining: await tutorRemaining(uid, pkToday(now)),
    limit: LIMITS.tutor,
    paused,
    lastWrongId: stats ? mistakeViews(stats.history, 1)[0]?.id ?? null : null,
  };
}
