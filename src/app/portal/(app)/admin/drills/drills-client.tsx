"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Layers, Users, School, Clock3, FileText, ChevronLeft, Loader2, Hash } from "lucide-react";

type Row = {
  id: string; ref?: string; allocationId: string; name: string; mode: string;
  totalMarks: number; targetType: string; scopeLabel: string | null;
  classId: string | null; className: string | null; classIds: string[];
  studentCount: number; createdBy: string; createdByName: string; createdAt: number; questionCount: number;
};
type SnapQ = { id: string; ref: string; paperType: string; code: string; qnum: number; topic: string | null; level: string; marks: number | null; img: string; ms_img: string | null; answer: string | null };
type DrillFull = Row & { snapshot: SnapQ[] };

function when(ts: number) { return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
/** Records written before reference numbers existed simply show no chip. */
function refOf(r: { ref?: string }) { return typeof r.ref === "string" && r.ref ? r.ref : ""; }
const MODE_LABEL: Record<string, string> = { assignment_help: "Assignment · help", assignment_nohelp: "Assignment · no help", test: "Proctored test" };
const TARGET_ICON: Record<string, ReactNode> = { class: <Users size={12} />, group: <Users size={12} />, school: <School size={12} />, network: <School size={12} />, individual: <Users size={12} /> };

export function DrillRecordsClient({ scoped = false }: { scoped?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<DrillFull | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [imgs, setImgs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/portal/admin/drills").then((r) => r.json()).then((j) => setRows(j.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const view = useCallback(async (id: string) => {
    setOpenLoading(true); setImgs({});
    try {
      const j = await (await fetch(`/api/portal/admin/drills/${id}`)).json();
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
        <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 text-sm text-cyan hover:underline"><ChevronLeft size={15} /> All drill records</button>
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
          <h1 className="font-display text-2xl text-ice">Drill Records</h1>
          <p className="text-sm text-dust">
            {scoped
              ? "Drills you conducted and drills set for your classes — each with its exact question paper, kept on record."
              : "Every Exam Lab drill or paper allotted — with its exact question paper, kept on record."}
          </p>
        </div>
      </div>
      {loading ? <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        : !rows.length ? <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-dust">No drills recorded yet. Allot a drill or paper from <b className="text-fog">Post / Tests → Exam Lab</b> and it will be stored here with its paper.</div>
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <button key={r.id} onClick={() => view(r.id)} className="rounded-2xl border border-white/10 bg-space/60 p-4 text-left transition hover:border-cyan/40">
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
            ))}
          </div>
        )}
    </div>
  );
}
