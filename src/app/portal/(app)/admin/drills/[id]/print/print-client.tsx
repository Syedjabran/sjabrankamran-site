"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Printer, Eye, EyeOff, AlertTriangle } from "lucide-react";

type SnapQ = {
  id: string; ref: string; paperType: string; code: string; qnum: number;
  topic: string | null; level: string; marks: number | null;
  img: string; ms_img: string | null; answer: string | null;
};
type DrillFull = {
  id: string; ref?: string; name: string; mode: string; totalMarks: number;
  targetType: string; scopeLabel: string | null; classId: string | null; className: string | null;
  studentCount: number; createdByName: string; createdAt: number; snapshot: SnapQ[];
};

const MODE_LABEL: Record<string, string> = {
  assignment_help: "Assignment · help allowed",
  assignment_nohelp: "Assignment · no help",
  test: "Proctored test",
};

/** Records written before reference numbers existed simply have no reference. */
function refOf(r: { ref?: string } | null) { return r && typeof r.ref === "string" && r.ref ? r.ref : ""; }
function when(ts: number) { return new Date(ts).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }); }

/** The asset endpoint signs at most 80 paths per call, so long papers chunk. */
async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 80) {
    const chunk = paths.slice(i, i + 80);
    if (!chunk.length) continue;
    try {
      const res = await fetch("/api/exam-lab/asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paths: chunk }),
      });
      const j = await res.json();
      Object.assign(out, j.urls || {});
    } catch { /* an unsigned path just renders as "image unavailable" */ }
  }
  return out;
}

/**
 * Wait for every image inside the sheet to finish loading (or fail) before the
 * print dialog opens — a print fired while images are still in flight comes out
 * with blank boxes where the questions should be. Capped so one dead image can
 * never hold the dialog hostage.
 */
