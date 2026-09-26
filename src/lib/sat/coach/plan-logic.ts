// src/lib/sat/coach/plan-logic.ts
//
// The pure decisions behind the stored study plan (plan-store.ts, SAT Coach
// spec 6.5 and the Task 9 rulings), Node-testable against an in-memory doc:
// when a profile edit re-plans (planDecision), the next doc after a visit or
// the daily cron (nextPlan -- build when needed, then ALWAYS the planner's
// daily maintenance), which finished work fulfils which item (doneMapFrom),
// recording a start or a finish on one item, and whether an item may be
// started. No answer data and no server-only imports; plan dates are PKT
// calendar days "YYYY-MM-DD" (finish instants become PKT days via pkToday).
import { createHash } from "node:crypto";
import type { PlanItem, SATAnalytics, SessionSummary } from "../client-types.ts";
import { formatPkDay, pkToday } from "../../portal/pk-time.ts";
import { buildPlan, horizonEnd, maintainPlan, rebuildScope, type PlannerProfile, type RebuildScope } from "./planner.ts";

export type WeakAtWeekStart = { key: string; label: string; mastery: number };

/** The weakest high-weight skill as it stood when this ISO week began --
 *  the baseline of the week's mastery goal (goals.ts, ruling 5). */
export type WeekStart = { isoWeek: string; weak: WeakAtWeekStart | null };

/** portal-data/sat/plan/<uid>.json. `profileSnapshot` is what the planner
 *  last planned from: a profile edit re-plans only what it changes
 *  (ruling 1 -- it replaces the spec's inputsKey). `generatedAt` moves
 *  whenever the items change. */
export type SATPlan = {
  version: 1;
  generatedAt: string;
  profileSnapshot: PlannerProfile;
  weekStart: WeekStart | null;
  items: PlanItem[];
};

export type DoneMap = Record<string, { finishedDate: string; sessionId: string }>;

const DAY_MS = 24 * 60 * 60 * 1000;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The profile fields the planner plans from, normalised (days sorted and
 *  unique) so an unchanged profile always compares equal. */
export function snapshotOf(p: PlannerProfile): PlannerProfile {
  return {
    examDate: p.examDate, targetMonth: p.targetMonth, days: [...new Set(p.days)].sort((a, b) => a - b),
    minutes: p.minutes, start: { kind: p.start.kind },
  };
}

/** What this visit must re-plan: a first build ("schedule"), what the edit
 *  since the last plan changes (planner.ts rebuildScope), or nothing. */
export function planDecision(prev: SATPlan | null, profile: PlannerProfile): "keep" | RebuildScope {
  if (!prev) return "schedule";
  return rebuildScope(prev.profileSnapshot, profile) ?? "keep";
}

/** The ISO-8601 week of a calendar day, "2026-W39" (weeks run Monday to
 *  Sunday; the week holding the year's first Thursday is week 1). */
