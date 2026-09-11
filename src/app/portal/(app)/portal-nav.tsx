"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";

export type PortalNavItem = { href: string; label: string; hardNavigate?: boolean };
export type PortalNavSection = { title?: string; items: PortalNavItem[] };

const ITEM_CLASS =
  "block rounded-xl border border-white/10 bg-space/60 px-3.5 py-2.5 text-sm text-fog transition hover:border-cyan/40 hover:text-ice";
const ITEM_ACTIVE_CLASS = "border-cyan/40 bg-cyan/[0.07] text-ice";

function NavLink({ item, active, onNavigate }: { item: PortalNavItem; active: boolean; onNavigate: () => void }) {
  const className = `${ITEM_CLASS} ${active ? ITEM_ACTIVE_CLASS : ""}`;
  // Some routes were added after students already held a long-lived PWA
  // session, so they navigate hard to bypass a stale client-side 404.
  if (item.hardNavigate) {
    return (
      <a href={item.href} className={className} onClick={onNavigate}>
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {item.label}
    </Link>
  );
}

/**
 * The portal's role-aware navigation.
 *
 * On large screens this is the sticky sidebar it has always been. On a phone
 * the same entries used to render as a wrapped pile of pills — for a staff
 * account that is around twenty of them, filling most of the first screen
 * before any page content. Here they collapse behind a single "Menu" control
 * and open as a readable vertical list instead.
 */
export function PortalNav({ sections }: { sections: PortalNavSection[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const count = sections.reduce((n, s) => n + s.items.length, 0);

  const current = sections
    .flatMap((s) => s.items)
    .filter((i) => pathname === i.href)
    .map((i) => i.label)[0];

  const list = (
    <div className="space-y-5">
      {sections.map((section, si) => (
        <div key={si}>
          {section.title ? (
            <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-widelabel text-dust/70">
              {section.title}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {section.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={pathname === item.href}
                  onNavigate={() => setOpen(false)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  // The sticky/scroll classes stay on <nav> itself: it is the grid item, and
  // `sticky` + `self-start` only behave correctly on the element the grid lays
  // out. Moving them to an inner wrapper silently breaks the sticky sidebar.
  return (
    <nav
      aria-label="Portal navigation"
      className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto nav-scroll"
    >
      {/* Phone / tablet: one control, expanding to a vertical list. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="portal-nav-panel"
          className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-space/60 px-3.5 py-2.5 text-sm text-fog transition hover:border-cyan/40 hover:text-ice"
        >
          <Menu size={15} className="shrink-0 text-cyan" />
          <span className="font-medium text-ice">{current || "Menu"}</span>
          <span className="ml-auto flex items-center gap-2 text-xs text-dust">
            {count}
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </span>
        </button>
        {open ? (
          <div id="portal-nav-panel" className="mt-3">
            {list}
          </div>
        ) : null}
      </div>

      {/* Desktop: the sidebar, unchanged. */}
      <div className="hidden lg:block">{list}</div>
    </nav>
  );
}
