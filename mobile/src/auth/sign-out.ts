/**
 * Signing out, so the next person on the same phone starts clean. Pure (no
 * React Native imports) so plain Node tests run it; AuthProvider supplies
 * the real steps (src/auth/context.tsx).
 *
 * A phone is often shared (a parent and a student), so signing out must
 * leave nothing of the account behind: not the session in memory, not the
 * data cache (the navigation every menu is drawn from, the profile, tasks,
 * notifications), not the stored tokens -- and not the session itself: it
 * is ended on the server too, so a copy the WebView still holds in a cookie
 * is refused by the portal instead of opening the previous account.
 */

/** The parts of a session sign-out needs. */
export type SignedInSession = { access_token: string; refresh_token: string };

export type SignOutSteps<S extends SignedInSession = SignedInSession> = {
  /** Drop the session from memory: the app shows the sign-in screen at once. */
  forget: () => void;
  /** Empty the data cache. */
  clearCache: () => void;
  /** Delete the stored tokens. */
  clearStored: () => Promise<void>;
  /** End the session on the server. Best effort: never waited for. */
  revoke: (session: S) => Promise<unknown>;
};

/**
 * Signs out, in order: forget the session, empty the cache, delete the
 * stored tokens (a failure there still leaves the app signed out), then
 * end the session on the server in the background -- sign-out never waits
 * on the network, and a failed or slow revoke never undoes it.
 */
export async function signOutInOrder<S extends SignedInSession>(session: S | null, steps: SignOutSteps<S>): Promise<void> {
  steps.forget();
  steps.clearCache();
  try {
    await steps.clearStored();
  } catch {
    // The in-memory session is already gone; the stored copy is overwritten at the next sign-in.
  }
  if (session) {
    void Promise.resolve()
      .then(() => steps.revoke(session))
      .catch(() => undefined);
  }
}

/**
 * The GoTrue request that ends this one session on the server.
 * `scope=local`: the user's other devices (their browser) stay signed in.
 */
export function logoutRequest(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
): { url: string; init: { method: 'POST'; headers: Record<string, string> } } {
  return {
    url: `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/logout?scope=local`,
    init: { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  };
}
