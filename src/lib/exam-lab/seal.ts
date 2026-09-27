// src/lib/exam-lab/seal.ts
//
// Pure token primitives for the Exam Lab answer-security rules (Node-testable;
// the key comes from the caller -- exam-lab/keys.ts reads it from the
// environment on the server).
//
//  - signToken / verifyToken: a readable payload plus an HMAC-SHA256 tag. For
//    facts the browser may see but must not change: which questions a sitting
//    holds, whether help is allowed, what Maxwell awarded for an answer.
//  - sealJson / openSealed: AES-256-GCM. For facts the browser must not READ:
//    the answers of a generated practice set, handed back only on submission.
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const b64u = (buf: Buffer) => buf.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");
const B64U_RE = /^[A-Za-z0-9_-]+$/;

/** A 32-byte key for one purpose (`label`), derived from a server secret. */
export function deriveKey(secret: string, label: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "sjak-exam-lab", label, 32));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function tag(body: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(body).digest();
}

/** `<base64url JSON>.<base64url HMAC>`. The payload is readable, not secret. */
export function signToken(payload: unknown, key: Buffer): string {
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${b64u(tag(body, key))}`;
}

/** The payload of a token signed with `key`, or null for anything else
 *  (tampered, truncated, signed with another key, not JSON). */
export function verifyToken<T>(token: unknown, key: Buffer): T | null {
  if (typeof token !== "string" || token.length > 20_000) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!B64U_RE.test(body) || !B64U_RE.test(sig)) return null;
  const want = tag(body, key);
  const got = unb64u(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(unb64u(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Encrypts `payload` (AES-256-GCM, random IV): `<base64url iv|tag|ciphertext>`. */
export function sealJson(payload: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return b64u(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

/** The payload sealed with `key`, or null for anything else. */
export function openSealed<T>(sealed: unknown, key: Buffer): T | null {
  if (typeof sealed !== "string" || sealed.length > 400_000 || !B64U_RE.test(sealed)) return null;
  const raw = unb64u(sealed);
  if (raw.length < 12 + 16 + 1) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(pt.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** A random id for a sitting / set (not a secret, just unique). */
export function newSealId(): string {
  return b64u(randomBytes(12));
}
