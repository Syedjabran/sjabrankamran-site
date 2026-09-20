"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, FileText, ClipboardList, Layers, BookOpen, Compass, Hash } from "lucide-react";

type Hit = {
  type: "page" | "resource" | "task" | "assignment" | "topic" | "paper";
  title: string; subtitle: string | null; href: string; why: string; due?: string | null; score: number;
};

const TYPE_META: Record<Hit["type"], { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  page: { label: "Pages", icon: Compass },
  assignment: { label: "Assignments & tests", icon: ClipboardList },
  task: { label: "Tasks", icon: Layers },
  resource: { label: "Resources", icon: FileText },
  topic: { label: "Topics", icon: BookOpen },
  paper: { label: "Past papers", icon: Hash },
};
const ORDER: Hit["type"][] = ["assignment", "task", "page", "topic", "paper", "resource"];

export function PortalSearchClient({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setError(""); setNote(null); setHits([]); setSearched(false); setBusy(false);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const t = [...types].join(",");
        const r = await fetch(`/api/portal/search?q=${encodeURIComponent(q)}${t ? `&types=${t}` : ""}`, { signal: controller.signal, cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(r.status === 401 ? "Your session expired. Sign in again to search." : "Search is temporarily unavailable. Please try again.");
        if (current) { setHits(j.results || []); setNote(j.note || null); setSearched(true); }
      } catch (e) {
        if (current && !controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not search. Check your connection and try again.");
      } finally { if (current) setBusy(false); }
    }, 250);
    return () => { current = false; controller.abort(); if (timer.current) clearTimeout(timer.current); };
  }, [q, types]);

  const toggleType = (t: string) =>
    setTypes((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const grouped = ORDER.map((t) => ({ type: t, items: hits.filter((h) => h.type === t) })).filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/20 bg-space/80 px-4 focus-within:border-cyan">
        <Search size={18} className="shrink-0 text-fog" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the portal"
          placeholder="Search assignments, topics, resources, pages…"
          className="min-w-0 w-full bg-transparent py-3 text-base text-ice outline-none placeholder:text-fog"
        />
        {busy ? <Loader2 size={16} className="animate-spin text-cyan" aria-hidden /> : null}
      </label>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter result types">
        {ORDER.map((t) => (
          <button key={t} type="button" onClick={() => toggleType(t)} aria-pressed={types.has(t)}
            className={"rounded-full border px-3 py-1.5 text-xs transition " + (types.has(t) ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/15 text-fog hover:text-ice")}>
            {TYPE_META[t].label}
          </button>
        ))}
        {types.size ? <button type="button" onClick={() => setTypes(new Set())} className="text-xs text-cyan underline">Reset filters</button> : null}
      </div>

      {note ? <p className="text-xs text-dust">{note}</p> : null}
      {error && <p role="alert" className="rounded-xl border border-signal/40 p-4 text-sm text-signal">{error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-fog">{busy ? "Searching…" : searched ? `${hits.length} results` : "Enter at least two characters to search."}</p>

      {searched && !hits.length ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-6">
          <p className="text-sm font-semibold text-ice">No results for “{q}”.</p>
          <p className="mt-2 text-sm text-fog">Try a shorter word (e.g. “waves” instead of “wave superposition sheet”), check the spelling, or clear the type filters.</p>
        </div>
      ) : null}

      {grouped.map((g) => {
        const Meta = TYPE_META[g.type];
        return (
          <section key={g.type} aria-label={Meta.label}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-dust"><Meta.icon size={13} /> {Meta.label}</h2>
            <ul className="space-y-1.5">
              {g.items.map((h, i) => (
                <li key={g.type + i}>
                  <a href={h.href} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-space/60 px-3.5 py-2.5 transition hover:border-cyan/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ice">{h.title}</span>
                      <span className="block text-xs text-dust">{h.subtitle ? `${h.subtitle} · ` : ""}{h.why}</span>
                    </span>
                    {h.due ? <span className="shrink-0 text-xs text-amber-300">Due {new Date(h.due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
