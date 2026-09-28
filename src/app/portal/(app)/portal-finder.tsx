"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, X } from "lucide-react";
import { PortalIcon } from "@/components/portal-icon";
import { findPages, type FinderEntry } from "@/lib/portal/portal-nav";

/** Opens a finder result: a full page load where the registry asks for one. */
export function useOpenLink() {
  const router = useRouter();
  return (href: string, hardNavigate?: boolean) => {
    if (hardNavigate) window.location.assign(href);
    else router.push(href);
  };
}

/**
 * "Find a page…": every destination the viewer has, grouped as the home page
 * groups them, filtered as they type. A centred panel on larger screens and
 * the whole screen on a phone. In the search box the arrow keys move and
 * Enter opens; Escape closes from anywhere; Tab stays inside the dialog, and
 * focus goes back to where it was when the finder closes.
 */
export function PortalFinder({ entries, searchHref, onClose }: {
  entries: readonly FinderEntry[];
  /** The portal's full-text search page, when the viewer has it. */
  searchHref: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = useOpenLink();
  const listId = useId();
  const results = useMemo(() => findPages(entries, query), [entries, query]);

  // Focus the search box; give focus back to the opener (the Find button, the
  // switcher) when the finder closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // The page behind doesn't scroll while the finder is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, []);

  function choose(entry: FinderEntry | undefined) {
    if (!entry) return;
    onClose();
    open(entry.link.href, entry.link.hardNavigate);
  }

  // Escape closes from anywhere in the dialog; Tab and Shift+Tab wrap inside it.
  function onDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("input, button, [href], [tabindex]:not([tabindex='-1'])")]
      .filter((el) => !el.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // The list keys belong to the search box only, so Enter on "Search
  // everything" or on Close does what that button says.
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
  }

  const q = query.trim();
  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center sm:px-4 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Find a page" onKeyDown={onDialogKeyDown}
        className="relative flex h-full w-full flex-col overflow-hidden border-white/10 bg-abyss shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-2xl sm:border">
        <div className="flex items-center gap-2 border-b border-white/10 px-4">
          <Search size={17} aria-hidden="true" className="shrink-0 text-fog" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKeyDown} placeholder="Find a page…"
            role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-ice outline-none placeholder:text-dust" />
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fog transition hover:bg-white/5 hover:text-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
            <X size={17} />
          </button>
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {results.map((entry, index) => {
            const heading = !q && (index === 0 || results[index - 1].group !== entry.group) ? entry.group : null;
            const selected = index === active;
            return (
              <li key={`${entry.group}-${entry.link.id}-${entry.link.href}`} role="presentation">
                {heading ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-dust">{heading}</p> : null}
                <div id={`${listId}-${index}`} data-index={index} role="option" aria-selected={selected}
                  onMouseMove={() => setActive(index)} onClick={() => choose(entry)}
                  className={"flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition " + (selected ? "bg-cyan/10 text-ice" : "text-fog")}>
                  <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg border " + (selected ? "border-cyan/40 text-cyan" : "border-white/10 text-fog")}>
                    <PortalIcon name={entry.link.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.link.name}</span>
                    <span className="block truncate text-xs text-dust">{entry.link.purpose}</span>
                  </span>
                  {q ? <span className="hidden shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-dust sm:inline">{entry.group}</span> : null}
                  {selected ? <CornerDownLeft size={14} aria-hidden="true" className="hidden shrink-0 text-cyan sm:block" /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        {!results.length ? (
          <p role="status" className="px-5 pb-5 text-sm text-fog">No page is called that.</p>
        ) : null}
        {q && searchHref ? (
          <button type="button" onClick={() => { onClose(); open(`${searchHref}?q=${encodeURIComponent(q)}`); }}
            className="flex min-h-12 items-center gap-2 border-t border-white/10 px-5 text-left text-sm text-cyan transition hover:bg-white/[0.03]">
            <Search size={14} aria-hidden="true" /> <span className="min-w-0 truncate">Search everything for &ldquo;{q}&rdquo;</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
