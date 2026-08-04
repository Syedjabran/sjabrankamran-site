"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/profile", label: "Profile" },
  { href: "/education", label: "Education" },
  { href: "/physics-studio", label: "Physics Studio" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/ai-technology", label: "AI & Technology" },
  { href: "/insights", label: "Insights" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-abyss/80 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Home">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan/40 font-display text-sm font-bold text-cyan">
            J
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tightest text-ice">
            Syed Jabran Ali Kamran
          </span>
        </Link>
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="link-underline text-sm text-fog transition-colors hover:text-ice"
            >
              {item.label}
            </Link>
          ))}
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
          "overflow-hidden border-t border-white/[0.06] transition-all duration-300 lg:hidden",
          open ? "max-h-[420px]" : "max-h-0"
        )}
      >
        <nav className="container-x flex flex-col gap-1 py-4">
          {[...NAV, { href: "/contact", label: "Contact" }].map((item) => (
            <Link
              key={item.href}
              href={item.href}
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
