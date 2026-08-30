/**
 * Google OAuth (user-delegated) for physics@sjabrankamran.com. SERVER-ONLY.
 *
 * Connects Google Drive + Google Classroom using a long-lived refresh token.
 * No heavyweight SDK — we mint access tokens against the OAuth token endpoint
 * and call the REST APIs with fetch.
 *
 * Required env (set in Vercel):
 *   GOOGLE_CLIENT_ID       OAuth 2.0 client id (Desktop/Web app)
 *   GOOGLE_CLIENT_SECRET   OAuth 2.0 client secret
 *   GOOGLE_REFRESH_TOKEN   refresh token for physics@sjabrankamran.com
 * Optional:
 *   GOOGLE_ACCOUNT_EMAIL   display-only label of the connected account
 */

let cachedToken: { token: string; exp: number } | null = null;

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

export function connectedEmail(): string | null {
  return process.env.GOOGLE_ACCOUNT_EMAIL || null;
}

/** Mint (and cache) an access token from the stored refresh token. */
export async function getAccessToken(): Promise<string> {
  if (!googleConfigured()) throw new Error("Google is not connected. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN.");
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
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
