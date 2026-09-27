/**
 * Which credential a portal request authenticates with. Pure and edge-safe:
 * shared by the middleware (access-lock gate) and the server Supabase client /
 * getPortalUser(), so all three always agree on who the caller is.
 *
 * The website (and the mobile app, which sends both) authenticates with the
 * Supabase session cookie. A native client that sends no session cookie may
 * authenticate with `Authorization: Bearer <access_token>` instead.
 */

/** @supabase/ssr session cookies: `sb-<ref>-auth-token` and its `.0`/`.1` chunks. */
export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

// A Supabase access token is a JWT: three base64url segments.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * The access token from an `Authorization: Bearer <token>` header, or null.
 * Only a JWT-shaped token counts: other bearer values this app receives (Vercel
 * sends `Bearer ${CRON_SECRET}` to the cron routes) are never Supabase sessions
 * and must not be forwarded to Supabase.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  return JWT_SHAPE.test(match[1]) ? match[1] : null;
}

/**
 * The bearer token to authenticate with, or null. A Supabase session cookie
 * always wins: the bearer is used only when no session cookie was sent, so a
 * request can never resolve to one user for the role/access checks and another
 * for row-level security.
 */
export function sessionBearer(
  authorization: string | null | undefined,
  cookieNames: readonly string[],
): string | null {
  if (cookieNames.some(isSupabaseAuthCookieName)) return null;
  return parseBearerToken(authorization);
}
