/**
 * Practical Lab attempts: the server secret, the signed attempt token and the
 * per-student attempt record. SERVER-ONLY.
 *
 * An attempt is (student, practical, attempt number). Its number lives in
 * portal-data/lab-attempts/<uid>.json, so reloading the room -- on any
 * device -- resumes the same apparatus, and "fresh" starts the next number.
 * The room holds a token naming its attempt, signed with LAB_SECRET; the lab
 * API accepts a token only from the student it was issued to, only for 12
 * hours (the room renews it quietly), and only while it names the student's
 * current attempt -- after a fresh attempt the old one is closed. Everything
 * hidden about the attempt (its parameter values, its random streams) is
 * derived from LAB_SECRET and never leaves the server.
 */
import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";

const DEV_SECRET = "practical-lab-development-secret-not-for-production";
let devSecretWarned = false;

/**
 * LAB_SECRET, or none. A missing or short secret means the lab API refuses
 * (fails closed) -- except under `next dev` (NODE_ENV=development), where a
 * fixed secret is used so the lab works locally, with a warning.
 */
export function labSecret(): string | null {
  const secret = process.env.LAB_SECRET?.trim() ?? "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "development") return null;
  if (!devSecretWarned) {
    devSecretWarned = true;
    console.warn("LAB_SECRET is not set (or shorter than 32 characters): the Practical Lab uses a fixed development secret.");
  }
  return DEV_SECRET;
}

export type AttemptClaims = { uid: string; experiment: string; n: number; issuedAt: number };

/** How long a token is accepted after it was issued; the room renews it
 *  (resuming the same attempt) when the lab says it has expired. */
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(`lab-attempt|v1|${body}`).digest();

/** A signed token naming one attempt: v1.<claims>.<signature>. */
export function signAttempt(secret: string, claims: AttemptClaims): string {
  const body = b64url(Buffer.from(JSON.stringify({ u: claims.uid, e: claims.experiment, n: claims.n, i: claims.issuedAt })));
  return `v1.${body}.${b64url(sign(secret, body))}`;
}

/** The claims of a token this server signed, or null (malformed, forged or
 *  signed with another secret). Expiry and currency are checked by the caller
 *  (tokenExpired, currentAttempt). */
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

/** Issued more than TOKEN_TTL_MS ago (or more than a minute in the future). */
export function tokenExpired(claims: AttemptClaims, now = Date.now()): boolean {
  return !(claims.issuedAt <= now + 60_000 && now - claims.issuedAt <= TOKEN_TTL_MS);
}

/** The key an attempt's random streams are derived from. */
export function attemptKey(secret: string, claims: Pick<AttemptClaims, "uid" | "experiment" | "n">): Buffer {
  return createHmac("sha256", secret).update(`lab-attempt-key|${claims.uid}|${claims.experiment}|${claims.n}`).digest();
}

// --- the attempts record ----------------------------------------------------------

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const HISTORY_CAP = 20;
const WRITE_TRIES = 3;

type AttemptEntry = { n: number; at: string; id: string; history: { n: number; at: string }[] };
type AttemptsDoc = { version: 1; experiments: Record<string, AttemptEntry> };

export const attemptsPath = (uid: string) => `lab-attempts/${uid}.json`;

function entryOf(raw: unknown): AttemptEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const { n, at, id, history } = raw as Record<string, unknown>;
  if (!Number.isInteger(n) || (n as number) < 1 || typeof at !== "string") return null;
  const rows = Array.isArray(history) ? history.filter((h): h is { n: number; at: string } =>
    !!h && typeof h === "object" && Number.isInteger((h as { n?: unknown }).n) && typeof (h as { at?: unknown }).at === "string") : [];
  return { n: n as number, at, id: typeof id === "string" ? id : "", history: rows.slice(-HISTORY_CAP) };
}

/** The stored record's entries, or null when it can't be read (or isn't a record). */
async function readEntries(uid: string): Promise<Record<string, AttemptEntry> | null> {
  const read = await readFreshJson<unknown>(BUCKET, attemptsPath(uid));
  if (!read.ok) return null;
  const raw = read.data;
  const experiments: Record<string, AttemptEntry> = {};
  if (raw == null) return experiments;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = (raw as { experiments?: unknown }).experiments;
  if (stored && typeof stored === "object") {
    for (const [experiment, value] of Object.entries(stored as Record<string, unknown>)) {
      const entry = entryOf(value);
      if (entry) experiments[experiment] = entry;
    }
  }
  return experiments;
}

/** Each student's current attempt number per practical, as this server
 *  instance last saw it; re-read at most every 30 s. */
const CURRENT_TTL_MS = 30_000;
const currentCache = new Map<string, { n: number | null; until: number }>();
const cacheKey = (uid: string, experiment: string) => `${uid}|${experiment}`;

/** Tests only. */
export function resetAttemptCache(): void {
  currentCache.clear();
}

/**
 * The attempt number a student is on for a practical: the current one, or
 * the next one when `fresh` (or when they have none yet). A new number is
 * written and then read back. If another request (a second tab, another
 * practical opened at the same moment) wrote in between and ours isn't
 * there, the read-modify-write is done again on the newer record, up to
 * three times. Fails closed: null when the record can't be read, written or
 * confirmed.
 */
export async function openAttempt(uid: string, experiment: string, fresh: boolean, now = new Date()): Promise<number | null> {
  if (!SAFE_UID.test(uid)) return null;
  for (let tries = 0; tries < WRITE_TRIES; tries++) {
    const experiments = await readEntries(uid);
    if (!experiments) return null;
    const current = experiments[experiment];
    if (current && !fresh) {
      currentCache.set(cacheKey(uid, experiment), { n: current.n, until: Date.now() + CURRENT_TTL_MS });
      return current.n;
    }
    const n = (current?.n ?? 0) + 1;
    const at = now.toISOString();
    const id = randomUUID();
    experiments[experiment] = { n, at, id, history: [...(current?.history ?? []), { n, at }].slice(-HISTORY_CAP) };
    const doc: AttemptsDoc = { version: 1, experiments };
    if (!(await writeFreshJson(BUCKET, attemptsPath(uid), doc))) return null;
    const check = await readEntries(uid);
    if (!check) return null;
    if (check[experiment]?.id === id) {
      currentCache.set(cacheKey(uid, experiment), { n, until: Date.now() + CURRENT_TTL_MS });
      return n;
    }
    // Another write landed on top of ours: build on it. A "fresh" that another
    // fresh already advanced still moves on to the next number.
  }
  return null;
}

/**
 * The student's current attempt number for a practical (null when they have
 * none), cached for 30 s per server instance. Throws when the record can't be
 * read, so the caller refuses rather than guessing.
 */
export async function currentAttempt(uid: string, experiment: string): Promise<number | null> {
  const key = cacheKey(uid, experiment);
  const cached = currentCache.get(key);
  if (cached && cached.until > Date.now()) return cached.n;
  if (!SAFE_UID.test(uid)) return null;
  const experiments = await readEntries(uid);
  if (!experiments) throw new Error("The attempts record couldn't be read.");
  const n = experiments[experiment]?.n ?? null;
  const now = Date.now();
  currentCache.set(key, { n, until: now + CURRENT_TTL_MS });
  if (currentCache.size > 20_000) for (const [k, v] of currentCache) if (v.until <= now) currentCache.delete(k);
  return n;
}
