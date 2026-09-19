"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Menu, Search, X } from "lucide-react";

type Section = { title?: string; items: { href: string; label: string; hardNavigate?: boolean }[] };

/** Receives only the destinations already authorized by the server layout. */
export function PortalNavigation({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const items = sections.flatMap(s => s.items);
  const active = items.filter(i => pathname === i.href || (i.href !== "/portal" && pathname.startsWith(i.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0];
  const filtered = sections.map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(query.trim().toLowerCase())) })).filter(s => s.items.length);
  return <nav aria-label="Portal navigation" data-tour="portal-navigation" className="el-noprint rounded-2xl border border-white/10 bg-space/80 p-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:self-start">
    <button type="button" aria-expanded={expanded} aria-controls="portal-destinations" onClick={() => setExpanded(!expanded)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-sm text-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan lg:hidden">
      <span className="flex items-center gap-2"><Menu size={18} />{active?.label || "Portal menu"}</span>{expanded ? <X size={18} /> : <ChevronRight size={18} />}
    </button>
    <div id="portal-destinations" className={expanded ? "block" : "hidden lg:block"}>
      <label className="mb-5 mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-abyss px-3 focus-within:border-cyan">
        <Search size={16} aria-hidden="true" className="shrink-0 text-fog" />
        <input aria-label="Find a portal page" placeholder="Find a page…" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 w-full bg-transparent py-2 text-sm text-ice outline-none placeholder:text-fog" />
      </label>
      <div className="space-y-5">{filtered.map((section, index) => <div key={index}>
        {section.title && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-fog">{section.title}</p>}
        <ul className="space-y-1">{section.items.map(item => {
          const selected = item.href === active?.href;
          const props = { "aria-current": selected ? "page" as const : undefined, "data-portal-tour": item.label, onClick: () => { setExpanded(false); setQuery(""); }, className: "flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan " + (selected ? "border-cyan/40 bg-cyan/10 font-semibold text-cyan" : "border-transparent text-fog hover:bg-white/5 hover:text-ice") };
          return <li key={item.href}>{item.hardNavigate ? <a href={item.href} {...props}>{item.label}{selected && <ChevronRight size={14} aria-hidden="true" />}</a> : <Link href={item.href} {...props}>{item.label}{selected && <ChevronRight size={14} aria-hidden="true" />}</Link>}</li>;
        })}</ul>
      </div>)}</div>
      {!filtered.length && <p role="status" className="px-3 py-4 text-sm text-fog">No matching page. <button className="text-cyan underline" onClick={() => setQuery("")}>Clear search</button></p>}
    </div>
  </nav>;
}
