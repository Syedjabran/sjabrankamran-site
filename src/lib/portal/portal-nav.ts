/**
 * The portal's subject-first navigation, built from the subject registry.
 * Pure and isomorphic (no `@/` alias, no React): the portal layout, the home
 * page's subject picker, each subject space, the desk pages, the page
 * finder, the top bar's breadcrumb and subject switcher, the product tour and
 * plain Node tests all read it.
 *
 * Everything a viewer sees comes from ONE rule, `visibleItems` (subjects.ts):
 * - each subject space (Physics, Digital SAT) holds the viewer's visible
 *   modules of that subject and of the subjects shown inside it (Practical
 *   Lab inside Physics), in `order`; a space with nothing in it is not shown,
 *   and nor is one holding only pages usable without the subject (a
 *   parent's Physics Resources) -- those pages go to General;
 * - General holds the visible places that belong to every subject, plus a
 *   subject's `shared` pages (Physics Resources, under that full name) for a
 *   viewer with no space of that subject. The old menu showed every student
 *   Physics: a student who doesn't take it keeps its shared pages, and its
 *   physics-only pages (Exam Lab, Study plan, ...) leave their navigation --
 *   those routes still open by URL and say what they are for;
 * - Administration holds the visible staff consoles, most used first.
 */
import {
  CLASS_SUBJECTS, SUBJECTS, SUBJECT_SPACES, audiencesOf, itemForPath, listed, portalItem, spaceForPath, spaceOf, spaceRoute,
  viewerSubjects, visibleItems,
  type AccentToken, type Audience, type IconName, type ItemEntry, type PortalItemId, type SubjectId, type ViewerFacts,
} from "./subjects.ts";

/** One destination as a button. */
export type NavLink = {
  id: PortalItemId;
  href: string;
  /** What the button says: the plain name inside its space (the coordinator
   *  desk's own name where it has one); a subject's page shown outside its
   *  space reads its full menu label ("Physics Resources"). */
  name: string;
  icon: IconName;
  /** One line on what it is for (the registry's `purpose`). */
  purpose: string;
  /** Other names the finder knows it by: its old menu label ("Physics Resources"). */
  aliases: string[];
  /** Open with a full page load (registry `hardNavigate`). */
  hardNavigate?: boolean;
  /** The space it is shown in. */
  space?: SubjectId;
};

/** A subject space: a subject the viewer has and its pages. */
export type SpaceNav = {
  id: SubjectId;
  label: string;
  shortLabel: string;
  icon: IconName;
  accent: AccentToken;
  href: string;
  modules: NavLink[];
};

export type PortalNav = {
  spaces: SpaceNav[];
  /** Places that belong to every subject (and shared subject pages). Home
   *  and Profile are in the top bar instead. */
  general: NavLink[];
  /** The staff consoles, most used first. */
  admin: NavLink[];
  /** The portal home, when the viewer's menu listed it. */
  home: NavLink | null;
  /** Where the top bar's Home goes: the portal home, or a desk role's desk
   *  (the portal home sends them there). */
  homeHref: string;
  /** Whether Home is a desk (coordinator/facilitator, registrar). */
  deskHome: boolean;
  /** Profile & settings (every viewer). */
  profile: NavLink | null;
};

/** The top bar's own places: never repeated in the General group. */
const TOP_BAR: readonly PortalItemId[] = ["home", "profile"];

/** The page each desk audience lands on instead of the portal home. */
const DESK_HOMES: Partial<Record<Audience, PortalItemId>> = {
  "coordinator-desk": "coordinator",
  "registrar-desk": "daily-attendance",
};

/** The desk page a desk role lands on (the portal home redirects them
 *  there); null for everyone else. */
export function deskHomeOf(roles: ViewerFacts["roles"]): string | null {
  const audiences = audiencesOf(roles);
  for (const [audience, id] of Object.entries(DESK_HOMES) as [Audience, PortalItemId][]) {
    if (audiences.has(audience)) return portalItem(id).route;
  }
  return null;
}

