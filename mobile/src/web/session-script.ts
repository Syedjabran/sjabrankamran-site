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
 *
 * The WebView keeps its cookies between pages and between accounts, so the
 * script also expires every session cookie name it isn't writing: a previous
 * account's cookie (or a chunk of it) must never sit beside, or shadow, the
 * current one. Older app versions wrote the session with `Domain=<host>`;
 * those copies are expired too.
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

/**
 * Every name a Supabase session cookie can take: the base name and its
 * `.0`, `.1`, ... chunks (@supabase/ssr splits a long session into chunks).
 */
export function authCookieNames(base: string, chunks = 10): string[] {
  return [base, ...Array.from({ length: chunks }, (_, i) => `${base}.${i}`)];
}

/** One `document.cookie` assignment: host-only, whole site, Lax. */
function cookieString(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Expires a cookie: the host-only one, or the `Domain=<host>` copy. */
function expiryString(name: string, secure: boolean, domain?: string): string {
  return `${name}=; path=/;${domain ? ` domain=${domain};` : ''} max-age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

const assign = (cookie: string) => `document.cookie=${JSON.stringify(cookie)};`;

/**
 * The script injected before a portal page's content loads. Only when the
 * page is the portal's own origin (scheme, host and port), it first expires
 * each of `expire` it isn't about to write (and every `Domain=<host>` copy of
 * them), then writes each `[name, value, maxAgeSeconds]` cookie.
 */
export function sessionCookieScript(
  site: Origin,
  cookies: readonly (readonly [name: string, value: string, maxAge: number])[],
  expire: readonly string[] = []
): string {
  const expected = `${site.scheme}:|${site.host}|${site.port}`;
  const secure = site.scheme === 'https';
  const valid = cookies.filter(
    ([name, value, maxAge]) => COOKIE_TOKEN.test(name) && COOKIE_TOKEN.test(value) && Number.isInteger(maxAge) && maxAge > 0
  );
  const written = new Set(valid.map(([name]) => name));
  const stale = expire.filter((name) => COOKIE_TOKEN.test(name));
  const expiries = [
    ...stale.filter((name) => !written.has(name)).map((name) => assign(expiryString(name, secure))),
    ...stale.map((name) => assign(expiryString(name, secure, site.host))),
  ].join('');
  const writes = valid.map(([name, value, maxAge]) => assign(cookieString(name, value, maxAge, secure))).join('');
  // `location` can't be replaced by a page, and the check calls no method a
  // page could have swapped. location.hostname is already lower case, and
  // location.port is '' for the scheme's default port, as Origin.port is.
  return (
    `(function(){try{` +
    `if(location.protocol+'|'+location.hostname+'|'+location.port!==${JSON.stringify(expected)})return;` +
    expiries +
    writes +
    `}catch(e){}})();true;`
  );
}
