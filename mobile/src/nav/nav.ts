/**
 * The app's navigation, from ONE source: the portal's own subject-first
 * navigation, fetched as JSON from GET /api/portal/navigation. The portal
 * builds it from its subject registry with the same visibility rule its own
 * home page uses (the website's src/lib/portal/app-nav.ts), so the app lists
 * exactly what the signed-in user may see there and nothing is listed twice.
 *
 * A subject or module added to the portal appears here without an app
 * release: every place carries its portal route, and a place the app has no
 * native screen for opens in the signed-in WebView (app/(app)/web.tsx), where
 * the portal hides its own chrome.
 *
 * Pure (no React Native imports): the portal's `npm run test:portal` imports
 * this file to check the two sides agree, and `npm test` here runs it too.
 */

/** One destination: a portal page, maybe with a native screen here. */
export type AppPlace = {
  id: string;
  name: string;
  /** A lucide icon's export name ("FlaskConical"). */
  icon: string;
  /** Its portal page, a path from the portal's root. */
  route: string;
  purpose: string;
  /** The app's native screen for it (a NATIVE_ROUTES key), or null. */
  native: string | null;
};

/** A subject the user has, with its modules in display order. */
export type AppSubject = AppPlace & {
  shortName: string;
  /** The portal's accent token: cyan, violet, emerald, amber, magenta. */
  accent: string;
  modules: AppPlace[];
};

export type AppNavigation = {
  version: number;
  portalName: string;
  subjects: AppSubject[];
  general: AppPlace[];
  admin: AppPlace[];
  home: AppPlace | null;
  profile: AppPlace | null;
  /** The portal's Home: the portal home, or a desk role's desk. */
  homeRoute: string;
  deskHome: boolean;
  subjectsUnavailable: boolean;
  /** Set while a student must complete their profile first. */
  onboardingRoute: string | null;
};

/** The navigation shape this app reads (the portal's APP_NAV_VERSION).
 *  The portal adds fields without bumping it; a bump means this app is too
 *  old to read the reply. */
export const SUPPORTED_NAV_VERSION = 1;

/** The app's native screens, by the name the portal gives them (app-nav.ts
 *  `AppScreen`), and their routes here. A name this app doesn't know -- a
 *  screen from a later release -- opens the place's route in the WebView. */
export const NATIVE_ROUTES: Readonly<Record<string, string>> = {
  home: '/',
  learn: '/learn',
  leaderboard: '/leaderboard',
  resources: '/resources',
  library: '/library',
  notifications: '/notifications',
  users: '/users',
  rankings: '/rankings',
  settings: '/settings',
};

/** The generic subject screen: any subject's modules, drawn from the reply. */
export const SUBJECT_SCREEN = 'subject';
export const SUBJECT_ROUTE = '/subject/[id]';

/** How to open a place. */
export type OpenTarget =
  | { kind: 'native'; pathname: string; params?: Record<string, string> }
  | { kind: 'web'; path: string; title: string };

const own = (map: Readonly<Record<string, string>>, key: string | null): string | undefined =>
  key !== null && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export function openTargetFor(place: AppPlace | AppSubject): OpenTarget {
  if (place.native === SUBJECT_SCREEN && 'modules' in place) {
    return { kind: 'native', pathname: SUBJECT_ROUTE, params: { id: place.id } };
  }
  const route = own(NATIVE_ROUTES, place.native);
  if (route) return { kind: 'native', pathname: route };
  return { kind: 'web', path: place.route, title: place.name };
}

// --- reading the reply ---------------------------------------------------------------