function toLink(entry: ItemEntry, desk: boolean, { space, outside = false }: { space?: SubjectId; outside?: boolean } = {}): NavLink {
  const { item } = entry;
  const name = desk && item.deskLabel ? item.deskLabel : outside ? item.menuLabel : item.name;
  const aliases = [...new Set([item.menuLabel, item.name, item.deskLabel].filter((a): a is string => !!a && a !== name))];
  const link: NavLink = { id: item.id, href: item.route, name, icon: item.icon, purpose: item.purpose, aliases };
  if (item.hardNavigate) link.hardNavigate = true;
  if (space) link.space = space;
  return link;
}

/** The space an entry's subject is shown in, or null for a general/staff place. */
function spaceIdOf(entry: ItemEntry): SubjectId | null {
  return entry.subject ? spaceOf(entry.subject).id : null;
}

const isShared = (entry: ItemEntry) => entry.group === "subject" && entry.item.shared === true;

const byOrder = (a: ItemEntry, b: ItemEntry) =>
  (a.group === "subject" ? a.item.order : 0) - (b.group === "subject" ? b.item.order : 0);

/** What the portal menu reached before subject spaces: the same rule with
 *  every class-granted subject assumed, as the old menu showed Physics to
 *  every student (scripts/test-subject-registry.mjs proves the two agree). */
function formerReach(viewer: ViewerFacts): ItemEntry[] {
  const classCourses = CLASS_SUBJECTS.flatMap((s) => s.courses);
  return visibleItems({ ...viewer, courses: [...new Set([...viewer.courses, ...classCourses])] });
}

/** The whole navigation for a viewer (see the file comment). */
export function navigationFor(viewer: ViewerFacts): PortalNav {
  const desk = audiencesOf(viewer.roles).has("coordinator-desk");
  const visible = visibleItems(viewer);
  const shown = new Set(visible.map((e) => e.item.id));

  const spaces: SpaceNav[] = [];
  const shared: NavLink[] = [];
  for (const subject of SUBJECT_SPACES) {
    const entries = visible.filter((e) => e.group === "subject" && spaceIdOf(e) === subject.id).sort(byOrder);
    if (!entries.length) continue;
    // A space that would hold only pages anyone can use (a parent's Physics
    // Resources) is no space: those pages go to General.
    if (entries.every(isShared)) {
      shared.push(...entries.map((e) => toLink(e, desk, { outside: true })));
      continue;
    }
    spaces.push({
      id: subject.id, label: subject.label, shortLabel: subject.shortLabel, icon: subject.icon, accent: subject.accent,
      href: spaceRoute(subject.id), modules: entries.map((e) => toLink(e, desk, { space: subject.id })),
    });
  }
  // The old menu's pages of a subject the viewer doesn't take: only the
  // shared ones stay (the rest would only say they are for that subject).
  for (const entry of formerReach(viewer)) {
    if (!shown.has(entry.item.id) && isShared(entry)) shared.push(toLink(entry, desk, { outside: true }));
  }

  // General in registry order, with any shared subject page beside the library.
  const general = visible.filter((e) => e.group === "general" && !TOP_BAR.includes(e.item.id)).map((e) => toLink(e, desk));
  const at = general.findIndex((l) => l.id === "library");
  general.splice(at < 0 ? general.length : at + 1, 0, ...shared);

  const find = (id: PortalItemId) => visible.find((e) => e.item.id === id);
  const homeEntry = find("home");
  const profileEntry = find("profile");
  const deskHome = deskHomeOf(viewer.roles);
  return {
    spaces,
    general,
    admin: visible.filter((e) => e.group === "staff").map((e) => toLink(e, desk)),
    home: homeEntry ? toLink(homeEntry, desk) : null,
    homeHref: deskHome ?? portalItem("home").route,
    deskHome: !!deskHome,
    profile: profileEntry ? toLink(profileEntry, desk) : null,
  };
}

