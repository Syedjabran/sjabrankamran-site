// src/lib/sat/store.ts
//
// SERVER-ONLY. One JSON document per sitting in the private portal-data
// bucket, plus a small per-student index of summaries. Each sitting has its
// own file, so a student's concurrent tabs never read-modify-write the same
// document as another sitting. Reads fail closed (storage-fresh.ts).
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { sittingQuestionIds, type SATSession } from "./session.ts";
import { openDrillQuestionIds, type SATDrill } from "./drills.ts";
import type { SessionSummary } from "./client-types.ts";
import { summaryOf } from "./serve.ts";

export type SATDoc = SATSession | SATDrill;

const BUCKET = "portal-data";
const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const docPath = (uid: string, id: string) => `sat/sessions/${uid}/${id}.json`;
const indexPath = (uid: string) => `sat/sessions/${uid}/index.json`;

export type LoadResult = { ok: true; doc: SATDoc | null } | { ok: false };

export async function loadDoc(uid: string, id: string): Promise<LoadResult> {
  if (!SAFE_ID.test(uid) || !SAFE_ID.test(id)) return { ok: true, doc: null };
  const r = await readFreshJson<SATDoc>(BUCKET, docPath(uid, id));
  if (!r.ok) return { ok: false };
  return { ok: true, doc: r.data && r.data.uid === uid ? r.data : null };
}

const LOAD_CONCURRENCY = 8;

/** The docs for `ids`, at most LOAD_CONCURRENCY reads in flight; null as
 *  soon as any read fails. Kept in `ids` order (a missing doc is dropped),
 *  so what callers compute never depends on which read finished first. */
export async function loadDocs(uid: string, ids: string[]): Promise<SATDoc[] | null> {
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

export async function listSummaries(uid: string): Promise<SessionSummary[] | null> {
  if (!SAFE_ID.test(uid)) return [];
  const r = await readFreshJson<{ items: SessionSummary[] }>(BUCKET, indexPath(uid));
  if (!r.ok) return null;
  // Entries written before `overtime` existed carry no such field: false.
  return (r.data?.items ?? []).map((x) => ({ ...x, overtime: x.overtime === true }));
}

/** Save the document, then its summary. A failed index write leaves the
 *  sitting intact (it is the source of truth) and is retried on the next save.
 *  A doc whose uid or id fails SAFE_ID is rejected outright -- the same guard
 *  `loadDoc`/`listSummaries` apply on read, so a malformed id can never be
 *  written to a path those reads would then refuse to resolve. */
export async function saveDoc(doc: SATDoc): Promise<boolean> {
  if (!SAFE_ID.test(doc.uid) || !SAFE_ID.test(doc.id)) return false;
  if (!(await writeFreshJson(BUCKET, docPath(doc.uid, doc.id), doc))) return false;
  const current = await readFreshJson<{ items: SessionSummary[] }>(BUCKET, indexPath(doc.uid));
  if (!current.ok) return true;
  const items = (current.data?.items ?? []).filter((x) => x.id !== doc.id);
  items.unshift(summaryOf(doc));
  await writeFreshJson(BUCKET, indexPath(doc.uid), { items: items.slice(0, 300) });
  return true;
}

// A student's own sittings started within this window are treated as
// currently "in play" for exclusion purposes (a new drill, diagnostic or
// adaptive mock never draws their questions) -- long enough to cover any
// adaptive/practice sitting actually in progress, short enough that an old,
// abandoned, unfinished sitting stops narrowing the drill pool forever.
const RECENT_MS = 4 * 60 * 60 * 1000;

/** Question ids a new drill, diagnostic or adaptive mock must not draw right
 *  now: everything planned, or possibly still to be routed to, in the
 *  student's own unfinished adaptive/practice sittings started in the last
 *  four hours -- otherwise a drill opened in another tab, filtered to match,
 *  or a second mock blank-submitted for its review, becomes a way to look up
 *  a mid-exam answer. Pass `summaries` when the caller already holds a fresh
 *  list. Reads fail closed: any failure returns `null` and the caller must
 *  refuse to build an unfiltered drill or form rather than silently start
 *  one. */
export async function inPlayQuestionIds(uid: string, now: number, summaries?: SessionSummary[]): Promise<Set<string> | null> {
  const sittings = await recentUnfinishedSittings(uid, now, summaries);
  if (sittings === null) return null;
  const exclude = new Set<string>();
  for (const doc of sittings) for (const id of sittingQuestionIds(doc)) exclude.add(id);
  return exclude;
}

/** The student's unfinished adaptive/practice sittings started in the last
 *  four hours (RECENT_MS) -- the ones that can be in play right now: what
 *  inPlayQuestionIds excludes from new drills and mocks, and what the SAT
 *  tutor's pause rule reads. Fails closed: null on any read failure. */
export async function recentUnfinishedSittings(uid: string, now: number, summaries?: SessionSummary[]): Promise<SATSession[] | null> {
  const list = summaries ?? (await listSummaries(uid));
  if (list === null) return null;
  const recent = list.filter((s) => s.kind !== "drill" && s.finishedAt === null && now - s.createdAt <= RECENT_MS);
  const sittings: SATSession[] = [];
  for (const summary of recent) {
    const loaded = await loadDoc(uid, summary.id);
    if (!loaded.ok) return null;
    const doc = loaded.doc;
    if (doc && doc.kind !== "drill") sittings.push(doc);
  }
  return sittings;
}

/** What a NEW adaptive mock must not draw (SAT Coach ruling 7a): the
 *  in-play sittings' questions, plus every question an unfinished drill of
 *  the student's (practice drill, diagnostic or challenge) has not checked
 *  yet -- a blank-submitted mock's report would show their answers. No time
 *  window for drills: an open drill can be finished any day. Fails closed:
 *  null on any read failure. */
export async function mockExcludeIds(uid: string, now: number, summaries?: SessionSummary[]): Promise<Set<string> | null> {
  const list = summaries ?? (await listSummaries(uid));
  if (list === null) return null;
  const exclude = await inPlayQuestionIds(uid, now, list);
  if (exclude === null) return null;
  const drills = await loadDocs(uid, list.filter((s) => s.kind === "drill" && s.finishedAt === null).map((s) => s.id));
  if (drills === null) return null;
  for (const doc of drills) if (doc.kind === "drill") for (const id of openDrillQuestionIds(doc)) exclude.add(id);
  return exclude;
}
