/**
 * Which links the app may open with the user's portal session, decided by
 * EXACT origin -- scheme, host and port equal to the portal's -- never by a
 * string prefix. Pure (no React Native imports) so plain Node tests run it:
 * `npm test` here, and the portal's `npm run test:portal`.
 *
 * Why it is strict: the in-app WebView carries the Supabase session (a Cookie
 * header on the first request, then a cookie written into the page). A check
 * like `url.startsWith(SITE_URL)` let `https://sjabrankamran.com.evil.tld/`
 * and `https://sjabrankamran.com@evil.tld/` through, and a deep link
 * `sjkportal://web?path=.evil.tld/` was glued onto SITE_URL to make the same
 * host -- each would have sent the session to a foreign server.
 *
 * The parser is written out rather than using `URL`, because React Native's
 * URL is incomplete, and because it only accepts the plain forms the portal
 * produces: anything unusual (userinfo, whitespace, backslashes, a missing
 * `//`, an odd host) is refused or treated as another site -- it can never be
 * mistaken for the portal.
 */

/** An http(s) origin. `port` is '' for the scheme's default port. */
export type Origin = { scheme: 'http' | 'https'; host: string; port: string };

/** Where a link opens. */
export type WebTarget =
  /** The portal's own origin: the signed-in in-app WebView. `path` is the
   *  normalised path, query and #fragment; `url` is the portal origin + path. */
  | { kind: 'portal'; url: string; path: string }
  /** Another http(s) site: the system browser, never with the session. */
  | { kind: 'external'; url: string; host: string }
  /** Nothing the app opens (another scheme, a malformed or odd link). */
  | { kind: 'refused' };

const DEFAULT_PORT = { http: '80', https: '443' } as const;
const MAX_LENGTH = 4096;
/** Control characters, whitespace, backslashes: browsers strip or reinterpret
 *  them (tab/newline vanish, `\` becomes `/`), so a link holding one could
 *  mean something other than what this parser read. */
const UNSAFE_CHAR = /[\u0000- \u007f\\]/;
/** A DNS name or IPv4 address, lower case. No `%`, no brackets (IPv6). */
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.?$/;

type ParsedUrl = { origin: Origin; rest: string };

/** An absolute http(s) URL split into its origin and the rest (path, query,
 *  fragment); null for anything else or anything unusual. */