/** Every destination of a navigation, each once. */
export function allLinks(nav: PortalNav): NavLink[] {
  const links: NavLink[] = [];
  const add = (l: NavLink | null) => { if (l && !links.some((x) => x.href === l.href && x.id === l.id)) links.push(l); };
  add(nav.home);
  for (const space of nav.spaces) space.modules.forEach(add);
  nav.general.forEach(add);
  nav.admin.forEach(add);
  add(nav.profile);
  return links;
}

/** What a home page (the portal home, or a desk) shows as buttons: the
 *  subject cards, Administration and General -- everything but the top
 *  bar's Home and Profile, less the page it is drawn on (`except`, a desk's
 *  own tile on that desk). */
export function homeSections(nav: PortalNav, except?: string): { spaces: SpaceNav[]; admin: NavLink[]; general: NavLink[] } {
  const keep = (l: NavLink) => l.href !== except;
  return { spaces: nav.spaces, admin: nav.admin.filter(keep), general: nav.general.filter(keep) };
}

// --- the desk roles' fence ----------------------------------------------------------

/** Pages the portal's own chrome links to for every signed-in viewer, whatever
 *  their navigation: the portal home (a desk role is sent on from it), the
 *  account menu's Profile & settings, the bell's "See all notifications",
 *  the install page, the onboarding gate and the sign-in / sign-out
 *  callbacks. A desk role's fence never blocks them
 *  (scripts/test-portal-nav.mjs reads every link the chrome renders). */
export const CHROME_ROUTES: readonly string[] = [
  "/portal", "/portal/settings", "/portal/notifications", "/portal/install", "/portal/onboarding", "/portal/auth",
];

/** The pages a desk role may open: every destination their navigation
 *  offers (spaces included) plus every page the chrome links to. Paths
 *  without query or hash. */
