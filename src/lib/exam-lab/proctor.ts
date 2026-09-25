/**
 * Proctoring & forensic log for strict Exam Lab tests. SERVER-ONLY (service-role).
 *
 * Everything is Storage-as-DB in the private `portal-data` bucket (no schema
 * migration). Per attempt we keep ONE forensic session document; a small shared
 * index lists locked tests so the super-admin review queue is a single read.
 *
 * PRIVACY: no continuous video is ever uploaded. Face analysis runs entirely on
 * the student's device. A single still JPEG snapshot is stored ONLY at a
 * confirmed violation, as evidence for super-admin review, and lives in the
 * private bucket (signed URLs only).
 *
 *   portal-data/proctor/<uid>/<attemptId>.json          → ProctorSession
 *   portal-data/proctor/<uid>/<attemptId>/<ts>.jpg       → violation snapshots
 *   portal-data/proctor/_locks.json                      → { [key]: LockEntry }
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { readFreshJson, writeFreshJson } from "./storage-fresh";

const BUCKET = "portal-data";
const LOCKS_KEY = "proctor/_locks.json";
/**
 * Attempt ids are client-supplied and become part of a storage key; anything
 * but a plain id (e.g. "../..") could address another doc in the bucket.
 * Generated ids (`alloc-<id>`, `<base36>-<rand>`) always match.
 */
export const ATTEMPT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const UID_RE = /^[A-Za-z0-9-]{1,64}$/;
const validKey = (uid: string, attemptId: string) => UID_RE.test(uid) && ATTEMPT_ID_RE.test(attemptId);
const sessKey = (uid: string, attemptId: string) => `proctor/${uid}/${attemptId}.json`;
const snapKey = (uid: string, attemptId: string, ts: number) => `proctor/${uid}/${attemptId}/${ts}.jpg`;

export type ProctorEvent = {
  type: string;
  reason: string;
  terminal: boolean;
  at: number;
  source: "guard" | "camera" | "system";
};

export type ProctorStatus = "active" | "submitted" | "cancelled" | "locked" | "unlocked";

export type ProctorSession = {
  attemptId: string;
  uid: string;
  studentName: string;
  studentEmail: string;
  kind: "practice" | "assignment" | "test";
  integrity: "off" | "standard" | "strict";
  meta: { title: string; subtitle?: string; code?: string; ref?: string; paperType?: string };
  startedAt: number;
  endedAt: number | null;
  status: ProctorStatus;
  cameraConsent: boolean;
  lockedReason: string | null;
  events: ProctorEvent[];
  snapshots: { path: string; at: number; reason: string }[];
  unlockRequest: { at: number; note: string } | null;
  unlock: { by: string; byName: string; at: number; note: string } | null;
};

export type LockEntry = {
  uid: string;
  attemptId: string;
  studentName: string;
  studentEmail: string;
  title: string;
  lockedReason: string;
  at: number;
  status: ProctorStatus;
  unlockRequestedAt: number | null;
};

export function newAttemptId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Cache-busted reads: a stale CDN copy of a session or of _locks.json, written
// back, silently reverted a lock or dropped another student's queue entry.
async function readJson<T>(key: string): Promise<T | null> {
  const r = await readFreshJson<T>(BUCKET, key);
  return r.ok ? r.data : null;
}

function writeJson(key: string, value: unknown): Promise<boolean> {
  return writeFreshJson(BUCKET, key, value);
}

/**
 * Re-read / modify / write the lock index in one tight step, and never write
 * after a failed read (that would wipe every other entry in the queue).
 */
async function updateLocks(mutate: (idx: Record<string, LockEntry>) => boolean): Promise<void> {
  const r = await readFreshJson<Record<string, LockEntry>>(BUCKET, LOCKS_KEY);
  if (!r.ok) return;
  const idx = r.data || {};
  if (mutate(idx)) await writeJson(LOCKS_KEY, idx);
}

/** Statuses a late client post (event / end) may no longer change. */
const FROZEN: ProctorStatus[] = ["locked", "cancelled", "submitted", "unlocked"];

export async function getSession(uid: string, attemptId: string): Promise<ProctorSession | null> {
  if (!validKey(uid, attemptId)) return null;
  return readJson<ProctorSession>(sessKey(uid, attemptId));
}

export async function startSession(
  uid: string,
  attemptId: string,
  init: {
    studentName: string; studentEmail: string;
    kind: ProctorSession["kind"]; integrity: ProctorSession["integrity"];
    meta: ProctorSession["meta"]; cameraConsent: boolean;
  }
): Promise<ProctorSession> {
  if (!validKey(uid, attemptId)) throw new Error("Invalid attempt id.");
  // Fail closed: an unreadable session must never be mistaken for "none" —
  // writing a fresh active one over it would silently undo a lock.
  const r = await readFreshJson<ProctorSession>(BUCKET, sessKey(uid, attemptId));
  if (!r.ok) throw new Error("Could not read the proctor session.");
  const existing = r.data;
  if (existing) {
    // A super-admin unlock grants ONE fresh sit: reset to active, keeping the
    // same id. Locked/cancelled/submitted sessions are frozen (never resurrected
    // by a client 'start'); an active one is returned as-is (idempotent).
    if (existing.status === "unlocked") {
      const reset: ProctorSession = {
        ...existing,
        meta: init.meta, integrity: init.integrity, kind: init.kind,
        cameraConsent: init.cameraConsent,
        startedAt: Date.now(), endedAt: null, status: "active",
        lockedReason: null, events: [], snapshots: [], unlockRequest: null, unlock: null,
      };
      await writeJson(sessKey(uid, attemptId), reset);
      return reset;
    }
    return existing;
  }
  const s: ProctorSession = {
    attemptId, uid,
    studentName: init.studentName, studentEmail: init.studentEmail,
    kind: init.kind, integrity: init.integrity, meta: init.meta,
    startedAt: Date.now(), endedAt: null, status: "active",
    cameraConsent: init.cameraConsent, lockedReason: null,
    events: [], snapshots: [], unlockRequest: null, unlock: null,
  };
  await writeJson(sessKey(uid, attemptId), s);
  return s;
}

