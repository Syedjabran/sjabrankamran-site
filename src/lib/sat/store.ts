// src/lib/sat/store.ts
//
// SERVER-ONLY. One JSON document per sitting in the private portal-data
// bucket, plus a small per-student index of summaries. Each sitting has its
// own file, so a student's concurrent tabs never read-modify-write the same
// document as another sitting. Reads fail closed (storage-fresh.ts).
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import type { SATSession } from "./session.ts";
import type { SATDrill } from "./drills.ts";
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

export async function listSummaries(uid: string): Promise<SessionSummary[] | null> {
  if (!SAFE_ID.test(uid)) return [];
  const r = await readFreshJson<{ items: SessionSummary[] }>(BUCKET, indexPath(uid));
  if (!r.ok) return null;
  return r.data?.items ?? [];
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
