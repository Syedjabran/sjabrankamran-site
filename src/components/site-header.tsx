"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SJAK_MONOGRAM_DATA_URI } from "@/lib/sjak-monogram";

const NAV = [
  { href: "/profile", label: "Profile" },
  { href: "/education", label: "Education" },
  { href: "/physics", label: "Courses" },
  { href: "/physics-studio", label: "Physics Studio" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/ai-technology", label: "AI & Technology" },
  { href: "/insights", label: "Insights" },
  { href: "/portal", label: "Portal" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-[110] border-b border-white/[0.06] bg-abyss/80 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Home">
          {/* Inlined data URI: the monogram renders on every public page, so
              it must survive the edge bot-challenge that can block first-visit
              subresource requests before the clearance cookie exists. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SJAK_MONOGRAM_DATA_URI}
            alt="SJAK monogram"
            className="h-10 w-auto"
          />
          <span className="font-display text-[15px] font-semibold tracking-tightest text-ice">
            Syed Jabran Ali Kamran
          </span>
        </Link>
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => {
            // /portal always redirects (auth-gated) via middleware. Prefetching
            // it poisons the App Router cache with a redirect entry, which then
            // makes the on-click soft navigation a no-op. Disable prefetch so
            // the click performs a real navigation that follows the redirect.
            const isPortal = item.href === "/portal";
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={isPortal ? false : undefined}
                className="link-underline text-sm text-fog transition-colors hover:text-ice"
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/contact"
            className="rounded-full border border-cyan/40 px-4 py-1.5 text-sm text-cyan transition-colors hover:bg-cyan hover:text-space"
          >
            Contact
          </Link>
        </nav>
        <button
          className="text-ice lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <div
        className={cn(
          "border-t border-white/[0.06] transition-all duration-300 lg:hidden",
          // Viewport-relative cap + scroll: a fixed px cap clipped the last links.
          open ? "max-h-[80vh] overflow-y-auto" : "max-h-0 overflow-hidden"
        )}
      >
        <nav className="container-x flex flex-col gap-1 py-4">
          {[...NAV, { href: "/contact", label: "Contact" }].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href === "/portal" ? false : undefined}
              onClick={() => setOpen(false)}
              className="py-2.5 text-fog hover:text-ice"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
