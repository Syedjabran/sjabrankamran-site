import { SITE_URL } from '../config';
import { sessionCookieHeader, type Session } from '../auth/session';

/**
 * Supplies the current session and, when it is stale, a refreshed one. The
 * AuthProvider installs this on mount so the client can be called from
 * anywhere (including react-query) without threading the session through.
 */
type SessionAccessor = () => Promise<Session | null>;

let getSession: SessionAccessor = async () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(accessor: SessionAccessor, unauthorized: () => void) {
  getSession = accessor;
  onUnauthorized = unauthorized;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/**
 * Calls a portal API route as the signed-in user.
 *
 * Sends the session BOTH ways on purpose:
 *  - `Cookie:` is what the deployed site reads today (its routes resolve the
 *    user via @supabase/ssr over next/headers).
 *  - `Authorization: Bearer` is what the pending `feat/mobile-bearer-auth` PR
 *    adds. Sending both means the app keeps working before the PR lands and
 *    upgrades to the cleaner path automatically once it is merged.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  if (!session) {
    onUnauthorized();
    throw new ApiError(401, 'Sign in required.');
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    cookie: sessionCookieHeader(session),
    authorization: `Bearer ${session.access_token}`,
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.body && !headers['content-type']) headers['content-type'] = 'application/json';

  const res = await fetch(SITE_URL + path, { ...init, headers });

  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body means we were served an HTML error/redirect page.
    throw new ApiError(res.status, 'The server returned an unexpected response.');
  }

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status}).`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

/** URL for a WebView screen, e.g. webUrl('/portal/exam-lab'). */
export function webUrl(path: string): string {
  return SITE_URL + path;
}
