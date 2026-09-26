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
// Which docs hold finished work is the summary's call (analytics.ts
// `hasFinishedWork`): finished sittings, and drills with a checked question.
// An unfinished sitting is never loaded -- it counts once it's finished.
//
// The cache is fresh while the summaries' fingerprint AND the Pakistan
// calendar day are unchanged: the fingerprint catches new finished work,
// the day refreshes the recency weighting and the 7/30-day totals. It also
// keeps the items of every FINISHED doc by id (a finished doc never
// changes), so a recompute re-reads only new or still-open docs.
import "server-only";
import { createHash } from "node:crypto";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { pkToday } from "@/lib/portal/pk-time";
import {
  computeAnalytics, docsToLoad, finishedItemsCache, hasFinishedWork, historyOf, sittingScores, type AnalyticsItem,
} from "./analytics.ts";
import type { History } from "./coach/challenge-builder.ts";
import type { SATAnalytics, SessionSummary } from "./client-types.ts";
import { itemsOf } from "./serve.ts";
import { listSummaries, loadDocs, type SATDoc } from "./store.ts";

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const cachePath = (uid: string) => `sat/analytics/${uid}.json`;
const CACHE_VERSION = 2;

type HistoryEntry = History extends Map<string, infer V> ? V : never;

type AnalyticsCache = {
  version: typeof CACHE_VERSION;
  fingerprint: string;
  day: string; // PKT YYYY-MM-DD the analytics were computed on
  analytics: SATAnalytics;
  history: [string, HistoryEntry][];
  finished: Record<string, AnalyticsItem[]>; // items per FINISHED doc id
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

/** A stored cache doc, or null when it isn't one this version wrote. */
function asCache(raw: unknown): AnalyticsCache | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<AnalyticsCache>;
  if (c.version !== CACHE_VERSION || typeof c.fingerprint !== "string" || typeof c.day !== "string") return null;
  if (!c.analytics || typeof c.analytics !== "object" || !Array.isArray(c.history)) return null;
  if (!c.finished || typeof c.finished !== "object") return null;
  return c as AnalyticsCache;
}

/** What a caller already read fresh for this student, so it isn't read
 *  again: the summaries, and any docs (a doc listed here is used instead of
 *  re-reading it). */
export type KnownReads = { summaries: SessionSummary[]; docs?: SATDoc[] };

/** The student's analytics and per-question history (finished items only),
 *  or null when any read fails. */
export async function studentAnalytics(uid: string, now: number, known?: KnownReads): Promise<StudentAnalytics | null> {
  if (!SAFE_UID.test(uid)) return null;
  const summaries = known ? known.summaries : await listSummaries(uid);
  if (summaries === null) return null;
  const fingerprint = analyticsFingerprint(summaries);
  const day = pkToday(now);

  const cached = await readFreshJson<unknown>(BUCKET, cachePath(uid));
  const hit = cached.ok ? asCache(cached.data) : null;
  if (hit && hit.fingerprint === fingerprint && hit.day === day) {
    return { analytics: hit.analytics, history: new Map(hit.history), fingerprint };
  }

  const reuse = hit?.finished ?? {};
  const needed = docsToLoad(summaries, reuse);
  const given = new Map((known?.docs ?? []).map((doc) => [doc.id, doc]));
  const fetched = await loadDocs(uid, needed.filter((id) => !given.has(id)));
  if (fetched === null) return null;
  const docs = [...needed.flatMap((id) => given.get(id) ?? []), ...fetched];
  const loaded = new Map(docs.map((doc) => [doc.id, itemsOf(doc)]));
  // In summary order, so label and ranking ties never depend on the cache.
  const byDoc = new Map<string, AnalyticsItem[]>();
  for (const s of summaries) {
    if (!hasFinishedWork(s)) continue;
    const docItems = loaded.get(s.id) ?? (Object.hasOwn(reuse, s.id) ? reuse[s.id] : undefined);
    if (docItems) byDoc.set(s.id, docItems);
  }
  const items = [...byDoc.values()].flat();
  const analytics = computeAnalytics(items, sittingScores(summaries), now);
  const history = historyOf(items);

  // Best-effort (a failed write only means recomputing next time) -- and
  // never after a failed cache read (storage fails closed).
  if (cached.ok) {
    const doc: AnalyticsCache = {
      version: CACHE_VERSION, fingerprint, day, analytics, history: [...history], finished: finishedItemsCache(summaries, byDoc),
    };
    await writeFreshJson(BUCKET, cachePath(uid), doc);
  }
  return { analytics, history, fingerprint };
}