async function upsertLock(entry: LockEntry): Promise<void> {
  await updateLocks((idx) => { idx[`${entry.uid}:${entry.attemptId}`] = entry; return true; });
}

/**
 * Append forensic events. Once a session is locked / cancelled / submitted /
 * unlocked its STATUS is frozen: a trailing event can neither re-open a locked
 * test nor turn a submitted one into a lock. Events on a submitted session are
 * still recorded (forensic trail); on a locked / cancelled one they are dropped
 * as before. Returns the session (or null if it doesn't exist).
 */
export async function appendEvents(uid: string, attemptId: string, events: ProctorEvent[]): Promise<ProctorSession | null> {
  const s = await getSession(uid, attemptId);
  if (!s) return null;
  if (s.status === "locked" || s.status === "cancelled") return s; // frozen
  s.events.push(...events.slice(0, 200));
  if (s.events.length > 2000) s.events = s.events.slice(-2000);
  const terminal = FROZEN.includes(s.status) ? undefined : events.find((e) => e.terminal);
  if (terminal) {
    // Strict tests LOCK (need super-admin unlock); standard drills just cancel.
    s.status = s.integrity === "strict" ? "locked" : "cancelled";
    s.lockedReason = terminal.reason;
    s.endedAt = Date.now();
  }
  // Write straight after the read (no network in between) to keep the
  // read-modify-write window as small as Storage-as-DB allows; the lock queue
  // entry follows the session, so the queue never lists a lock that isn't one.
  await writeJson(sessKey(uid, attemptId), s);
  if (terminal && s.status === "locked") {
    await upsertLock({
      uid, attemptId, studentName: s.studentName, studentEmail: s.studentEmail,
      title: s.meta.title, lockedReason: terminal.reason, at: Date.now(),
      status: "locked", unlockRequestedAt: null,
    });
  }
  return s;
}

/** Store one violation snapshot (base64 JPEG data URL). Returns the object path. */
export async function saveSnapshot(uid: string, attemptId: string, dataUrl: string, reason: string): Promise<string | null> {
  if (!await getSession(uid, attemptId)) return null;
  const m = /^data:image\/(jpe?g|png|webp);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 1_500_000) return null; // cap ~1.5MB per still
  const ts = Date.now();
  const path = snapKey(uid, attemptId, ts);
  try {
    const { error } = await createAdminClient().storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType: "image/jpeg", cacheControl: "0" });
    if (error) return null;
  } catch {
    return null;
  }
  // The image upload takes a while, and the terminal event that triggered this
  // still usually lands meanwhile. Re-read NOW and merge only the snapshot
  // list, so this write never carries a stale "active" back over "locked".
  const fresh = await getSession(uid, attemptId);
  if (!fresh) return null;
  fresh.snapshots = [...(fresh.snapshots || []), { path, at: ts, reason }].slice(-40);
  await writeJson(sessKey(uid, attemptId), fresh);
  return path;
}

export async function endSession(uid: string, attemptId: string, status: ProctorStatus, reason?: string): Promise<void> {
  const s = await getSession(uid, attemptId);
  if (!s) return;
  if (FROZEN.includes(s.status)) return; // don't override a terminal / closed state
  s.status = status;
  s.endedAt = Date.now();
  if (reason) s.lockedReason = reason;
  await writeJson(sessKey(uid, attemptId), s);
}

export async function requestUnlock(uid: string, attemptId: string, note: string): Promise<boolean> {
  const s = await getSession(uid, attemptId);
  if (!s || s.status !== "locked") return false;
  s.unlockRequest = { at: Date.now(), note: (note || "").slice(0, 1000) };
  await writeJson(sessKey(uid, attemptId), s);
  const k = `${uid}:${attemptId}`;
  await updateLocks((idx) => { if (!idx[k]) return false; idx[k].unlockRequestedAt = Date.now(); return true; });
  return true;
}

/** Super-admin: list locks, newest first. */
export async function listLocks(): Promise<LockEntry[]> {
  const idx = (await readJson<Record<string, LockEntry>>(LOCKS_KEY)) || {};
  return Object.values(idx).sort((a, b) => b.at - a.at);
}

/** Super-admin: unlock a test so the student may re-sit. */
export async function unlockTest(uid: string, attemptId: string, by: string, byName: string, note: string): Promise<boolean> {
  const s = await getSession(uid, attemptId);
  if (!s) return false;
  s.status = "unlocked";
  s.unlock = { by, byName, at: Date.now(), note: (note || "").slice(0, 1000) };
  await writeJson(sessKey(uid, attemptId), s);
  const k = `${uid}:${attemptId}`;
  await updateLocks((idx) => { if (!idx[k]) return false; idx[k].status = "unlocked"; return true; });
  return true;
}

/** Signed URLs for a session's snapshots (super-admin review). */
export async function signSnapshots(session: ProctorSession, expiresSec = 3600): Promise<{ url: string; at: number; reason: string }[]> {
  const out: { url: string; at: number; reason: string }[] = [];
  const sb = createAdminClient();
  for (const snap of session.snapshots) {
    try {
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(snap.path, expiresSec);
      if (data?.signedUrl) out.push({ url: data.signedUrl, at: snap.at, reason: snap.reason });
    } catch { /* skip */ }
  }
  return out;
}