/** The reply couldn't be read as a navigation (the message says why, plainly). */
export class NavigationFormatError extends Error {
  readonly outdatedApp: boolean;
  constructor(message: string, outdatedApp = false) {
    super(message);
    this.name = 'NavigationFormatError';
    this.outdatedApp = outdatedApp;
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
/** A path from the portal's root ("/portal/..."), never "//host". */
const isRoute = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');

function readPlace(v: unknown): AppPlace | null {
  if (!isObject(v) || !text(v.id) || !text(v.name) || !isRoute(v.route)) return null;
  return {
    id: text(v.id),
    name: text(v.name),
    icon: text(v.icon),
    route: v.route,
    purpose: text(v.purpose),
    native: typeof v.native === 'string' && v.native ? v.native : null,
  };
}

function readPlaces(v: unknown): AppPlace[] {
  return Array.isArray(v) ? v.map(readPlace).filter((p): p is AppPlace => p !== null) : [];
}

function readSubject(v: unknown): AppSubject | null {
  const place = readPlace(v);
  if (!place || !isObject(v)) return null;
  const modules = readPlaces(v.modules);
  if (!modules.length) return null;
  return { ...place, shortName: text(v.shortName) || place.name, accent: text(v.accent), modules };
}

/**
 * The navigation in a /api/portal/navigation reply. Entries it can't read
 * (no id, name or root path) are left out rather than failing the whole
 * menu; fields it doesn't know are ignored. Throws NavigationFormatError when
 * the reply isn't a navigation, or is a newer shape than this app reads.
 */
export function parseAppNavigation(json: unknown): AppNavigation {
  if (!isObject(json) || typeof json.version !== 'number') {
    throw new NavigationFormatError('The portal sent a menu this app could not read. Please try again.');
  }
  if (json.version > SUPPORTED_NAV_VERSION) {
    throw new NavigationFormatError('This version of the app is out of date. Please update it to see your subjects.', true);
  }
  return {
    version: json.version,
    portalName: text(json.portalName),
    subjects: Array.isArray(json.subjects) ? json.subjects.map(readSubject).filter((s): s is AppSubject => s !== null) : [],
    general: readPlaces(json.general),
    admin: readPlaces(json.admin),
    home: readPlace(json.home),
    profile: readPlace(json.profile),
    homeRoute: isRoute(json.homeRoute) ? json.homeRoute : '/portal',
    deskHome: json.deskHome === true,
    subjectsUnavailable: json.subjectsUnavailable === true,
    onboardingRoute: isRoute(json.onboardingRoute) ? json.onboardingRoute : null,
  };
}

// --- what the screens show ------------------------------------------------------------

/** Every destination once: Home, each subject's modules, General,
 *  Administration, Profile. */
export function allPlaces(nav: AppNavigation): AppPlace[] {
  const seen = new Set<string>();
  const out: AppPlace[] = [];
  const add = (p: AppPlace | null) => {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  };
  add(nav.home);
  nav.subjects.forEach((s) => s.modules.forEach(add));
  nav.general.forEach(add);
  nav.admin.forEach(add);
  add(nav.profile);
  return out;
}

export function subjectById(nav: AppNavigation, id: unknown): AppSubject | null {
  return typeof id === 'string' ? nav.subjects.find((s) => s.id === id) ?? null : null;
}

/** The native screens that can sit on the tab bar (app/(app)/_layout.tsx). */
export type TabScreen = 'learn' | 'leaderboard' | 'users' | 'rankings' | 'resources' | 'library';

/**
 * The (at most three) native screens on the tab bar beside Home and More:
 * staff lead with their consoles, everyone else with their learning; each
 * only when the user's navigation holds it, so the tab bar never offers a
 * page the portal wouldn't. Everything else is one tap away under More.
 */
export function primaryTabs(nav: AppNavigation | null | undefined): TabScreen[] {
  if (!nav) return [];
  const has = new Set(allPlaces(nav).map((p) => p.native));
  const order: TabScreen[] = nav.admin.length
    ? ['users', 'rankings', 'resources', 'library']
    : ['learn', 'leaderboard', 'resources', 'library'];
  return order.filter((s) => has.has(s)).slice(0, 3);
}
