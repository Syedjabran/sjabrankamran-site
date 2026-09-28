/**
 * The mobile app's navigation: the portal's own subject-first navigation
 * (portal-nav.ts `navigationFor`, built from the subject registry's one
 * visibility rule, `visibleItems`) as the JSON the Expo app in `mobile/`
 * draws its home, its subject spaces, General, Administration and its tab bar
 * from (GET /api/portal/navigation). Pure and isomorphic, like portal-nav.ts.
 *
 * Nothing here decides who sees what: it only reshapes a PortalNav, so the
 * app can never list a page the portal wouldn't show the same viewer. A new
 * subject or module in the registry reaches the app without an app release:
 * every place carries its portal route, and the app opens any place it has no
 * native screen for in its WebView, where the portal hides its own chrome
 * (embed.ts, "app-embedded chrome").
 */
import { PORTAL_NAME } from "./brand.ts";
import { listed, type AccentToken, type IconName, type PortalItemId, type SubjectId } from "./subjects.ts";
import type { NavLink, PortalNav, SpaceNav } from "./portal-nav.ts";

/** The response's shape version. Bumped only on a change an installed app
 *  can't read; adding a field is not one (the app ignores what it doesn't know). */
export const APP_NAV_VERSION = 1;

/** The app's native screens, by the name the app knows them
 *  (mobile/src/nav/nav.ts `NATIVE_ROUTES`). An app that doesn't know a name
 *  -- an older release -- opens the place's route in its WebView instead. */
export type AppScreen =
  | "home" | "learn" | "leaderboard" | "resources" | "library" | "notifications" | "users" | "rankings" | "settings"
  | "subject";

/** The portal places the app shows as a native screen. Every other place
 *  opens its portal route in the app's WebView. */
export const APP_NATIVE_SCREENS: Readonly<Partial<Record<PortalItemId, AppScreen>>> = {
  home: "home",
  learning: "learn",
  leaderboard: "leaderboard",
  resources: "resources",
  library: "library",
  notifications: "notifications",
  users: "users",
  analytics: "rankings",
  profile: "settings",
};

/** The app draws every subject space itself from `modules` (its generic
 *  subject screen), whatever the subject. */
const SUBJECT_SCREEN: AppScreen = "subject";

/** One destination. */
export type AppPlace = {
  id: PortalItemId;
  /** What its button says (the portal's own name for it in that group). */
  name: string;
  /** A lucide icon's export name. */
  icon: IconName;
  /** Its portal page (a same-origin path, maybe with a #section). */
  route: string;
  /** One line on what it is for. */
  purpose: string;
  /** The app's native screen for it, or null: open `route` in the WebView. */
  native: AppScreen | null;
};

/** A subject the viewer has, with its modules in display order. */
export type AppSubject = {
  id: SubjectId;
  name: string;
  shortName: string;
  icon: IconName;
  accent: AccentToken;
  /** The subject space's portal page. */
  route: string;
  /** A one-line glance at what is inside ("Exam Lab, Study plan, Answer scripts and 5 more"). */
  purpose: string;
  native: AppScreen;
  modules: AppPlace[];
};

export type AppNavigation = {
  version: number;
  /** The portal's name (brand.ts), for the app's title text. */
  portalName: string;
  /** The subject picker: every subject space the viewer has, in registry order. */
  subjects: AppSubject[];
  /** Places that belong to every subject (and shared subject pages). */
  general: AppPlace[];
  /** The staff consoles, most used first. */
  admin: AppPlace[];
  /** The portal home, when the viewer's navigation lists it. */
  home: AppPlace | null;
  /** Profile & settings. */
  profile: AppPlace | null;
  /** Where the portal's Home goes: the portal home, or a desk role's desk. */
  homeRoute: string;
  /** Whether Home is a desk (coordinator/facilitator, attendance registrar). */
  deskHome: boolean;
  /** A student whose subjects couldn't be read just now (no subject is shown). */
  subjectsUnavailable: boolean;
  /** Set while a student must complete their profile first: the portal opens
   *  nothing else until they do (the onboarding page's route). */
  onboardingRoute: string | null;
};

function toPlace(link: NavLink): AppPlace {
  return {
    id: link.id,
    name: link.name,
    icon: link.icon,
    route: link.href,
    purpose: link.purpose,
    native: APP_NATIVE_SCREENS[link.id] ?? null,
  };
}

/** "Exam Lab, Study plan, Answer scripts and 5 more" (a subject card's line). */
export function modulesLine(modules: readonly { name: string }[], max = 3): string {
  const names = modules.map((m) => m.name);
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : listed(names);
}

function toSubject(space: SpaceNav): AppSubject {
  return {
    id: space.id,
    name: space.label,
    shortName: space.shortLabel,
    icon: space.icon,
    accent: space.accent,
    route: space.href,
    purpose: modulesLine(space.modules),
    native: SUBJECT_SCREEN,
    modules: space.modules.map(toPlace),
  };
}

/** The app's navigation for a viewer's portal navigation (see the file comment). */
export function appNavigation(
  nav: PortalNav,
  { subjectsUnavailable = false, onboardingRoute = null }: { subjectsUnavailable?: boolean; onboardingRoute?: string | null } = {},
): AppNavigation {
  return {
    version: APP_NAV_VERSION,
    portalName: PORTAL_NAME,
    subjects: nav.spaces.map(toSubject),
    general: nav.general.map(toPlace),
    admin: nav.admin.map(toPlace),
    home: nav.home ? toPlace(nav.home) : null,
    profile: nav.profile ? toPlace(nav.profile) : null,
    homeRoute: nav.homeHref,
    deskHome: nav.deskHome,
    subjectsUnavailable,
    onboardingRoute,
  };
}
