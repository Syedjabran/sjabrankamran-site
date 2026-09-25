"use client";

/**
 * Hand-pick Exam Lab questions for a class drill or class test.
 *
 * Controlled: `value` is the ordered id list the allocate route freezes as the
 * drill's paper, so the order in the Selected tray is the order students sit
 * it in. Browses every bank through bank-all (9702 past papers, O Level 5054
 * and, when `allowSecure`, the staff-written class-test bank) and never mixes
 * courses, because every student is locked to one course.
 */

import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, GripVertical, ImageOff, Loader2, Plus, RotateCcw, Search, Timer, X } from "lucide-react";
import { ALL_QUESTIONS, courseOfQuestion, type BankCourse } from "@/lib/exam-lab/bank-all";
import { SECURE_BANK, type ImgQuestion } from "@/lib/exam-lab/image-bank";
import { minutesFromSeconds, questionSeconds } from "@/lib/portal/timing";

type Source = BankCourse | "secure";
type PaperType = ImgQuestion["paperType"];
type Level = ImgQuestion["level"];
type Filters = { source: Source; paper: PaperType | ""; topic: string; level: Level | ""; session: string; minMarks: string; maxMarks: string; text: string };
type Entry = { q: ImgQuestion; source: Source; sessionKey: string | null; sessionLabel: string; sessionRank: number; haystack: string; seconds: number };

const PAGE_SIZE = 30;
const SIGN_BATCH = 80; // /api/exam-lab/asset signs at most 80 keys per call
const UNTAGGED = "__untagged";
const PAPERS: PaperType[] = ["P1", "P2", "P4"];
const LEVELS: Level[] = ["LOT", "HOT"];
const SOURCE_LABEL: Record<Source, string> = { "9702": "A Level 9702", "5054": "O Level 5054", secure: "Class tests (staff bank)" };
const SESSION_NAME: Record<string, string> = { sp: "Specimen", m: "Feb/March", s: "May/June", w: "Oct/Nov" };
const SESSION_ORDER: Record<string, number> = { sp: 0, m: 1, s: 2, w: 3 };
const SESSION_RE = /_(sp|[smw])(\d\d)_\d\d$/;
const EMPTY_FILTERS = { paper: "", topic: "", level: "", session: "", minMarks: "", maxMarks: "", text: "" } as const;

const FIELD = "w-full min-w-0 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust/70 focus:border-cyan focus:outline-none";
const HINT = "rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200";
const LABEL = "text-[11px] font-medium uppercase tracking-wide text-dust";

const SECURE_IDS = new Set(SECURE_BANK.map((q) => q.id));

function toEntry(q: ImgQuestion): Entry {
  const m = q.code.match(SESSION_RE);
  const year = m ? 2000 + Number(m[2]) : 0;
  return {
    q,
    source: courseOfQuestion(q.id) === "5054" ? "5054" : SECURE_IDS.has(q.id) ? "secure" : "9702",
    sessionKey: m ? `${year}${m[1]}` : null,
    sessionLabel: m ? `${year} ${SESSION_NAME[m[1]] ?? m[1]}` : "",
    sessionRank: m ? year * 10 + (SESSION_ORDER[m[1]] ?? 0) : 0,
    haystack: `${q.ref} ${q.code} ${q.topic ?? ""}`.toLowerCase(),
    seconds: questionSeconds({ paper: q.paperType, difficulty: q.level, marks: q.marks }),
  };
}

const ENTRIES: Entry[] = ALL_QUESTIONS.map(toEntry);
const ENTRY_BY_ID = new Map(ENTRIES.map((e) => [e.q.id, e] as const));

export type SelectionSummary = { count: number; marks: number; minutes: number; mix: string };

/** Totals for an ordered id list: marks, estimated minutes (Σ questionSeconds) and paper mix. */
export function selectionSummary(ids: string[]): SelectionSummary {
  let marks = 0;
  let seconds = 0;
  const perPaper: Partial<Record<PaperType, number>> = {};
  for (const id of ids) {
    const e = ENTRY_BY_ID.get(id);
    if (!e) continue;
    marks += e.q.marks ?? 0;
    seconds += e.seconds;
    perPaper[e.q.paperType] = (perPaper[e.q.paperType] ?? 0) + 1;
  }
  return {
    count: ids.length,
    marks,
    minutes: seconds ? minutesFromSeconds(seconds) : 0,
    mix: PAPERS.filter((p) => perPaper[p]).map((p) => `${p} ×${perPaper[p]}`).join(" · "),
  };
}

function numberOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function sourcesFor(course: "9702" | "5054" | "all", allowSecure: boolean): Source[] {
  const list: Source[] = course === "all" ? ["9702", "5054"] : [course];
  if (allowSecure && course !== "5054") list.push("secure");
  return list;
}

/** Signed image URLs, fetched in batches for the rows on screen and cached. */
function useSignedImages() {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const inFlight = useRef<Set<string>>(new Set());

  const sign = useCallback(async (paths: string[], retry = false) => {
    const need = [...new Set(paths)].filter((p) => p && !inFlight.current.has(p) && (retry || (!urls[p] && !failed[p])));
    if (!need.length) return;
    need.forEach((p) => inFlight.current.add(p));
    if (retry) setFailed((prev) => { const next = { ...prev }; need.forEach((p) => delete next[p]); return next; });
    for (let i = 0; i < need.length; i += SIGN_BATCH) {
      const chunk = need.slice(i, i + SIGN_BATCH);
      let got: Record<string, string> = {};
      try {
        const r = await fetch("/api/exam-lab/asset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: chunk }) });
        const j = (await r.json().catch(() => ({}))) as { urls?: Record<string, string> };
        if (r.ok && j.urls) got = j.urls;
      } catch { /* offline or refused: the chunk is marked unavailable below and can be retried */ }
      chunk.forEach((p) => inFlight.current.delete(p));
      setUrls((prev) => ({ ...prev, ...got }));
      const missing = chunk.filter((p) => !got[p]);
      if (missing.length) setFailed((prev) => ({ ...prev, ...Object.fromEntries(missing.map((p) => [p, true])) }));
    }
  }, [urls, failed]);

  // A signed URL that no longer loads (expired, removed) becomes retryable.
  const markBroken = useCallback((path: string) => {
    setUrls((prev) => { const next = { ...prev }; delete next[path]; return next; });
    setFailed((prev) => ({ ...prev, [path]: true }));
  }, []);

  return { urls, failed, sign, markBroken };
}
type SignedImages = ReturnType<typeof useSignedImages>;

export function QuestionPicker({ value, onChange, course = "all", allowSecure = false, max = 500 }: {
  value: string[];
  onChange: (ids: string[]) => void;
  course?: "9702" | "5054" | "all";
  allowSecure?: boolean;
  max?: number;
}) {
  const sources = useMemo(() => sourcesFor(course, allowSecure), [course, allowSecure]);
  const [filters, setFilters] = useState<Filters>(() => {
    const first = value.map((id) => ENTRY_BY_ID.get(id)).find((e): e is Entry => !!e);
    return { ...EMPTY_FILTERS, source: first && sources.includes(first.source) ? first.source : sources[0], paper: first?.q.paperType ?? "" };
  });
  const [page, setPage] = useState(0);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const images = useSignedImages();

  // Every filter value is re-validated against the options it came from, so
  // switching course or paper never leaves a stale topic silently applied.
  const source = sources.includes(filters.source) ? filters.source : sources[0];
  const inSource = useMemo(() => ENTRIES.filter((e) => e.source === source), [source]);
  const papers = useMemo(() => PAPERS.filter((p) => inSource.some((e) => e.q.paperType === p)), [inSource]);
  const paper = filters.paper && papers.includes(filters.paper) ? filters.paper : "";
  const scoped = useMemo(() => (paper ? inSource.filter((e) => e.q.paperType === paper) : inSource), [inSource, paper]);
  const options = useMemo(() => {
    const topics = new Set<string>();
    const sessions = new Map<string, { label: string; rank: number }>();
    const marks = new Set<number>();
    let untagged = false;
    for (const e of scoped) {
      if (e.q.topic) topics.add(e.q.topic); else untagged = true;
      if (e.sessionKey) sessions.set(e.sessionKey, { label: e.sessionLabel, rank: e.sessionRank });
      if (e.q.marks != null) marks.add(e.q.marks);
    }
    return {
      topics: [...topics].sort(),
      untagged,
      sessions: [...sessions].map(([key, s]) => ({ key, ...s })).sort((a, b) => b.rank - a.rank),
      marksSpan: marks.size > 1 ? { min: Math.min(...marks), max: Math.max(...marks) } : null,
    };
  }, [scoped]);
  const topic = filters.topic === UNTAGGED ? (options.untagged ? UNTAGGED : "") : options.topics.includes(filters.topic) ? filters.topic : "";
  const session = options.sessions.some((s) => s.key === filters.session) ? filters.session : "";
  const minMarks = options.marksSpan ? numberOrNull(filters.minMarks) : null;
  const maxMarks = options.marksSpan ? numberOrNull(filters.maxMarks) : null;
  const level = filters.level;
  const text = filters.text.trim().toLowerCase();

  const results = useMemo(() => scoped.filter((e) => {
    if (topic === UNTAGGED ? !!e.q.topic : topic && e.q.topic !== topic) return false;
    if (level && e.q.level !== level) return false;
    if (session && e.sessionKey !== session) return false;
    if (minMarks !== null || maxMarks !== null) {
      if (e.q.marks == null) return false;
      if (minMarks !== null && e.q.marks < minMarks) return false;
      if (maxMarks !== null && e.q.marks > maxMarks) return false;
    }
    return !text || e.haystack.includes(text);
  }), [scoped, topic, level, session, minMarks, maxMarks, text]);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = results.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const filtersActive = !!(paper || topic || level || session || minMarks !== null || maxMarks !== null || text);

  const position = useMemo(() => new Map(value.map((id, i) => [id, i] as const)), [value]);
  const lockedCourse = useMemo<BankCourse | null>(() => {
    for (const id of value) { const c = courseOfQuestion(id); if (c) return c; }
    return null;
  }, [value]);
  const sourceCourse: BankCourse = source === "5054" ? "5054" : "9702";
  const courseBlocked = lockedCourse !== null && lockedCourse !== sourceCourse;
  const full = value.length >= max;
  const blockedReason = courseBlocked ? "Students are locked to one course" : full ? `Limit of ${max} questions reached` : "";

  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setOpenRows(new Set());
  }
  function goTo(p: number) {
    setPage(p);
    setOpenRows(new Set());
    listRef.current?.scrollTo({ top: 0 });
  }
  function toggle(id: string) {
    if (position.has(id)) onChange(value.filter((x) => x !== id));
    else if (!courseBlocked && !full) onChange([...value, id]);
  }
  function togglePreview(id: string) {
    const opening = !openRows.has(id);
    setOpenRows((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    // One signing call covers every row on this page, so the next preview opens instantly.
    if (opening) void images.sign(pageRows.map((e) => e.q.img));
  }

  return (
    <div className="min-w-0 space-y-4 rounded-xl border border-white/10 bg-abyss/40 p-3">
      <SelectedTray value={value} onChange={onChange} images={images} />

      <div className="space-y-2.5 border-t border-white/10 pt-3">
        <div className={LABEL}>Add questions</div>
        {sources.length > 1 ? (
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-abyss/60 p-1">
            {sources.map((s) => (
              <button key={s} type="button" onClick={() => update({ source: s })} aria-pressed={source === s}
                className={"rounded-lg px-3 py-1.5 text-xs font-medium transition sm:text-sm " + (source === s ? "bg-cyan text-abyss shadow-sm" : "text-dust hover:text-ice")}>
                {SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dust" />
          <input type="search" value={filters.text} onChange={(e) => update({ text: e.target.value })} placeholder="Search reference, paper code or topic"
            aria-label="Search questions" className={FIELD + " pl-9"} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {papers.length > 1 ? (
            <>
              <Chip on={!paper} onClick={() => update({ paper: "" })}>All papers</Chip>
              {papers.map((p) => <Chip key={p} on={paper === p} onClick={() => update({ paper: p })}>{p}</Chip>)}
              <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
            </>
          ) : null}
          <Chip on={!level} onClick={() => update({ level: "" })}>Any level</Chip>
          {LEVELS.map((l) => <Chip key={l} on={level === l} onClick={() => update({ level: l })}>{l}</Chip>)}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={topic} onChange={(e) => update({ topic: e.target.value })} aria-label="Topic" className={FIELD}>
            <option value="">All topics</option>
            {options.topics.map((t) => <option key={t} value={t}>{t}</option>)}
            {options.untagged ? <option value={UNTAGGED}>Untagged</option> : null}
          </select>
          {options.sessions.length ? (
            <select value={session} onChange={(e) => update({ session: e.target.value })} aria-label="Year and session" className={FIELD}>
              <option value="">All years &amp; sessions</option>
              {options.sessions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          ) : null}
          {options.marksSpan ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <input type="number" inputMode="numeric" min={options.marksSpan.min} max={options.marksSpan.max} value={filters.minMarks}
                onChange={(e) => update({ minMarks: e.target.value })} placeholder="Min marks" aria-label="Minimum marks" className={FIELD} />
              <span className="text-dust">–</span>
              <input type="number" inputMode="numeric" min={options.marksSpan.min} max={options.marksSpan.max} value={filters.maxMarks}
                onChange={(e) => update({ maxMarks: e.target.value })} placeholder="Max marks" aria-label="Maximum marks" className={FIELD} />
            </div>
          ) : null}
        </div>

        {courseBlocked && lockedCourse ? (
          <p className={HINT}>Your selection is {SOURCE_LABEL[lockedCourse]} and students are locked to one course, so {SOURCE_LABEL[sourceCourse]} questions can’t be added. Clear the selection to switch.</p>
        ) : full ? (
          <p className={HINT}>You’ve reached the limit of {max} questions. Remove one to add another.</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 text-xs text-dust">
          <span>{results.length.toLocaleString("en-GB")} matching</span>
          {filtersActive ? (
            <button type="button" onClick={() => update(EMPTY_FILTERS)} className="inline-flex items-center gap-1 hover:text-ice hover:underline"><RotateCcw size={12} /> Reset filters</button>
          ) : null}
        </div>

        <ul ref={listRef} className="max-h-[26rem] divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/10">
          {pageRows.map((e) => (
            <ResultRow key={e.q.id} entry={e} selected={position.has(e.q.id)} open={openRows.has(e.q.id)} blockedReason={blockedReason}
              onToggle={() => toggle(e.q.id)} onPreview={() => togglePreview(e.q.id)} images={images} />
          ))}
          {!pageRows.length ? <li className="px-3 py-6 text-center text-xs text-dust">No questions match these filters.</li> : null}
        </ul>

        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-dust">
            <PageButton disabled={current === 0} onClick={() => goTo(current - 1)}><ChevronLeft size={13} /> Prev</PageButton>
            <span>Page {current + 1} of {pageCount}</span>
            <PageButton disabled={current >= pageCount - 1} onClick={() => goTo(current + 1)}>Next <ChevronRight size={13} /></PageButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectedTray({ value, onChange, images }: { value: string[]; onChange: (ids: string[]) => void; images: SignedImages }) {
  const summary = useMemo(() => selectionSummary(value), [value]);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= value.length) return;
    const next = [...value];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    onChange(next);
  }
  function clearAll() {
    if (window.confirm(`Remove all ${value.length} selected questions?`)) onChange([]);
  }
  function togglePreview(id: string, img: string | undefined) {
    const opening = !openRows.has(id);
    setOpenRows((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    if (opening && img) void images.sign([img]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={LABEL}>Selected</span>
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-cyan">
          <Timer size={12} className="shrink-0" />
          <span className="min-w-0">{summary.count} Q · {summary.marks} {summary.marks === 1 ? "mark" : "marks"} · ~{summary.minutes} min{summary.mix ? ` · ${summary.mix}` : ""}</span>
        </span>
        {value.length ? (
          <button type="button" onClick={clearAll} className="ml-auto text-xs text-dust hover:text-signal hover:underline">Clear all</button>
        ) : null}
      </div>
      {value.length ? (
        <ol className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/10">
          {value.map((id, i) => {
            const q = ENTRY_BY_ID.get(id)?.q;
            return (
              <li key={id} draggable
                onDragStart={(e: DragEvent<HTMLLIElement>) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }}
                onDragOver={(e: DragEvent<HTMLLIElement>) => { if (dragFrom !== null) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                onDrop={(e: DragEvent<HTMLLIElement>) => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }}
                onDragEnd={() => setDragFrom(null)}
                className={"px-2 py-1.5 " + (dragFrom === i ? "opacity-40" : "")}>
                <div className="flex items-center gap-1.5">
                  <GripVertical size={14} className="hidden shrink-0 cursor-grab text-dust sm:block" aria-hidden />
                  <span className="w-6 shrink-0 text-right font-mono text-[10px] text-dust">{i + 1}</span>
                  <button type="button" onClick={() => togglePreview(id, q?.img)} disabled={!q} aria-expanded={openRows.has(id)} className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate font-mono text-[11px] text-fog">{q?.ref ?? id}</span>
                    <span className="truncate text-xs text-dust">{q ? `${q.topic || "Untagged"} · ${q.level} · [${q.marks ?? "–"}]` : "Not in the question bank"}</span>
                  </button>
                  <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></IconButton>
                  <IconButton label="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></IconButton>
                  <IconButton label="Remove" onClick={() => onChange(value.filter((x) => x !== id))}><X size={14} /></IconButton>
                </div>
                {q && openRows.has(id) ? <Preview path={q.img} alt={q.ref} images={images} /> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-xs text-dust">No questions selected yet. Add them from the list below.</p>
      )}
    </div>
  );
}

function ResultRow({ entry, selected, open, blockedReason, onToggle, onPreview, images }: {
  entry: Entry; selected: boolean; open: boolean; blockedReason: string;
  onToggle: () => void; onPreview: () => void; images: SignedImages;
}) {
  const q = entry.q;
  return (
    <li className={"px-2.5 py-2 " + (selected ? "bg-cyan/[0.06]" : "")}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPreview} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight size={14} className={"shrink-0 text-dust transition " + (open ? "rotate-90" : "")} />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[11px] text-fog">{q.ref}</span>
            <span className="block truncate text-xs text-dust">{q.topic || "Untagged"}</span>
          </span>
        </button>
        <span className={"shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] " + (q.level === "LOT" ? "border-emerald2/40 text-emerald2" : "border-magenta/40 text-magenta")}>{q.level}</span>
        <span className="w-7 shrink-0 text-right font-mono text-[10px] text-dust">[{q.marks ?? "–"}]</span>
        <button type="button" onClick={onToggle} disabled={!selected && !!blockedReason} aria-pressed={selected}
          aria-label={`${selected ? "Remove" : "Add"} ${q.ref}`} title={selected ? "Remove from selection" : blockedReason || "Add to selection"}
          className={"grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-30 " + (selected ? "border-cyan bg-cyan text-abyss" : "border-white/15 text-fog hover:border-cyan hover:text-cyan")}>
          {selected ? <Check size={14} /> : <Plus size={14} />}
        </button>
      </div>
      {open ? <Preview path={q.img} alt={q.ref} images={images} /> : null}
    </li>
  );
}

function Preview({ path, alt, images }: { path: string; alt: string; images: SignedImages }) {
  const url = images.urls[path];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} loading="lazy" draggable={false} onError={() => images.markBroken(path)} className="mt-2 w-full rounded-lg border border-white/10 bg-white" />
    );
  }
  if (images.failed[path]) {
    return (
      <p className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-dust">
        <ImageOff size={14} className="shrink-0" /> Preview unavailable
        <button type="button" onClick={() => void images.sign([path], true)} className="ml-auto inline-flex items-center gap-1 text-cyan hover:underline"><RotateCcw size={12} /> Retry</button>
      </p>
    );
  }
  return <p className="mt-2 flex items-center gap-2 px-1 text-xs text-dust"><Loader2 size={13} className="animate-spin" /> Loading preview…</p>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={"rounded-full border px-3 py-1 text-xs transition " + (on ? "border-cyan bg-cyan font-semibold text-space" : "border-white/15 text-fog hover:border-cyan")}>
      {children}
    </button>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-dust transition hover:bg-white/[0.06] hover:text-ice disabled:pointer-events-none disabled:opacity-25">
      {children}
    </button>
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 transition hover:text-ice disabled:pointer-events-none disabled:opacity-30">
      {children}
    </button>
  );
}
