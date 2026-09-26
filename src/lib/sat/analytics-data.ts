// src/lib/sat/analytics-data.ts
//
// SERVER-ONLY. A student's SAT analytics (SAT Coach spec 7.3): lists their
// summaries, loads every doc with finished work (bounded concurrency), turns
// each into finished items through the answer-key index (serve.ts
// `itemsOf`), computes with the pure engine, and caches the result at
// portal-data/sat/analytics/<uid>.json. Reads fail closed: any failed
// summary or doc read returns null, and a failed cache read is never
// followed by a cache write.
//
// Which docs are loaded (the summary tells):
//   - finished sittings -- every module;
//   - drills (diagnostic and challenge included) with at least one checked
//     question, finished or not -- their checked questions only.
// An UNFINISHED sitting is not loaded, even with a module submitted: while
// it can still be resumed, its Module 1 results would show on the Progress
// page mid-exam and reveal the route (the reason summaryOf hides them too).
// It counts once it's finished.
//
// The cache is fresh while the summaries' fingerprint AND the Pakistan
// calendar day are unchanged: the fingerprint catches new finished work,
// the day refreshes the recency weighting and the 7/30-day totals.
import "server-only";
import { createHash } from "node:crypto";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { pkToday } from "@/lib/portal/pk-time";
import { computeAnalytics, historyOf, type SittingScore } from "./analytics.ts";
import type { History } from "./coach/challenge-builder.ts";
import type { SATAnalytics, SessionSummary } from "./client-types.ts";
import { itemsOf } from "./serve.ts";
import { listSummaries, loadDoc, type SATDoc } from "./store.ts";

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const cachePath = (uid: string) => `sat/analytics/${uid}.json`;
const LOAD_CONCURRENCY = 8;
const CACHE_VERSION = 1;

type HistoryEntry = History extends Map<string, infer V> ? V : never;

type AnalyticsCache = {
  version: typeof CACHE_VERSION;
  fingerprint: string;
  day: string; // PKT YYYY-MM-DD the analytics were computed on
  analytics: SATAnalytics;
  history: [string, HistoryEntry][];
};

export type StudentAnalytics = { analytics: SATAnalytics; history: History; fingerprint: string };

/** sha1 over each summary's id, finishedAt, correct, total and drill
 *  checkedCount, sorted by id: a save that only reorders the index (every
 *  autosave moves its sitting to the front) leaves it unchanged. */
export function analyticsFingerprint(summaries: SessionSummary[]): string {
  const rows = summaries
    .map((s) => [s.id, s.finishedAt, s.correct, s.total, s.checkedCount ?? null] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash("sha1").update(JSON.stringify(rows)).digest("hex");
}

/** Does this summary's doc hold finished work worth loading? An index entry
 *  written before `checkedCount` existed can't say, so an unfinished drill
 *  without it is loaded to find out. */
function hasFinishedWork(s: SessionSummary): boolean {
  if (s.kind !== "drill") return s.finishedAt !== null;
  return s.finishedAt !== null || s.checkedCount === undefined || s.checkedCount > 0;
}

function sittingScores(summaries: SessionSummary[]): SittingScore[] {
  const out: SittingScore[] = [];
  for (const s of summaries) {
    if (s.kind === "drill" || s.finishedAt === null) continue;
    out.push({ id: s.id, kind: s.kind, title: s.title, finishedAt: s.finishedAt, score: s.score });
  }
  return out;
}

/** The docs for `ids`, at most LOAD_CONCURRENCY reads in flight; null as
 *  soon as any read fails. Kept in `ids` order so the computed analytics
 *  (label ties, ranking ties) never depend on which read finished first. */
async function loadDocs(uid: string, ids: string[]): Promise<SATDoc[] | null> {
  const docs: (SATDoc | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  let failed = false;
  async function worker(): Promise<void> {
    while (!failed && next < ids.length) {
      const i = next++;
      const loaded = await loadDoc(uid, ids[i]);
      if (!loaded.ok) {
        failed = true;
        return;
      }
      docs[i] = loaded.doc;
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, ids.length) }, () => worker()));
  return failed ? null : docs.filter((d): d is SATDoc => d !== null);
}

/** A stored cache doc, or null when it isn't one this version wrote. */
function asCache(raw: unknown): AnalyticsCache | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<AnalyticsCache>;
  if (c.version !== CACHE_VERSION || typeof c.fingerprint !== "string" || typeof c.day !== "string") return null;
  if (!c.analytics || typeof c.analytics !== "object" || !Array.isArray(c.history)) return null;
  return c as AnalyticsCache;
}

/** The student's analytics and per-question history (finished items only),
 *  or null when any read fails. */
export async function studentAnalytics(uid: string, now: number): Promise<StudentAnalytics | null> {
  if (!SAFE_UID.test(uid)) return null;
  const summaries = await listSummaries(uid);
  if (summaries === null) return null;
  const fingerprint = analyticsFingerprint(summaries);
  const day = pkToday(now);

  const cached = await readFreshJson<unknown>(BUCKET, cachePath(uid));
  const hit = cached.ok ? asCache(cached.data) : null;
  if (hit && hit.fingerprint === fingerprint && hit.day === day) {
    return { analytics: hit.analytics, history: new Map(hit.history), fingerprint };
  }

  const docs = await loadDocs(uid, summaries.filter(hasFinishedWork).map((s) => s.id));
  if (docs === null) return null;
  const items = docs.flatMap((doc) => itemsOf(doc));
  const analytics = computeAnalytics(items, sittingScores(summaries), now);
  const history = historyOf(items);

  // Best-effort (a failed write only means recomputing next time) -- and
  // never after a failed cache read (storage fails closed).
  if (cached.ok) {
    const doc: AnalyticsCache = { version: CACHE_VERSION, fingerprint, day, analytics, history: [...history] };
    await writeFreshJson(BUCKET, cachePath(uid), doc);
  }
  return { analytics, history, fingerprint };
}
