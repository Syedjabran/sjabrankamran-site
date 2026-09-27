// src/lib/exam-lab/reveals.ts
//
// SERVER-ONLY. The answer freeze after a mark-scheme reveal, kept on the
// server: when a student reveals one question's scheme in a help-allowed
// sitting (/api/exam-lab/reveal), the answer they had at that moment is
// recorded here, one object per sitting and question (the sitting's scope is
// answer-rules.ts revealScope: `a-<allocationId>` for an allocation, the
// sitting id for practice):
//   portal-data/exam-reveals/<uid>/<scope>/<qid>.json -> RevealRecord
// The attempt route counts that recorded answer whatever the browser sends
// later, and Maxwell marks the question only for that answer
// (answer-rules.ts frozenResponse / markAllowedAfterReveal). One object per
// question is written once (no upsert), so two reveals at the same moment
// never overwrite each other, and the first reveal's answer is the one kept.
// Reads fail closed.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RevealRecord } from "./answer-rules";
import { readFreshJson } from "./storage-fresh";

const DATA = "portal-data";
const SAFE = /^[A-Za-z0-9_.-]{1,80}$/;
const MAX_TEXT = 12_000; // the attempt route keeps at most this much of a response
const path = (uid: string, scope: string, qid: string) => `exam-reveals/${uid}/${scope}/${qid}.json`;
const safe = (...parts: string[]) => parts.every((p) => SAFE.test(p) && !p.includes(".."));

function asRecord(v: unknown): RevealRecord | null {
  const r = v as Partial<RevealRecord> | null;
  return r && typeof r.text === "string" && typeof r.at === "number" ? { text: r.text, at: r.at } : null;
}

/** One question's reveal: the record, undefined when never revealed, or null
 *  when it could not be read. */
export async function readReveal(uid: string, scope: string, qid: string): Promise<RevealRecord | undefined | null> {
  if (!safe(uid, scope, qid)) return undefined;
  const r = await readFreshJson<RevealRecord>(DATA, path(uid, scope, qid));
  if (!r.ok) return null;
  return r.data === null ? undefined : asRecord(r.data) ?? undefined;
}

/** The reveals among `qids` of one sitting ({} when none), or null when any
 *  could not be read. */
export async function readReveals(uid: string, scope: string, qids: string[]): Promise<Record<string, RevealRecord> | null> {
  const out: Record<string, RevealRecord> = {};
  const todo = [...new Set(qids)];
  let failed = false;
  let next = 0;
  const worker = async () => {
    while (!failed && next < todo.length) {
      const qid = todo[next++];
      const rec = await readReveal(uid, scope, qid);
      if (rec === null) failed = true;
      else if (rec) out[qid] = rec;
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, todo.length) }, worker));
  return failed ? null : out;
}

/**
 * Records that `qid`'s scheme was shown with `answer` as the student's
 * answer. The first reveal wins: revealing again (say, the retry of its
 * image) never replaces the frozen answer. Returns the record in force, or
 * null when it could not be saved -- the caller must then not show the scheme.
 */
export async function recordReveal(uid: string, scope: string, qid: string, answer: string): Promise<RevealRecord | null> {
  if (!safe(uid, scope, qid)) return null;
  const rec: RevealRecord = { text: answer.slice(0, MAX_TEXT), at: Date.now() };
  try {
    const body = new Blob([JSON.stringify(rec)], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(DATA)
      .upload(path(uid, scope, qid), body, { upsert: false, contentType: "application/json", cacheControl: "0" });
    if (!error) return rec;
  } catch { /* read what is there */ }
  // Already recorded (or the upload failed): whatever is stored stands.
  const existing = await readReveal(uid, scope, qid);
  return existing ?? null;
}
