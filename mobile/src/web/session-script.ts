/**
 * How the signed-in WebView presents the portal session. Pure (no React
 * Native imports) so plain Node tests run it.
 *
 * Android applies a WebView's request headers to the first request only, so
 * the session goes two ways: a `Cookie` header on the first load, and a
 * script that writes the same cookies into the page before its own scripts
 * run, so every later navigation inside the portal stays signed in. The
 * script also writes the app marker (`portal_client=app`) the portal reads to
 * hide its own chrome inside the app.
 *
 * Both are for the portal's exact origin only:
 * - the cookies are host-only (no `Domain`), so the engine sends them to the
 *   portal's host alone -- never to a sibling subdomain -- and `Secure` on an
 *   https portal;
 * - the script checks the page's own origin before it writes anything: the
 *   platform may run an injected script on any page the WebView shows (a new
 *   window, a redirect), and the session must never be written anywhere else.
 */
import type { Origin } from './portal-url';

export type CookiePair = readonly [name: string, value: string];

/** A cookie name or value the header and the script may carry verbatim. */
const COOKIE_TOKEN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

function checked(pairs: readonly CookiePair[]): CookiePair[] {
  return pairs.filter(([name, value]) => COOKIE_TOKEN.test(name) && COOKIE_TOKEN.test(value));
}

/** The `Cookie` request header for the first load of a portal page. */
export function cookieHeader(pairs: readonly CookiePair[]): string {
  return checked(pairs).map(([name, value]) => `${name}=${value}`).join('; ');
}

/** One `document.cookie` assignment: host-only, whole site, Lax. */
function cookieString(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * The script injected before a portal page's content loads. It writes each
 * `[name, value, maxAgeSeconds]` cookie, and only when the page is the
 * portal's own origin (scheme, host and port).
 */
export function sessionCookieScript(
  site: Origin,
  cookies: readonly (readonly [name: string, value: string, maxAge: number])[]
): string {
  const expected = `${site.scheme}:|${site.host}|${site.port}`;
  const secure = site.scheme === 'https';
  const writes = cookies
    .filter(([name, value, maxAge]) => COOKIE_TOKEN.test(name) && COOKIE_TOKEN.test(value) && Number.isInteger(maxAge) && maxAge > 0)
    .map(([name, value, maxAge]) => `document.cookie=${JSON.stringify(cookieString(name, value, maxAge, secure))};`)
    .join('');
  // `location` can't be replaced by a page, and the check calls no method a
  // page could have swapped. location.hostname is already lower case, and
  // location.port is '' for the scheme's default port, as Origin.port is.
  return (
    `(function(){try{` +
    `if(location.protocol+'|'+location.hostname+'|'+location.port!==${JSON.stringify(expected)})return;` +
    writes +
    `}catch(e){}})();true;`
  );
}
