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

const BUCKET = "portal-data";
const LOCKS_KEY = "proctor/_locks.json";
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

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await createAdminClient().storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify(value)], { type: "application/json" });
    const { error } = await createAdminClient().storage
      .from(BUCKET)
      .upload(key, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch {
    return false;
  }
}

export async function getSession(uid: string, attemptId: string): Promise<ProctorSession | null> {
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
  const existing = await getSession(uid, attemptId);
  if (existing) return existing; // idempotent — never resurrect a locked attempt
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
  const idx = (await readJson<Record<string, LockEntry>>(LOCKS_KEY)) || {};
  idx[`${entry.uid}:${entry.attemptId}`] = entry;
  await writeJson(LOCKS_KEY, idx);
}

/**
 * Append forensic events. If the session is already terminal it is left as-is
 * (a locked test cannot be silently re-opened by more client posts). Returns the
 * updated session (or null if it doesn't exist / is closed).
 */
export async function appendEvents(uid: string, attemptId: string, events: ProctorEvent[]): Promise<ProctorSession | null> {
  const s = await getSession(uid, attemptId);
  if (!s) return null;
  if (s.status === "locked" || s.status === "cancelled") return s; // frozen
  s.events.push(...events.slice(0, 200));
  if (s.events.length > 2000) s.events = s.events.slice(-2000);
  const terminal = events.find((e) => e.terminal);
  if (terminal) {
    // Strict tests LOCK (need super-admin unlock); standard drills just cancel.
    s.status = s.integrity === "strict" ? "locked" : "cancelled";
    s.lockedReason = terminal.reason;
    s.endedAt = Date.now();
    if (s.status === "locked") {
      await upsertLock({
        uid, attemptId, studentName: s.studentName, studentEmail: s.studentEmail,
        title: s.meta.title, lockedReason: terminal.reason, at: Date.now(),
        status: "locked", unlockRequestedAt: null,
      });
    }
  }
  await writeJson(sessKey(uid, attemptId), s);
  return s;
}

/** Store one violation snapshot (base64 JPEG data URL). Returns the object path. */
export async function saveSnapshot(uid: string, attemptId: string, dataUrl: string, reason: string): Promise<string | null> {
  const s = await getSession(uid, attemptId);
  if (!s) return null;
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
  s.snapshots.push({ path, at: ts, reason });
  if (s.snapshots.length > 40) s.snapshots = s.snapshots.slice(-40);
  await writeJson(sessKey(uid, attemptId), s);
  return path;
}

export async function endSession(uid: string, attemptId: string, status: ProctorStatus, reason?: string): Promise<void> {
  const s = await getSession(uid, attemptId);
  if (!s) return;
  if (s.status === "locked" || s.status === "cancelled") return; // don't override a terminal state
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
  const idx = (await readJson<Record<string, LockEntry>>(LOCKS_KEY)) || {};
  const k = `${uid}:${attemptId}`;
  if (idx[k]) { idx[k].unlockRequestedAt = Date.now(); await writeJson(LOCKS_KEY, idx); }
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
  const idx = (await readJson<Record<string, LockEntry>>(LOCKS_KEY)) || {};
  const k = `${uid}:${attemptId}`;
  if (idx[k]) { idx[k].status = "unlocked"; await writeJson(LOCKS_KEY, idx); }
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
