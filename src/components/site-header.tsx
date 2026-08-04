"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/about", label: "About" },
  { href: "/ventures", label: "Ventures" },
  { href: "/education", label: "Education" },
  { href: "/consulting", label: "Consulting" },
  { href: "/projects", label: "Projects" },
  { href: "/ai", label: "AI & Technology" },
  { href: "/insights", label: "Insights" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-midnight/80 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="font-display text-lg tracking-tightest text-ivory">
          Syed Jabran Ali Kamran
        </Link>
        <nav className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="link-underline text-sm text-mutedlight/80 transition-colors hover:text-ivory"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="rounded-full border border-gold/40 px-4 py-1.5 text-sm text-gold transition-colors hover:bg-gold hover:text-midnight"
          >
            Contact
          </Link>
        </nav>
        <button
          className="lg:hidden text-ivory"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <div
        className={cn(
          "lg:hidden overflow-hidden border-t border-white/5 transition-all duration-300",
          open ? "max-h-96" : "max-h-0"
        )}
      >
        <nav className="container-x flex flex-col gap-1 py-4">
          {[...NAV, { href: "/contact", label: "Contact" }].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="py-2 text-mutedlight/80 hover:text-ivory"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