export function parseHttpUrl(input: string): ParsedUrl | null {
  if (typeof input !== 'string' || !input || input.length > MAX_LENGTH || UNSAFE_CHAR.test(input)) return null;
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)(.*)$/.exec(input);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  const authority = match[2];
  const rest = match[3];
  // Userinfo ("user:pass@host") is refused outright: it is how a link makes
  // the portal's host look like the start of a URL that goes elsewhere.
  if (!authority || authority.includes('@')) return null;
  const hostPort = /^([^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!hostPort) return null;
  const host = hostPort[1].toLowerCase();
  if (!HOST.test(host)) return null;
  let port = hostPort[2] ?? '';
  if (port) {
    const n = Number(port);
    if (n < 1 || n > 65535) return null;
    port = String(n);
    if (port === DEFAULT_PORT[scheme]) port = '';
  }
  if (rest && !/^[/?#]/.test(rest)) return null;
  return { origin: { scheme, host, port }, rest };
}

/** The portal's origin from the configured site URL. Throws a plain message
 *  when it isn't a bare http(s) origin (a configuration mistake). */
export function parseOrigin(siteUrl: string): Origin {
  const parsed = parseHttpUrl(siteUrl.replace(/\/+$/, ''));
  if (!parsed || parsed.rest) {
    throw new Error(`The site URL "${siteUrl}" must be an http(s) address with no path, like https://sjabrankamran.com.`);
  }
  return parsed.origin;
}

/** "https://sjabrankamran.com" (the default port left out, as browsers write it). */
export function originString(origin: Origin): string {
  return `${origin.scheme}://${origin.host}${origin.port ? `:${origin.port}` : ''}`;
}

export function sameOrigin(a: Origin, b: Origin): boolean {
  return a.scheme === b.scheme && a.host === b.host && a.port === b.port;
}

/**
 * The site's `www.` name (same scheme and port): the site redirects it to
 * its canonical origin, so a link written with it names a portal page. Such
 * a link is OPENED on the canonical origin (`resolveWebTarget` rebuilds it
 * there); nothing is ever sent to the www name itself.
 */
export function isSiteAlias(origin: Origin, site: Origin): boolean {
  return origin.scheme === site.scheme && origin.port === site.port && origin.host === `www.${site.host}`;
}

/** `%2e` is a dot to a browser when it resolves `.` and `..` segments. */
const isDot = (segment: string) => segment === '.' || segment.toLowerCase() === '%2e';
const isDotDot = (segment: string) => /^(?:\.|%2e){2}$/i.test(segment);

/**
 * A same-origin path, query and fragment, normalised: `.` and `..` segments
 * resolved (never above the root), and exactly one leading slash (so the
 * result can never read as a `//host` link). null when it isn't a path from
 * the root.
 */
export function normalisePath(rest: string): string | null {
  const input = rest === '' || rest.startsWith('?') || rest.startsWith('#') ? `/${rest}` : rest;
  if (!input.startsWith('/') || input.length > MAX_LENGTH || UNSAFE_CHAR.test(input)) return null;
  const cut = input.search(/[?#]/);
  const path = cut < 0 ? input : input.slice(0, cut);
  const tail = cut < 0 ? '' : input.slice(cut);
  const segments = path.split('/').slice(1);
  const out: string[] = [];
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (isDot(segment)) {
      if (last) out.push('');
    } else if (isDotDot(segment)) {
      out.pop();
      if (last) out.push('');
    } else {
      out.push(segment);
    }
  });
  const joined = `/${out.join('/')}`.replace(/^\/{2,}/, '/');
  return joined + tail;
}

/**
 * Where a link (a portal path such as "/portal/exam-lab", or an absolute
 * URL) opens: the signed-in WebView only when it is the portal's exact
 * origin, or the site's www name, which is rebuilt on the exact origin (the
 * returned `url` is always on the portal's origin). `input` is whatever
 * arrived -- a route param, a deep link, an API field -- so anything that
 * isn't a string is refused.
 */
export function resolveWebTarget(input: unknown, site: Origin): WebTarget {
  if (typeof input !== 'string' || !input) return { kind: 'refused' };
  if (input.startsWith('/')) {
    // A path from the portal's root. "//host/..." is a link to another host.
    if (input.startsWith('//')) return { kind: 'refused' };
    const path = normalisePath(input);
    return path ? { kind: 'portal', url: originString(site) + path, path } : { kind: 'refused' };
  }
  const parsed = parseHttpUrl(input);
  if (!parsed) return { kind: 'refused' };
  if (sameOrigin(parsed.origin, site) || isSiteAlias(parsed.origin, site)) {
    const path = normalisePath(parsed.rest);
    return path ? { kind: 'portal', url: originString(site) + path, path } : { kind: 'refused' };
  }
  return { kind: 'external', url: originString(parsed.origin) + parsed.rest, host: parsed.origin.host };
}

/** What the signed-in WebView does with a navigation it is about to make. */
export type NavigationDecision =
  /** Load it here: the portal, or what a frame inside a portal page may show. */
  | 'load'
  /** Don't load it; load the same page on the portal's exact origin instead
   *  (`resolveWebTarget(url).url`): a link written with the site's www name. */
  | 'rewrite'
  /** Hand it to the phone: another website (the browser), mail or phone links. */
  | 'hand-off'
  /** Neither: script, data, file, intent and other schemes, odd links. */
  | 'block';

/** Links the phone may open for a portal page (mail, phone and text links). */
const HAND_OFF_SCHEMES = /^(?:mailto|tel|sms):/i;

/** A `blob:` URL the portal's own pages made (a download, a preview). */
function isSiteBlob(url: string, site: Origin): boolean {
  const inner = /^blob:/i.test(url) ? parseHttpUrl(url.slice(5)) : null;
  return !!inner && sameOrigin(inner.origin, site);
}

/**
 * The decision for a navigation inside the signed-in WebView. Every frame is
 * scheme-checked:
 * - the top frame may only ever show the portal's exact origin (it carries
 *   the session and the injected cookie script); the site's www name is
 *   rewritten onto that origin; another website opens in the phone's
 *   browser; mail, phone and text links go to the phone;
 * - a frame inside a portal page (a YouTube or Drive embed, the Practical
 *   Lab) may load a well-formed http(s) page of any site, a blank page or a
 *   portal blob -- nothing else, and nothing is handed to the phone from a
 *   frame. A frame gets no credentials of ours: the session cookie is
 *   host-only (only a portal frame, which is the portal, carries it) and
 *   the session script runs in the top frame only.
 * (iOS reports frames with `isTopFrame: false`. Android's bridge doesn't
 * say which frame asks, so the caller passes true when it isn't told: a
 * frame is then judged by the stricter top-frame rule.)
 */
export function navigationDecision(url: string, isTopFrame: boolean, site: Origin): NavigationDecision {
  if (typeof url !== 'string') return 'block';
  if (/^about:(?:blank|srcdoc)$/i.test(url)) return 'load';
  if (/^blob:/i.test(url)) return isSiteBlob(url, site) ? 'load' : 'block';
  if (!isTopFrame) return parseHttpUrl(url) ? 'load' : 'block';
  const target = resolveWebTarget(url, site);
  if (target.kind === 'portal') {
    const asked = parseHttpUrl(url);
    return asked && sameOrigin(asked.origin, site) ? 'load' : 'rewrite';
  }
  if (target.kind === 'external') return 'hand-off';
  return HAND_OFF_SCHEMES.test(url) && !UNSAFE_CHAR.test(url) ? 'hand-off' : 'block';
}
