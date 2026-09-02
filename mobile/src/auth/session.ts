import * as SecureStore from 'expo-secure-store';
import { PROJECT_REF, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/** The session shape auth-js persists (and that @supabase/ssr re-reads). */
export type Session = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

const STORE_KEY = 'sj.session';
/** Matches @supabase/ssr's MAX_CHUNK_SIZE — cookies larger than this are split. */
const MAX_CHUNK_SIZE = 3180;
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;

/** base64url, the encoding @supabase/ssr uses behind its `base64-` prefix. */
function toBase64Url(input: string): string {
  // `global.btoa` is unavailable in Hermes, so encode via a manual table.
  const bytes = utf8Bytes(input);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += chars[b2 & 63];
  }
  return out;
}

function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // surrogate pair
      const next = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (next & 0x3ff);
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f)
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

/**
 * Renders a session as the cookie pairs @supabase/ssr expects on the server.
 *
 * The portal's API routes read their session from cookies (createServerClient
 * over next/headers), so a mobile client must present the session in exactly
 * that form: `base64-` + base64url(JSON), split into `.0`, `.1`, … chunks once
 * it exceeds MAX_CHUNK_SIZE.
 */
export function sessionCookiePairs(session: Session): Array<[string, string]> {
  const value = 'base64-' + toBase64Url(JSON.stringify(session));
  if (value.length <= MAX_CHUNK_SIZE) return [[COOKIE_KEY, value]];
  const pairs: Array<[string, string]> = [];
  for (let i = 0, n = 0; i < value.length; i += MAX_CHUNK_SIZE, n++) {
    pairs.push([`${COOKIE_KEY}.${n}`, value.slice(i, i + MAX_CHUNK_SIZE)]);
  }
  return pairs;
}

/** The `Cookie:` request header carrying the session. */
export function sessionCookieHeader(session: Session): string {
  return sessionCookiePairs(session)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ---------------------------------------------------------------- auth calls

type AuthResult = { session: Session } | { error: string };

/** Sign in with email + password against Supabase GoTrue. */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const body = await res.json();
    if (!res.ok) {
      // Mirror the website's wording for the one error users actually hit.
      const msg = String(body?.msg ?? body?.error_description ?? '');
      return {
        error:
          msg === 'Invalid login credentials'
            ? 'Incorrect email or password. Please try again.'
            : msg || 'Something went wrong. Please try again.',
      };
    }
    return { session: normalise(body) };
  } catch {
    return { error: 'Could not reach the server. Check your connection.' };
  }
}

/** Exchange a refresh token for a fresh session. */
export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const body = await res.json();
    if (!res.ok) return { error: String(body?.msg ?? 'Session expired.') };
    return { session: normalise(body) };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

/** GoTrue omits expires_at on some responses; auth-js always stores one. */
function normalise(body: Record<string, unknown>): Session {
  const expiresIn = Number(body.expires_in ?? 3600);
  return {
    access_token: String(body.access_token),
    token_type: String(body.token_type ?? 'bearer'),
    expires_in: expiresIn,
    expires_at: Number(body.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn),
    refresh_token: String(body.refresh_token),
    user: body.user as Session['user'],
  };
}

// ------------------------------------------------------------- persistence

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY);
}

/** True when the access token is expired or within 60s of expiring. */
export function isExpiring(session: Session): boolean {
  return session.expires_at - 60 <= Math.floor(Date.now() / 1000);
}

/** Ask the portal to email a password-reset link (its own mail relay). */
export async function requestPasswordReset(email: string): Promise<string> {
  const { SITE_URL } = await import('../config');
  const res = await fetch(`${SITE_URL}/api/portal/forgot-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), origin: SITE_URL }),
  });
  const body = await res.json().catch(() => ({}) as Record<string, string>);
  return (
    body.message ??
    'If an account exists for that email, a password-reset link is on its way. Check your inbox (and spam).'
  );
}
