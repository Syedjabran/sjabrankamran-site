/**
 * Practical Lab attempts: the server secret, the signed attempt token and the
 * per-student attempt record. SERVER-ONLY.
 *
 * An attempt is (student, practical, attempt number). Its number lives in
 * portal-data/lab-attempts/<uid>.json, so reloading the room -- on any
 * device -- resumes the same apparatus, and "fresh" starts the next number.
 * The room holds a token naming its attempt, signed with LAB_SECRET; the lab
 * API accepts a token only from the student it was issued to. Everything
 * hidden about the attempt (its parameter values, its random streams) is
 * derived from LAB_SECRET and never leaves the server.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";

const DEV_SECRET = "practical-lab-development-secret-not-for-production";
let devSecretWarned = false;

/**
 * LAB_SECRET, or none. In production a missing or short secret means the lab
 * API refuses (fails closed); in development a fixed secret is used so the
 * lab works locally, with a warning.
 */
export function labSecret(): string | null {
  const secret = process.env.LAB_SECRET?.trim() ?? "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") return null;
  if (!devSecretWarned) {
    devSecretWarned = true;
    console.warn("LAB_SECRET is not set (or shorter than 32 characters): the Practical Lab uses a fixed development secret.");
  }
  return DEV_SECRET;
}

export type AttemptClaims = { uid: string; experiment: string; n: number; issuedAt: number };

const b64url = (buf: Buffer) => buf.toString("base64url");
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(`lab-attempt|v1|${body}`).digest();

/** A signed token naming one attempt: v1.<claims>.<signature>. */
export function signAttempt(secret: string, claims: AttemptClaims): string {
  const body = b64url(Buffer.from(JSON.stringify({ u: claims.uid, e: claims.experiment, n: claims.n, i: claims.issuedAt })));
  return `v1.${body}.${b64url(sign(secret, body))}`;
}

/** The claims of a token this server signed, or null (malformed, forged or
 *  signed with another secret). */
export function readAttempt(secret: string, token: unknown): AttemptClaims | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, body, mac] = parts;
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  const expected = sign(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { u, e, n, i } = raw as Record<string, unknown>;
  if (typeof u !== "string" || typeof e !== "string" || !Number.isInteger(n) || (n as number) < 1 || typeof i !== "number") return null;
  return { uid: u, experiment: e, n: n as number, issuedAt: i };
}

/** The key an attempt's random streams are derived from. */
export function attemptKey(secret: string, claims: Pick<AttemptClaims, "uid" | "experiment" | "n">): Buffer {
  return createHmac("sha256", secret).update(`lab-attempt-key|${claims.uid}|${claims.experiment}|${claims.n}`).digest();
}

// --- the attempts record ----------------------------------------------------------

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const HISTORY_CAP = 20;

type AttemptEntry = { n: number; at: string; history: { n: number; at: string }[] };
type AttemptsDoc = { version: 1; experiments: Record<string, AttemptEntry> };

export const attemptsPath = (uid: string) => `lab-attempts/${uid}.json`;

function entryOf(raw: unknown): AttemptEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const { n, at, history } = raw as Record<string, unknown>;
  if (!Number.isInteger(n) || (n as number) < 1 || typeof at !== "string") return null;
  const rows = Array.isArray(history) ? history.filter((h): h is { n: number; at: string } =>
    !!h && typeof h === "object" && Number.isInteger((h as { n?: unknown }).n) && typeof (h as { at?: unknown }).at === "string") : [];
  return { n: n as number, at, history: rows.slice(-HISTORY_CAP) };
}

/**
 * The attempt number a student is on for a practical: the current one, or
 * the next one when `fresh` (or when they have none yet), which is recorded
 * first. Fails closed: null when the record can't be read or written.
 */
export async function openAttempt(uid: string, experiment: string, fresh: boolean, now = new Date()): Promise<number | null> {
  if (!SAFE_UID.test(uid)) return null;
  const read = await readFreshJson<unknown>(BUCKET, attemptsPath(uid));
  if (!read.ok) return null;
  const raw = read.data;
  const experiments: Record<string, AttemptEntry> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const stored = (raw as { experiments?: unknown }).experiments;
    if (stored && typeof stored === "object") {
      for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
        const entry = entryOf(value);
        if (entry) experiments[id] = entry;
      }
    }
  } else if (raw != null) {
    return null;
  }
  const current = experiments[experiment];
  if (current && !fresh) return current.n;
  const n = (current?.n ?? 0) + 1;
  const at = now.toISOString();
  experiments[experiment] = { n, at, history: [...(current?.history ?? []), { n, at }].slice(-HISTORY_CAP) };
  const doc: AttemptsDoc = { version: 1, experiments };
  return (await writeFreshJson(BUCKET, attemptsPath(uid), doc)) ? n : null;
}