async function imagesSettled(root: HTMLElement | null, timeoutMs = 20000): Promise<void> {
  if (!root) return;
  const pending = Array.from(root.querySelectorAll("img")).filter((im) => !(im.complete && im.naturalWidth > 0));
  if (!pending.length) return;
  const all = Promise.all(pending.map((im) => new Promise<void>((resolve) => {
    const done = () => { im.removeEventListener("load", done); im.removeEventListener("error", done); resolve(); };
    im.addEventListener("load", done);
    im.addEventListener("error", done);
  })));
  await Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

export function DrillPrintClient({ idOrRef }: { idOrRef: string }) {
  const [rec, setRec] = useState<DrillFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imgs, setImgs] = useState<Record<string, string>>({});
  // Answers are OFF by default: the first thing a teacher prints must be a
  // clean student-facing paper.
  const [withMs, setWithMs] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const msRequested = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/portal/admin/drills/${encodeURIComponent(idOrRef)}`);
        const j = await res.json();
        if (!res.ok || !j.record) { if (alive) setError(j.error || "Drill record not found."); return; }
        if (!alive) return;
        const record = j.record as DrillFull;
        setRec(record);
        const paths = [...new Set(record.snapshot.map((q) => q.img).filter(Boolean))];
        const urls = await signPaths(paths);
        if (alive) setImgs((m) => ({ ...m, ...urls }));
      } catch {
        if (alive) setError("Could not load this drill. Check your connection and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [idOrRef]);

  // Mark-scheme images are signed only once staff actually ask for them.
  useEffect(() => {
    if (!withMs || !rec || msRequested.current) return;
    msRequested.current = true;
    let alive = true;
    (async () => {
      setMsLoading(true);
      const paths = [...new Set(rec.snapshot.map((q) => q.ms_img).filter((p): p is string => !!p))];
      const urls = paths.length ? await signPaths(paths) : {};
      if (alive) { setImgs((m) => ({ ...m, ...urls })); setMsLoading(false); }
    })();
    return () => { alive = false; };
  }, [withMs, rec]);

  const printNow = useCallback(async () => {
    setPreparing(true);
    try {
      await imagesSettled(sheetRef.current);
      // One frame for the freshly-decoded images to lay out.
      await new Promise((r) => setTimeout(r, 120));
      window.print();
    } finally {
      setPreparing(false);
    }
  }, []);

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={15} className="animate-spin" /> Loading drill paper…</p>;
  }
  if (error || !rec) {
    return (
      <div className="space-y-4">
        <Link href="/portal/admin/drills" className="inline-flex items-center gap-1.5 text-sm text-cyan hover:underline"><ChevronLeft size={15} /> All drill records</Link>
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5 text-sm text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error || "Drill record not found."}</span>
        </div>
      </div>
    );
  }

  const ref = refOf(rec);
  const scope = rec.className || rec.scopeLabel || (rec.targetType === "network" ? "Whole network" : rec.targetType);
  const msAvailable = rec.snapshot.some((q) => !!q.ms_img || !!q.answer);

  return (
    <div className="space-y-5">
      {/* ---- controls (never printed) ---- */}
      <div className="el-noprint space-y-4">
        <Link href="/portal/admin/drills" className="inline-flex items-center gap-1.5 text-sm text-cyan hover:underline"><ChevronLeft size={15} /> All drill records</Link>
        <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
          <h1 className="font-display text-xl text-ice">Print / download this drill</h1>
          <p className="mt-1 text-sm text-dust">
            Press <b className="text-fog">Print / Save as PDF</b> and choose <b className="text-fog">Save as PDF</b> as the destination in your browser&rsquo;s print dialog —
            that is where the download comes from, on desktop, iPad and Android alike. No separate download button is needed.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={printNow} disabled={preparing || msLoading} className="btn-primary !py-2.5 text-sm disabled:opacity-50">
              {preparing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              {preparing ? "Preparing pages…" : "Print / Save as PDF"}
            </button>
            <button
              onClick={() => setWithMs((v) => !v)}
              disabled={!msAvailable}
              className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition disabled:opacity-40 " + (withMs ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 text-fog hover:border-cyan/40 hover:text-cyan")}
              title={msAvailable ? "Include or exclude the mark scheme" : "No mark scheme is stored for this paper"}
            >
              {withMs ? <Eye size={15} /> : <EyeOff size={15} />}
              {withMs ? "Mark scheme INCLUDED" : "Mark scheme excluded"}
            </button>
            {msLoading ? <span className="inline-flex items-center gap-1.5 text-xs text-dust"><Loader2 size={13} className="animate-spin" /> loading mark scheme…</span> : null}
          </div>
          <p className={"mt-3 text-xs " + (withMs ? "text-amber-300" : "text-dust")}>
            {withMs
              ? "Answers WILL be printed — the mark scheme is added as its own section starting on a new page. Turn it off to hand students a clean paper."
              : "Answers are excluded. What prints is a clean, student-facing question paper."}
          </p>
        </div>
      </div>

      {/* ---- the paper itself: white sheet, black text, on screen and in print ---- */}
      <div ref={sheetRef} className="el-print-sheet mx-auto w-full max-w-[860px] rounded-2xl bg-white p-8 text-black shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] print:rounded-none">
        <header className="el-print-head el-print-rule border-b-2 border-black/80 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold leading-tight text-black">{rec.name}</h2>
              <p className="mt-1 text-sm text-black/70">{MODE_LABEL[rec.mode] || rec.mode}</p>
            </div>
            {ref ? (
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Reference</p>
                <p className="font-mono text-lg font-bold text-black">{ref}</p>
              </div>
            ) : null}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-4">
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-black/50">Class / scope</dt><dd className="font-semibold text-black">{scope}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-black/50">Conducted by</dt><dd className="font-semibold text-black">{rec.createdByName || "—"}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-black/50">Date</dt><dd className="font-semibold text-black">{when(rec.createdAt)}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-widest text-black/50">Paper</dt><dd className="font-semibold text-black">{rec.snapshot.length} questions · {rec.totalMarks} marks</dd></div>
          </dl>
          <div className="el-print-rule mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/20 pt-3 text-[13px] text-black/70">
            <span>Name: <span className="inline-block w-48 border-b border-black/40">&nbsp;</span></span>
            <span>Class: <span className="inline-block w-28 border-b border-black/40">&nbsp;</span></span>
            <span>Date: <span className="inline-block w-28 border-b border-black/40">&nbsp;</span></span>
          </div>
        </header>

        <ol className="mt-6 space-y-7">
          {rec.snapshot.map((q, i) => (
            <li key={`${q.id}-${i}`} className="el-print-q">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-base font-bold text-black">{i + 1}.</span>
                <span className="font-mono text-[11px] text-black/60">{q.paperType}{q.ref ? ` · ${q.ref}` : ""}</span>
                {q.topic ? <span className="font-mono text-[11px] text-black/60">· {q.topic}</span> : null}
                <span className="font-mono text-[11px] text-black/60">· {q.level}</span>
                {q.marks != null ? <span className="ml-auto font-mono text-[12px] font-bold text-black">[{q.marks}]</span> : null}
              </div>
              <div className="mt-2">
                {imgs[q.img] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgs[q.img]}
                    alt={`Question ${i + 1}${q.ref ? ` (${q.ref})` : ""}`}
                    className="w-full max-w-full bg-white"
                    /* never lazy: an image below the fold that has not loaded prints blank */
                    loading="eager"
                    decoding="sync"
                  />
                ) : (
                  <p className="border border-dashed border-black/30 p-4 text-center text-xs text-black/50">Question image unavailable</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {withMs ? (
          <section className="el-print-newpage mt-10">
            <h3 className="el-print-rule border-b-2 border-black/80 pb-2 font-display text-xl font-bold text-black">
              Mark scheme — {rec.name}{ref ? ` · ${ref}` : ""}
            </h3>
            <p className="mt-2 text-[12px] text-black/60">Staff copy. Do not hand this section to students.</p>
            <ol className="mt-5 space-y-6">
              {rec.snapshot.map((q, i) => (
                <li key={`ms-${q.id}-${i}`} className="el-print-q">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-display text-base font-bold text-black">{i + 1}.</span>
                    <span className="font-mono text-[11px] text-black/60">{q.ref || q.paperType}</span>
                    {q.answer ? <span className="font-mono text-[13px] font-bold text-black">Answer: {q.answer}</span> : null}
                    {q.marks != null ? <span className="ml-auto font-mono text-[12px] font-bold text-black">[{q.marks}]</span> : null}
                  </div>
                  {q.ms_img ? (
                    imgs[q.ms_img] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgs[q.ms_img]} alt={`Mark scheme ${i + 1}`} className="mt-2 w-full max-w-full bg-white" loading="eager" decoding="sync" />
                    ) : (
                      <p className="mt-2 border border-dashed border-black/30 p-3 text-center text-xs text-black/50">{msLoading ? "Loading…" : "Mark-scheme image unavailable"}</p>
                    )
                  ) : !q.answer ? (
                    <p className="mt-2 text-xs text-black/50">No mark scheme stored for this question.</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <footer className="el-print-rule mt-8 border-t border-black/20 pt-3 text-center font-mono text-[10px] text-black/50">
          {ref ? `${ref} · ` : ""}{rec.snapshot.length} questions · {rec.totalMarks} marks · generated from the stored drill record
        </footer>
      </div>
    </div>
  );
}