export function deskRoutes(nav: PortalNav): string[] {
  const pages = [...allLinks(nav).map((l) => l.href), ...nav.spaces.map((s) => s.href), nav.homeHref, ...CHROME_ROUTES];
  return [...new Set(pages.map((p) => p.split(/[?#]/)[0]))];
}

/** Whether a path is one of `routes`: the portal home only exactly, every
 *  other route itself or any page under it ("/portal/admin/drills/x/print"). */
export function onDeskRoute(pathname: string, routes: readonly string[]): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/(.)\/+$/, "$1").toLowerCase();
  const home = portalItem("home").route;
  return routes.some((r) => (r === home ? path === home : path === r || path.startsWith(`${r}/`)));
}

// --- where a page sits -----------------------------------------------------------

/** The space a page belongs to (its own space page, a module of it, or a
 *  page of a subject shown inside it); null for general/staff pages. */
export function spaceIdForPath(pathname: string | null | undefined): SubjectId | null {
  const space = spaceForPath(pathname);
  if (space) return space.id;
  const entry = itemForPath(pathname);
  return entry ? spaceIdOf(entry) : null;
}

export type Crumb = { label: string; href?: string };

/** The breadcrumb for a page, as this viewer names it: "Physics › Exam Lab",
 *  "Administration › Users & activity", "Timetable"; [] on the home page and
 *  on a path no item covers. A subject the viewer has no space for is not a
 *  link (its space would be empty). */
export function breadcrumbFor(pathname: string | null | undefined, nav: PortalNav): Crumb[] {
  const space = spaceForPath(pathname);
  if (space) {
    const own = nav.spaces.find((s) => s.id === space.id);
    return [{ label: own?.label ?? space.label }];
  }
  const entry = itemForPath(pathname);
  if (!entry || entry.item.id === "home") return [];
  const known = allLinks(nav).find((l) => l.id === entry.item.id);
  const label = known?.name ?? entry.item.name;
  if (entry.group === "staff") return [{ label: "Administration" }, { label }];
  const spaceId = spaceIdOf(entry);
  if (!spaceId) return [{ label }];
  const inNav = nav.spaces.find((s) => s.id === spaceId);
  return inNav ? [{ label: inNav.label, href: inNav.href }, { label }] : [{ label }];
}

// --- the page finder ---------------------------------------------------------------

/** A finder row: a destination and the group it is shown under. */
export type FinderEntry = { link: NavLink; group: string };

/** Everything the finder offers, grouped as the home page groups it: the
 *  viewer's subject spaces, each space's pages, General, Administration. */
export function finderEntries(nav: PortalNav): FinderEntry[] {
  const entries: FinderEntry[] = [];
  if (nav.home) entries.push({ link: nav.home, group: "General" });
  for (const space of nav.spaces) {
    entries.push({
      link: { id: "subject-space", href: space.href, name: space.label, icon: space.icon, aliases: [space.shortLabel], space: space.id,
        purpose: `All of ${space.label} in one place.` },
      group: "Subjects",
    });
  }
  for (const space of nav.spaces) for (const link of space.modules) entries.push({ link, group: space.label });
  for (const link of nav.general) entries.push({ link, group: "General" });
  if (nav.profile) entries.push({ link: nav.profile, group: "General" });
  for (const link of nav.admin) entries.push({ link, group: "Administration" });
  return entries;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The finder's results for a query: every entry when the query is empty;
 *  otherwise the entries whose name, old names, group or purpose hold every
 *  word typed, best first (name start, then name, then old names, group,
 *  purpose). */
export function findPages(entries: readonly FinderEntry[], query: string): FinderEntry[] {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return [...entries];
  const scored: { entry: FinderEntry; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const name = norm(entry.link.name);
    const aliases = norm(entry.link.aliases.join(" "));
    const group = norm(entry.group);
    const purpose = norm(entry.link.purpose);
    let score = 0;
    for (const word of words) {
      if (name.startsWith(word) || name.includes(` ${word}`)) score += 8;
      else if (name.includes(word)) score += 6;
      else if (aliases.includes(word)) score += 4;
      else if (group.includes(word)) score += 3;
      else if (purpose.includes(word)) score += 1;
      else return;
    }
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.entry);
}

// --- the product tour ------------------------------------------------------------

export type TourSide = "top" | "bottom" | "left" | "right";
export type TourStep = { target: string | null; title: string; body: string; side?: TourSide; align?: "start" | "center" | "end" };

/** The data-tour selectors the pages put on their parts. */
export const TOUR_TARGETS = {
  home: "[data-tour='portal-home']",
  switcher: "[data-tour='portal-switcher']",
  finder: "[data-tour='portal-finder']",
  alerts: "[data-tour='portal-alerts']",
  profile: "[data-tour='portal-profile']",
  general: "[data-tour='group-general']",
  admin: "[data-tour='group-admin']",
  space: (id: SubjectId) => `[data-tour-space='${id}']`,
  module: (id: PortalItemId) => `[data-tour-module='${id}']`,
} as const;

const pathOnly = (pathname: string | null | undefined) => (pathname || "").split(/[?#]/)[0].replace(/(.)\/+$/, "$1").toLowerCase();

/** Whether a page is a home page (the portal home, or a desk role's desk)
 *  or a subject space: the pages the tour walks, and the only ones it starts
 *  on by itself (never a sitting or a deep link into one). */
export function isTourHome(pathname: string | null | undefined, nav: PortalNav): boolean {
  const path = pathOnly(pathname);
  return path === portalItem("home").route || path === nav.homeHref || !!spaceForPath(path);
}

const namesOf = (links: readonly NavLink[], max = 3) => {
  const names = links.map((l) => l.name);
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : listed(names);
};

/** The tour for a page, built from the viewer's navigation, so it never
 *  mentions a space, group or page the viewer can't see. On a home page
 *  (the portal home, a desk) it walks the subject cards and groups; in a
 *  subject space, that space's pages; everywhere, the top bar. */
export function tourSteps(nav: PortalNav, pathname: string | null | undefined): TourStep[] {
  const path = pathOnly(pathname);
  const steps: TourStep[] = [{
    target: null,
    title: "Welcome to your portal",
    body: nav.spaces.length
      ? "Everything is arranged by subject: pick a subject on your home page to see its pages. Use Next to walk through the real controls."
      : "Use Next to walk through the real controls of your portal.",
  }];
  if (path === portalItem("home").route || path === nav.homeHref) {
    for (const space of nav.spaces) {
      steps.push({ target: TOUR_TARGETS.space(space.id), title: space.label, body: `Open ${space.label} for ${namesOf(space.modules)}.`, side: "bottom", align: "start" });
    }
    const sections = homeSections(nav, nav.deskHome ? nav.homeHref : undefined);
    if (sections.admin.length) steps.push({ target: TOUR_TARGETS.admin, title: "Administration", body: `Your staff tools: ${namesOf(sections.admin, 4)}.`, side: "top", align: "start" });
    if (sections.general.length) steps.push({ target: TOUR_TARGETS.general, title: "General", body: `For every subject: ${namesOf(sections.general, 4)}.`, side: "top", align: "start" });
  }
  const space = spaceForPath(path);
  const own = space ? nav.spaces.find((s) => s.id === space.id) : null;
  if (own) {
    for (const link of own.modules) steps.push({ target: TOUR_TARGETS.module(link.id), title: link.name, body: link.purpose, side: "bottom", align: "start" });
  }
  steps.push({
    target: TOUR_TARGETS.home, title: "Home",
    body: nav.deskHome ? "Back to your desk and all your pages from anywhere." : "Back to your subjects from any page.",
    side: "bottom", align: "start",
  });
  if (nav.spaces.length > 1) steps.push({ target: TOUR_TARGETS.switcher, title: "Switch subject", body: "Jump straight to another subject's pages. The portal remembers the last one you used.", side: "bottom", align: "start" });
  else if (nav.spaces.length === 1) steps.push({ target: TOUR_TARGETS.switcher, title: nav.spaces[0].label, body: `Open ${nav.spaces[0].label} from any page.`, side: "bottom", align: "start" });
  steps.push({ target: TOUR_TARGETS.finder, title: "Find a page", body: "Type any page's name to jump to it. Ctrl+K (Cmd+K on a Mac) opens it from anywhere.", side: "bottom", align: "end" });
  steps.push({ target: TOUR_TARGETS.alerts, title: "Alerts", body: "Announcements, reminders, class changes and marked work arrive here.", side: "bottom", align: "end" });
  steps.push({ target: TOUR_TARGETS.profile, title: "Your account", body: "Your profile and settings, the main website, and signing out.", side: "bottom", align: "end" });
  return steps;
}

/** The steps whose target is on the page (a step with no target always is):
 *  a step never points at something that isn't there. */
export function presentSteps(steps: readonly TourStep[], isPresent: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => s.target === null || isPresent(s.target));
}

// --- the admin's Subjects card ----------------------------------------------------

/** The sentence on the admin's Subjects card saying which subject spaces a
 *  student will see, from their class courses and direct grants:
 *  "Their home page shows Physics (with Practical Lab) and Digital SAT." */
export function studentSpacesSentence({ courses, practicalLab }: { courses: readonly string[]; practicalLab: boolean }): string {
  const has = new Set(viewerSubjects({ roles: ["student"], courses, practicalLab }));
  const parts: string[] = [];
  for (const space of SUBJECT_SPACES) {
    const inside = SUBJECTS.filter((s) => s.partOf === space.id && has.has(s.id)).map((s) => s.label);
    if (has.has(space.id)) parts.push(inside.length ? `${space.label} (with ${listed(inside)})` : space.label);
    else if (inside.length) parts.push(`${space.label} (${listed(inside)} only)`);
  }
  return parts.length
    ? `Their home page shows ${listed(parts)}.`
    : "Their home page shows no subject yet: enrol them in a class or switch a subject on.";
}
