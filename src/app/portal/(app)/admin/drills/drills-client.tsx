"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Users, School, Clock3, FileText, ChevronLeft, Loader2, Hash, Printer, Search, CheckCircle2, AlertTriangle, Inbox } from "lucide-react";

type Row = {
  id: string; ref?: string; allocationId: string; name: string; mode: string;
  totalMarks: number; targetType: string; scopeLabel: string | null;
  classId: string | null; className: string | null; classIds: string[];
  studentCount: number; createdBy: string; createdByName: string; createdAt: number; questionCount: number;
};
type SnapQ = { id: string; ref: string; paperType: string; code: string; qnum: number; topic: string | null; level: string; marks: number | null; img: string; ms_img: string | null; answer: string | null };
type DrillFull = Row & { snapshot: SnapQ[] };
type SubRow = { uid: string; name: string; status: string; lateSubmission: boolean; unattempted: boolean; daily: boolean; startedAt?: number | null; completedAt: number | null };

const POLL_MS = 15_000;

function when(ts: number) { return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
function statusLabel(s: SubRow) {
  if (s.status === "submitted") return s.lateSubmission ? "submitted late" : "submitted";
  return s.status === "in_progress" ? "in progress" : s.status;
}

/**
 * Keep a staff view live: re-run `refresh` every 15 s while the tab is
 * visible, and at once when the tab regains visibility or focus. Returns when
 * data last arrived, for the "updated Ns ago" label.
 */
function useLiveRefresh(refresh: () => Promise<boolean>, enabled = true) {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const busy = useRef(false);
  const run = useCallback(async () => {
    if (busy.current || document.visibilityState === "hidden") return;
    busy.current = true;
    try { if (await refresh()) setUpdatedAt(Date.now()); } finally { busy.current = false; }
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    const iv = window.setInterval(run, POLL_MS);
    const onShow = () => { if (document.visibilityState === "visible") void run(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow); };
  }, [run, enabled]);
  const markUpdated = useCallback(() => setUpdatedAt(Date.now()), []);
  return { updatedAt, markUpdated };
}

function UpdatedAgo({ at }: { at: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(iv); }, []);
  if (at === null) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  return <span className="font-mono text-[10px] text-dust">updated {s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`}</span>;
}
/** Records written before reference numbers existed simply show no chip. */
function refOf(r: { ref?: string }) { return typeof r.ref === "string" && r.ref ? r.ref : ""; }
/** The printable view is addressable by reference when there is one. */
function printHref(r: { id: string; ref?: string }) { return `/portal/admin/drills/${encodeURIComponent(refOf(r) || r.id)}/print`; }
const MODE_LABEL: Record<string, string> = { assignment_help: "Assignment · help", assignment_nohelp: "Assignment · no help", test: "Proctored test" };
const TARGET_ICON: Record<string, ReactNode> = { class: <Users size={12} />, group: <Users size={12} />, school: <School size={12} />, network: <School size={12} />, individual: <Users size={12} /> };

export function DrillRecordsClient({ scoped = false }: { scoped?: boolean }) {
  const router = useRouter();
  const [lookup, setLookup] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<DrillFull | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [subsRoster, setSubsRoster] = useState(true);
  const openIdRef = useRef<string | null>(null); // drops a late response for a drill no longer open

  const loadList = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/admin/drills", { cache: "no-store" });
      if (!r.ok) return false;
      const j = await r.json();
      setRows(j.items || []);
      return true;
    } catch { return false; } finally { setLoading(false); }
  }, []);

  // Per-student submission status with the late / unattempted integrity
  // badges; a failed refresh keeps the last list on screen.
  const loadSubs = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/portal/admin/drills/${encodeURIComponent(id)}/submissions`, { cache: "no-store" });
      if (!r.ok) return false;
      const j = await r.json();
      if (openIdRef.current !== id) return false;
      setSubs((j.items || []) as SubRow[]);
      setSubsRoster(j.roster !== false);
      return true;
    } catch { return false; }
  }, []);

  // Live while the tab is visible: the open drill's submissions, else the list.
  const openId = open?.id ?? null;
  const refresh = useCallback(() => (openId ? loadSubs(openId) : loadList()), [openId, loadSubs, loadList]);
  const { updatedAt, markUpdated } = useLiveRefresh(refresh);

  useEffect(() => {
    void loadList().then((ok) => { if (ok) markUpdated(); });
  }, [loadList, markUpdated]);

  const view = useCallback(async (id: string) => {
    openIdRef.current = id;
    setOpenLoading(true); setImgs({}); setSubs(null);
    // Fetched in parallel with the paper; failures stay silent.
    void loadSubs(id).then((ok) => { if (ok) markUpdated(); });
    try {
      const j = await (await fetch(`/api/portal/admin/drills/${encodeURIComponent(id)}`, { cache: "no-store" })).json();
      if (j.record) {
        setOpen(j.record);
        const paths = [...new Set((j.record.snapshot as SnapQ[]).map((q) => q.img).filter(Boolean))].slice(0, 80);
        if (paths.length) {
          const s = await (await fetch("/api/exam-lab/asset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }) })).json();
          setImgs(s.urls || {});
        }
      }
    } catch { /* ignore */ } finally { setOpenLoading(false); }
  }, []);

  if (open) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => { openIdRef.current = null; setOpen(null); void loadList().then((ok) => { if (ok) markUpdated(); }); }} className="inline-flex items-center gap-1.5 text-sm text-cyan hover:underline"><ChevronLeft size={15} /> All drill records</button>
          <Link href={printHref(open)} className="btn-ghost !px-4 !py-2 text-xs"><Printer size={14} /> Print / Save as PDF</Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
          <h1 className="font-display text-2xl text-ice">{open.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
            {refOf(open) ? <span className="inline-flex items-center gap-1 rounded-full border border-lime2/40 px-2.5 py-0.5 text-lime2"><Hash size={11} /> {refOf(open)}</span> : null}
            <span className="rounded-full border border-cyan/30 px-2.5 py-0.5 text-cyan">{MODE_LABEL[open.mode] || open.mode}</span>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-fog inline-flex items-center gap-1">{TARGET_ICON[open.targetType]} {open.scopeLabel || open.targetType}</span>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-fog">{open.snapshot.length} questions · {open.totalMarks} marks</span>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-fog inline-flex items-center gap-1"><Users size={11} /> {open.studentCount} students</span>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-dust inline-flex items-center gap-1"><Clock3 size={11} /> {when(open.createdAt)}</span>
          </div>
          <p className="mt-2 text-xs text-dust">Conducted for: <b className="text-fog">{open.className || open.scopeLabel || (open.targetType === "network" ? "Whole network" : open.targetType)}</b> · set by {open.createdByName}</p>
        </div>

        {/* Per-student submission status with late / unattempted badges */}
        {subsRoster ? (
          <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg text-ice"><Inbox size={16} className="text-cyan" /> Submissions <UpdatedAgo at={subs ? updatedAt : null} /></h2>
              {subs ? (
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-fog">{subs.length} students</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald2/40 px-2 py-0.5 text-emerald2"><CheckCircle2 size={10} /> {subs.filter((s) => s.status === "submitted" && !s.lateSubmission && !s.unattempted).length} on time</span>
                  <span className="rounded-full border border-signal/50 px-2 py-0.5 text-signal">{subs.filter((s) => s.lateSubmission).length} late</span>
                  <span className="rounded-full border border-amber-400/50 px-2 py-0.5 text-amber-300">{subs.filter((s) => s.unattempted).length} unattempted</span>
                  <span className="rounded-full border border-cyan/40 px-2 py-0.5 text-cyan">{subs.filter((s) => s.status === "in_progress").length} in progress</span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-dust">{subs.filter((s) => s.status === "pending").length} pending</span>
                </div>
              ) : null}
            </div>
            {!subs ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading submission statuses…</p>
            ) : !subs.length ? (
              <p className="mt-3 text-sm text-dust">No active students found for this drill.</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/[0.06]">
                {subs.map((s) => (
                  <li key={s.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm text-fog">{s.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                      {s.lateSubmission ? <span className="rounded-full border border-signal/50 px-2 py-0.5 text-signal">Late submission</span> : null}
                      {s.unattempted ? <span className="rounded-full border border-amber-400/50 px-2 py-0.5 text-amber-300" title="No answers were attempted — earns no points">Unattempted</span> : null}
                      <span className={"rounded-full border px-2 py-0.5 " + (s.status === "submitted" ? "border-emerald2/40 text-emerald2" : s.status === "in_progress" ? "border-cyan/40 text-cyan" : s.status === "locked" ? "border-red-400/40 text-red-300" : s.status === "pending" ? "border-white/15 text-dust" : "border-white/25 text-fog")}>
                        {statusLabel(s)}
                      </span>
                      {s.completedAt ? <span className="text-dust">{when(s.completedAt)}</span> : s.status === "in_progress" && s.startedAt ? <span className="text-dust">started {when(s.startedAt)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="text-xs text-dust">Per-student submission status is not available for this drill: it was assigned to individual students before recipients were recorded.</p>
        )}
        {openLoading ? <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading paper…</p> : null}
        <ol className="space-y-4">
          {open.snapshot.map((q, i) => (
            <li key={`${q.id}-${i}`} className="rounded-2xl border border-white/10 bg-space/60 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="grid h-6 w-6 place-items-center rounded-lg border border-white/15 text-ice">{i + 1}</span>
                <span className="rounded-full border border-cyan/30 px-2 py-0.5 text-cyan">{q.paperType}</span>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-fog">{q.ref}</span>
                {q.topic ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-dust">{q.topic}</span> : null}
                <span className={"rounded-full border px-2 py-0.5 " + (q.level === "HOT" ? "border-magenta/40 text-magenta" : "border-emerald2/40 text-emerald2")}>{q.level}</span>
                {q.marks != null ? <span className="ml-auto text-dust">[{q.marks}]</span> : null}
                {q.answer ? <span className="rounded-full border border-lime2/40 px-2 py-0.5 text-lime2">Ans {q.answer}</span> : null}
              </div>
              {imgs[q.img] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgs[q.img]} alt={q.ref} className="w-full rounded-lg border border-white/10 bg-white" loading="lazy" />
              ) : (
                <p className="text-xs text-dust">{openLoading ? "…" : "Image unavailable"}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><Layers size={18} /></span>
        <div>
          <h1 className="flex flex-wrap items-baseline gap-2 font-display text-2xl text-ice">Drill Records <UpdatedAgo at={updatedAt} /></h1>
          <p className="text-sm text-dust">
            {scoped
              ? "Drills you conducted and drills set for your classes — each with its exact question paper, kept on record."
              : "Every Exam Lab drill or paper allotted — with its exact question paper, kept on record."}
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); const v = lookup.trim().toUpperCase(); if (v) router.push(`/portal/admin/drills/${encodeURIComponent(v)}/print`); }}
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-space/60 p-3"
      >
        <Search size={14} className="ml-1 text-dust" />
        <input
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
          placeholder="DR-2609-K7QM"
          aria-label="Open a drill by its reference number"
          className="min-w-[10rem] flex-1 bg-transparent font-mono text-sm uppercase text-ice placeholder:text-dust/60 focus:outline-none"
        />
        <button type="submit" className="btn-ghost !px-4 !py-1.5 text-xs"><Printer size={13} /> Open paper by reference</button>
      </form>
      {loading ? <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        : !rows.length ? <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-dust">No drills recorded yet. Allot a drill or paper from <b className="text-fog">Post / Tests → Exam Lab</b> and it will be stored here with its paper.</div>
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              // The print link is a sibling of the open-button, not a child:
              // an anchor nested inside a button is invalid markup.
              <div key={r.id} className="flex flex-col rounded-2xl border border-white/10 bg-space/60 transition hover:border-cyan/40">
                <button onClick={() => view(r.id)} className="flex-1 p-4 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-base text-ice">{r.name}</p>
                    <span className="rounded-full border border-cyan/25 px-2 py-0.5 font-mono text-[10px] text-cyan">{MODE_LABEL[r.mode] || r.mode}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px] text-dust">
                    {refOf(r) ? <span className="inline-flex items-center gap-1 rounded-full border border-lime2/40 px-2 py-0.5 text-lime2"><Hash size={10} /> {refOf(r)}</span> : null}
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5">{TARGET_ICON[r.targetType]} {r.scopeLabel || r.targetType}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">{r.questionCount} Qs · {r.totalMarks} marks</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5"><Users size={10} /> {r.studentCount}</span>
                  </div>
                  <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-dust"><FileText size={11} /> View stored paper · {when(r.createdAt)}</p>
                </button>
                <div className="flex justify-end border-t border-white/10 px-4 py-2">
                  <Link href={printHref(r)} className="inline-flex items-center gap-1.5 text-[11px] text-fog transition hover:text-cyan"><Printer size={11} /> Print / Save as PDF</Link>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
