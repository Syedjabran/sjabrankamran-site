import { cookies } from "next/headers";

/** Cookie the mobile app writes into its WebView before the first paint. */
export const PORTAL_CLIENT_COOKIE = "portal_client";
export const PORTAL_CLIENT_APP = "app";

/**
 * True when this request is being rendered inside the mobile app's WebView.
 *
 * The app already supplies its own title bar, back/reload controls and a full
 * role-aware menu, so repeating the portal's header and sidebar inside the
 * WebView is pure duplication — the user has to scroll past a second copy of
 * the navigation to reach the page they opened.
 *
 * A cookie is used rather than a query string or a custom User-Agent because
 * it survives in-page navigation (the user tapping a link inside the WebView)
 * and is readable during SSR, so the chrome is never rendered and then hidden.
 */
export async function isEmbeddedClient(): Promise<boolean> {
  const store = await cookies();
  return store.get(PORTAL_CLIENT_COOKIE)?.value === PORTAL_CLIENT_APP;
}