export function isoWeekKey(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  const thursday = ms + (3 - sinceMonday) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Deterministic new item ids: the same previous plan, day and profile give
 *  the same ids, so two passes racing from one stored doc write the same
 *  doc and neither caller's ids go stale. */
function seededIds(seed: string): () => string {
  let n = 0;
  return () => createHash("sha1").update(`${seed}#${++n}`).digest("base64url").slice(0, 16);
}

/** Needs a fresh week snapshot: no plan yet, or a new ISO week began. */
export function weekRolled(prev: SATPlan | null, today: string): boolean {
  return prev?.weekStart?.isoWeek !== isoWeekKey(today);
}

/** The week-start snapshot from the analytics: the top-priority weak skill
 *  (priority already weighs the domain's share of the test), or null. */
export function weakSnapshot(analytics: Pick<SATAnalytics, "weakSkills"> | null): WeakAtWeekStart | null {
  const weakest = analytics?.weakSkills[0];
  return weakest ? { key: weakest.key, label: weakest.label, mastery: weakest.mastery } : null;
}

/** This week's mastery-goal baseline -- never a previous week's. */
export function currentWeak(plan: SATPlan | null, today: string): WeakAtWeekStart | null {
  return plan?.weekStart && plan.weekStart.isoWeek === isoWeekKey(today) ? plan.weekStart.weak : null;
}

export type NextPlanInput = {
  today: string;
  profile: PlannerProfile;
  practiceTaken: number[];
  practiceAvailable: number[];
  done: DoneMap;
  diagnosticId: string | null;
  /** The week-start snapshot when one was computed for this pass; undefined
   *  when analytics weren't loaded (the week then rolls on a later pass). */
  weak: WeakAtWeekStart | null | undefined;
  nowIso: string;
};

/** The plan after this pass (ruling 1): build (or partly rebuild) only when
 *  planDecision says so, then ALWAYS the planner's daily maintenance --
 *  never bare statuses, which would drop a missed full exam's replacement.
 *  Returns `prev` itself when nothing changed, so the caller writes only
 *  when there is something to write. */
export function nextPlan(prev: SATPlan | null, input: NextPlanInput): SATPlan {
  const { today, profile, practiceTaken, practiceAvailable, done, diagnosticId, weak, nowIso } = input;
  const snapshot = snapshotOf(profile);
  const newId = seededIds(JSON.stringify([prev?.items ?? null, today, snapshot]));
  const decision = planDecision(prev, profile);
  let items = prev?.items ?? [];
  if (decision !== "keep") {
    items = buildPlan({ today, profile, existing: items, practiceTaken, practiceAvailable, newId, diagnosticId, scope: decision });
  }
  items = maintainPlan({ items, today, done, practiceTaken, practiceAvailable, examDate: horizonEnd(profile), days: profile.days, newId });

  const isoWeek = isoWeekKey(today);
  const weekStart = prev?.weekStart?.isoWeek === isoWeek || weak === undefined ? prev?.weekStart ?? null : { isoWeek, weak };
  const itemsChanged = !prev || !sameJson(prev.items, items);
  if (prev && !itemsChanged && sameJson(prev.profileSnapshot, snapshot) && sameJson(prev.weekStart, weekStart)) return prev;
  return { version: 1, generatedAt: prev && !itemsChanged ? prev.generatedAt : nowIso, profileSnapshot: snapshot, weekStart, items };
}

/** Which finished work fulfils which plan item (ruling 3): the item's own
 *  recorded session when it has finished, else the earliest-finished doc
 *  carrying the item's id (a start whose sessionId write was lost).
 *  finishedDate is the PKT day of the finish. */
export function doneMapFrom(summaries: SessionSummary[], items: PlanItem[]): DoneMap {
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const byItem = new Map<string, SessionSummary>();
  for (const s of summaries) {
    if (!s.planItemId || s.finishedAt === null) continue;
    const seen = byItem.get(s.planItemId);
    if (!seen || s.finishedAt < (seen.finishedAt ?? Infinity)) byItem.set(s.planItemId, s);
  }
  const out: DoneMap = {};
  for (const item of items) {
    const own = item.sessionId ? byId.get(item.sessionId) : undefined;
    const doc = own && own.finishedAt !== null ? own : byItem.get(item.id);
    if (doc && doc.finishedAt !== null) out[item.id] = { finishedDate: pkToday(doc.finishedAt), sessionId: doc.id };
  }
  return out;
}

/** The official practice tests the student has finished (ruling 4). Index
 *  entries written before summaries carried testNo still hold the title
 *  practiceTestTitle gave them ("Official Practice Test 7"). */
export function practiceTakenFrom(summaries: SessionSummary[]): number[] {
  const taken = new Set<number>();
  for (const s of summaries) {
    if (s.kind !== "practice" || s.finishedAt === null) continue;
    const testNo = s.testNo ?? Number(/(\d+)$/.exec(s.title)?.[1]);
    if (Number.isInteger(testNo)) taken.add(testNo);
  }
  return [...taken].sort((a, b) => a - b);
}

/** The student's newest diagnostic drill -- the one a first build links to
 *  the plan's diagnostic item. */
export function latestDiagnosticId(summaries: SessionSummary[]): string | null {
  let latest: SessionSummary | null = null;
  for (const s of summaries) if (s.purpose === "diagnostic" && (!latest || s.createdAt > latest.createdAt)) latest = s;
  return latest?.id ?? null;
}

/** A doc already started for this item (newest first) -- found through the
 *  summaries when the start's sessionId write didn't land. */
export function existingSessionFor(summaries: SessionSummary[], itemId: string): string | null {
  let latest: SessionSummary | null = null;
  for (const s of summaries) if (s.planItemId === itemId && (!latest || s.createdAt > latest.createdAt)) latest = s;
  return latest?.id ?? null;
}

/** Record a finish on one item: done on its day, late after (PKT). Only this
 *  item changes -- every other status is the daily maintenance's job -- and
 *  an item already done or late keeps its first finish. Same array back
 *  when nothing changed. */
export function completeItem(items: PlanItem[], itemId: string, sessionId: string, finishedDate: string): PlanItem[] {
  let changed = false;
  const out = items.map((item): PlanItem => {
    if (item.id !== itemId || item.status === "done" || item.status === "late") return item;
    changed = true;
    return { ...item, status: finishedDate <= item.date ? "done" : "late", sessionId, completedAt: finishedDate };
  });
  return changed ? out : items;
}

/** Record a start on one item at once (ruling 2: the planner never replaces
 *  a started full exam). A concurrent start that got there first keeps its
 *  doc; `sessionId` is whichever the item now holds. */
export function attachSession(items: PlanItem[], itemId: string, sessionId: string): { items: PlanItem[]; sessionId: string } {
  const item = items.find((i) => i.id === itemId);
  if (!item) return { items, sessionId };
  if (item.sessionId) return { items, sessionId: item.sessionId };
  return { items: items.map((i) => (i.id === itemId ? { ...i, sessionId } : i)), sessionId };
}

export type StartDecision =
  | { kind: "resume"; sessionId: string }
  | { kind: "create"; item: PlanItem }
  | { kind: "refuse"; status: number; error: string };

/** Whether plan item `itemId` may be started today: an item already
 *  started opens its doc; the SAT itself, a future item, a finished one and
 *  a missed full exam that was re-placed are refused in a plain sentence. */
export function startDecision(plan: SATPlan, itemId: string, today: string): StartDecision {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return { kind: "refuse", status: 404, error: "That part of your plan wasn't found — reload the page." };
  if (item.sessionId) return { kind: "resume", sessionId: item.sessionId };
  if (item.kind === "exam") return { kind: "refuse", status: 400, error: "That's your SAT itself — there's nothing to start here." };
  if (item.date > today) return { kind: "refuse", status: 409, error: `This opens on ${formatPkDay(item.date)}.` };
  if (item.status === "done" || item.status === "late") return { kind: "refuse", status: 409, error: "You've already finished this one." };
  const replacement = item.kind === "mock" ? plan.items.find((i) => i.replacementFor === item.id) : undefined;
  if (replacement) return { kind: "refuse", status: 409, error: `This full exam was moved to ${formatPkDay(replacement.date)} — sit it then.` };
  return { kind: "create", item };
}

/** The analytics a challenge is built from: none until there is finished
 *  work, so a first challenge is the balanced one (spec 6.2). */
export function challengeAnalytics<T extends Pick<SATAnalytics, "totals">>(analytics: T | null): T | null {
  return analytics && analytics.totals.answered > 0 ? analytics : null;
}
