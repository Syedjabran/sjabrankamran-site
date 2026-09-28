"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, House, LayoutGrid, LogOut, Search, Settings } from "lucide-react";
import { PortalIcon } from "@/components/portal-icon";
import { ACCENT_CLASSES, type SubjectId } from "@/lib/portal/subjects";
import { breadcrumbFor, finderEntries, spaceIdForPath, type Crumb, type PortalNav, type SpaceNav } from "@/lib/portal/portal-nav";
import { SPACE_COOKIE } from "@/lib/portal/space-cookie";
import { PortalFinder } from "./portal-finder";
import { PortalProductTour } from "./portal-product-tour";
import { NotificationBell } from "./notification-bell";
import { RolePreviewSwitcher } from "./role-preview";

const ROUND_BUTTON =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/15 text-sm text-fog transition hover:border-cyan/40 hover:text-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan";
const MENU_PANEL = "absolute z-50 mt-2 rounded-2xl border border-white/10 bg-abyss/95 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur";
const MENU_ITEM = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-fog transition hover:bg-white/[0.05] hover:text-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan";

/** Closes a menu on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

/** A small menu's open state; it closes itself when the page changes. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  return { open, setOpen, close, ref };
}

function SubjectSwitcher({ spaces, current, here, onFind }: {
  spaces: SpaceNav[];
  /** The space shown on the button: the page's, else the one last opened. */
  current: SpaceNav | null;
  /** Whether the page is in `current` (not just remembered). */
  here: boolean;
  onFind: () => void;
}) {
  const { open, setOpen, close, ref } = useMenu();
  const accent = current ? ACCENT_CLASSES[current.accent] : null;
  return (
    <div ref={ref} className="relative" data-tour="portal-switcher">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={current ? `Subject: ${current.label}. Switch subject` : "Switch subject"}
        className={`${ROUND_BUTTON} px-2.5 sm:px-3.5 ${here ? "text-ice" : ""}`}>
        {current && accent ? <PortalIcon name={current.icon} size={15} className={accent.text} /> : <LayoutGrid size={15} aria-hidden="true" />}
        <span className="hidden max-w-[10rem] truncate sm:inline">{current ? current.shortLabel : "Subjects"}</span>
        <ChevronDown size={14} aria-hidden="true" className="text-dust" />
      </button>
      {open ? (
        <div role="menu" className={`${MENU_PANEL} left-0 w-64 max-w-[calc(100vw-2rem)]`}>
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-dust">Your subjects</p>
          {spaces.map((space) => (
            <Link key={space.id} role="menuitem" href={space.href} onClick={close} className={MENU_ITEM}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${ACCENT_CLASSES[space.accent].border} ${ACCENT_CLASSES[space.accent].text}`}>
                <PortalIcon name={space.icon} size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-ice">{space.label}</span>
              {space.id === current?.id && here ? <Check size={14} aria-label="You are here" className="shrink-0 text-cyan" /> : null}
            </Link>
          ))}
          <div className="my-1 border-t border-white/10" />
          <button type="button" role="menuitem" onClick={() => { close(); onFind(); }} className={MENU_ITEM}>
            <Search size={15} aria-hidden="true" className="shrink-0" /> All pages…
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <li key={`${i}-${crumb.label}`} className={`flex items-center gap-1.5 ${i === last ? "min-w-0" : "shrink-0"}`}>
            {i ? <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-dust" /> : null}
            {crumb.href && i < last ? (
              <Link href={crumb.href} className="text-fog transition hover:text-cyan">{crumb.label}</Link>
            ) : (
              <span aria-current={i === last ? "page" : undefined} className={i === last ? "truncate font-medium text-ice" : "text-fog"}>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function AccountMenu({ user }: { user: { name: string; roles: string; staff: boolean } }) {
  const { open, setOpen, close, ref } = useMenu();
  const initial = (user.name.trim()[0] || "?").toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" data-tour="portal-profile" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label="Your account" className={`${ROUND_BUTTON} pl-1 pr-1 sm:pr-3`}>
        <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan/30 bg-cyan/10 font-display text-xs font-semibold text-cyan">{initial}</span>
        <span className="hidden max-w-[8rem] truncate text-ice md:inline">{user.name.split(" ")[0]}</span>
        <ChevronDown size={14} aria-hidden="true" className="hidden text-dust sm:block" />
      </button>
      {open ? (
        <div role="menu" className={`${MENU_PANEL} right-0 w-72 max-w-[calc(100vw-2rem)]`}>
          <div className="px-3 pb-2 pt-2">
            <p className="truncate font-display text-sm font-semibold text-ice">{user.name}</p>
            <p className="mt-0.5 text-xs text-dust">{user.roles}</p>
            {user.staff ? <span className="mt-2 inline-block rounded-full border border-emerald2/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald2">Staff</span> : null}
          </div>
          <div className="my-1 border-t border-white/10" />
          <Link role="menuitem" href="/portal/settings" onClick={close} className={MENU_ITEM}>
            <Settings size={15} aria-hidden="true" className="shrink-0" /> Profile &amp; settings
          </Link>
          <form action="/portal/auth/signout" method="post">
            <button type="submit" role="menuitem" className={MENU_ITEM}>
              <LogOut size={15} aria-hidden="true" className="shrink-0" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The bar at the top of every portal page (the sidebar's replacement): Home,
 * the subject switcher, where you are ("Physics › Exam Lab"), "Find a page…"
 * (also Ctrl/Cmd+K), the tour, alerts and your account. Everything it lists
 * comes from the viewer's navigation, built on the server from the registry.
 */
export function PortalTopBar({ nav, remembered, navigable, tourAutoStart, user, rolePreview }: {
  nav: PortalNav;
  remembered: SubjectId | null;
  /** false over the mandatory onboarding form: there is nowhere to go yet. */
  navigable: boolean;
  tourAutoStart: boolean;
  user: { name: string; roles: string; staff: boolean };
  /** An admin's "View as…" control. */
  rolePreview: boolean;
}) {
  const pathname = usePathname();
  const [finding, setFinding] = useState(false);
  const [lastSpace, setLastSpace] = useState<SubjectId | null>(remembered);
  const [shortcut, setShortcut] = useState("Ctrl K");
  const entries = useMemo(() => finderEntries(nav), [nav]);
  const crumbs = useMemo(() => breadcrumbFor(pathname, nav), [pathname, nav]);
  const pageSpace = nav.spaces.find((s) => s.id === spaceIdForPath(pathname)) ?? null;
  const shown = pageSpace ?? nav.spaces.find((s) => s.id === lastSpace) ?? null;
  const searchHref = nav.general.find((l) => l.id === "search")?.href ?? null;

  // Remember the space the viewer is in, for the switcher and "Continue in …".
  const pageSpaceId = pageSpace?.id ?? null;
  useEffect(() => {
    if (!pageSpaceId) return;
    setLastSpace(pageSpaceId);
    document.cookie = `${SPACE_COOKIE}=${pageSpaceId}; path=/; max-age=31536000; samesite=lax`;
  }, [pageSpaceId]);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut("⌘K");
  }, []);

  // Ctrl/Cmd+K opens the finder -- but never over a live sitting (a
  // proctored run is full screen and marks its paper .el-exam-live).
  useEffect(() => {
    if (!navigable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "k") return;
      if (document.fullscreenElement || document.querySelector(".el-exam-live")) return;
      e.preventDefault();
      setFinding(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigable]);

  const closeFinder = useCallback(() => setFinding(false), []);

  return (
    <header className="el-noprint mb-6 border-b border-white/[0.06] pb-4 sm:mb-8">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {navigable ? (
          <>
            <Link href="/portal" prefetch={false} data-tour="portal-home" aria-label="Home" className={`${ROUND_BUTTON} px-2.5 sm:px-3.5`}>
              <House size={15} aria-hidden="true" /> <span className="hidden sm:inline">Home</span>
            </Link>
            {nav.spaces.length ? <SubjectSwitcher spaces={nav.spaces} current={shown} here={!!pageSpace} onFind={() => setFinding(true)} /> : null}
            {crumbs.length ? (
              // Its own line on phones and tablets; beside the switcher on a wide screen.
              <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1 lg:pl-2">
                <Breadcrumb crumbs={crumbs} />
              </div>
            ) : null}
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {navigable ? (
            <button type="button" data-tour="portal-finder" onClick={() => setFinding(true)} aria-label="Find a page"
              className={`${ROUND_BUTTON} w-9 justify-center sm:w-auto sm:justify-start sm:px-3.5 lg:w-56`}>
              <Search size={15} aria-hidden="true" className="shrink-0" />
              <span className="hidden sm:inline">Find a page…</span>
              <kbd className="ml-auto hidden rounded border border-white/15 px-1.5 py-0.5 font-sans text-[10px] text-dust lg:inline">{shortcut}</kbd>
            </button>
          ) : null}
          {navigable ? <PortalProductTour nav={nav} autoStart={tourAutoStart} /> : null}
          {rolePreview ? <RolePreviewSwitcher previewing={null} /> : null}
          <span data-tour="portal-alerts"><NotificationBell /></span>
          <AccountMenu user={user} />
        </div>
      </div>
      {finding ? <PortalFinder entries={entries} searchHref={searchHref} onClose={closeFinder} /> : null}
    </header>
  );
}
