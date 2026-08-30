/**
 * Google OAuth (user-delegated) for physics@sjabrankamran.com. SERVER-ONLY.
 *
 * Connects Google Drive + Google Classroom using a long-lived refresh token.
 * No heavyweight SDK — we mint access tokens against the OAuth token endpoint
 * and call the REST APIs with fetch.
 *
 * Credentials are read from EITHER:
 *   (a) a private Supabase storage secret  portal-data/secrets/google.json
 *       { client_id, client_secret, refresh_token, account_email? }   ← preferred
 *   (b) env vars GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
 *
 * The storage path lets the operator provision the connection without pasting a
 * very long refresh token into the hosting dashboard.
 */
import { createAdminClient } from "@/lib/supabase/admin";

type Creds = { client_id: string; client_secret: string; refresh_token: string; account_email?: string };

let cachedToken: { token: string; exp: number } | null = null;
let cachedCreds: { creds: Creds | null; at: number } | null = null;
const CREDS_TTL = 300_000; // 5 min

async function loadCreds(): Promise<Creds | null> {
  if (cachedCreds && Date.now() - cachedCreds.at < CREDS_TTL) return cachedCreds.creds;
  let creds: Creds | null = null;
  // (a) Supabase storage secret (authoritative when present).
  try {
    const { data } = await createAdminClient().storage.from("portal-data").download("secrets/google.json");
    if (data) {
      const j = JSON.parse(await data.text()) as Partial<Creds>;
      if (j.client_id && j.client_secret && j.refresh_token) {
        creds = { client_id: j.client_id, client_secret: j.client_secret, refresh_token: j.refresh_token, account_email: j.account_email };
      }
    }
  } catch { /* fall through to env */ }
  // (b) env fallback.
  if (!creds && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    creds = {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      account_email: process.env.GOOGLE_ACCOUNT_EMAIL,
    };
  }
  cachedCreds = { creds, at: Date.now() };
  return creds;
}

/** Is a Google connection provisioned? (async: may read the storage secret) */
export async function googleReady(): Promise<boolean> {
  return (await loadCreds()) !== null;
}

/** Display-only label of the connected account, if known. */
export async function connectedEmail(): Promise<string | null> {
  const c = await loadCreds();
  return c?.account_email || process.env.GOOGLE_ACCOUNT_EMAIL || null;
}

/** Mint (and cache) an access token from the stored refresh token. */
export async function getAccessToken(): Promise<string> {
  const creds = await loadCreds();
  if (!creds) throw new Error("Google is not connected. Provision credentials (storage secret or env).");
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(`Google token exchange failed: ${j.error_description || j.error || r.status}`);
  }
  cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in ? j.expires_in * 1000 : 3_500_000) };
  return j.access_token;
}

/** Authenticated GET against a Google REST endpoint, returns parsed JSON. */
export async function googleGet<T = unknown>(url: string): Promise<T> {
  const token = await getAccessToken();
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = (j as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`;
    throw new Error(`Google API: ${err}`);
  }
  return j as T;
}
