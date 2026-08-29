"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, Keyboard, Paperclip, Eraser, Trash2, Save, Loader2, FileText, Check } from "lucide-react";

type Mode = "type" | "write" | "attach";
type Upload = { name: string; url: string | null; kind: string };

async function upload(kind: string, qid: string, code: string, file: File | Blob, filename: string): Promise<Upload> {
  const fd = new FormData();
  fd.append("kind", kind); fd.append("qid", qid); fd.append("code", code);
  fd.append("file", file, filename);
  const r = await fetch("/api/exam-lab/answer-upload", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Upload failed");
  return { name: j.name || filename, url: j.url, kind };
}

/**
 * Structured-answer pad for Paper 2 / Paper 4: type an answer, WRITE directly on
 * the question paper (canvas over the exact past-paper image), or attach a
 * PDF/Word answer. Drawings + attachments are stored in the answer-scripts
 * bucket via /api/exam-lab/answer-upload.
 */
export function AnswerPad({ value, onChange, imageUrl, qid, code, disabled, onModeChange }: {
  value: string; onChange: (v: string) => void; imageUrl?: string; qid: string; code: string; disabled?: boolean;
  onModeChange?: (m: Mode) => void;
}) {
  const [mode, setModeState] = useState<Mode>("type");
  const setMode = (m: Mode) => { setModeState(m); onModeChange?.(m); };
  const [uploads, setUploads] = useState<Upload[]>([]);
  const push = (u: Upload) => setUploads((p) => [...p, u]);

  return (
    <div className="mt-3">
      <div className="mb-2 inline-flex rounded-xl border border-white/10 bg-abyss/60 p-0.5 text-xs el-noprint">
        {([["type", "Type", <Keyboard key="t" size={13} />], ["write", "Write on paper", <PenLine key="w" size={13} />], ["attach", "Attach", <Paperclip key="a" size={13} />]] as [Mode, string, React.ReactNode][]).map(([m, label, icon]) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 " + (mode === m ? "bg-cyan/15 text-cyan" : "text-dust hover:text-ice")}>
            {icon} {label}
          </button>
        ))}
      </div>

      {mode === "type" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          placeholder="Write your answer / working here…"
          className="min-h-28 w-full resize-y rounded-xl border border-white/15 bg-void px-3.5 py-3 text-sm text-ice el-noprint" />
      ) : mode === "write" ? (
        imageUrl ? <WriteCanvas imageUrl={imageUrl} qid={qid} code={code} onSaved={push} /> : <p className="text-xs text-dust">Question image still loading…</p>
      ) : (
        <AttachUploader qid={qid} code={code} onUploaded={push} />
      )}

      {uploads.length ? (
        <ul className="mt-2 space-y-1 el-noprint">
          {uploads.map((u, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-emerald2/25 bg-emerald2/[0.05] px-3 py-1.5 text-xs">
              <Check size={13} className="shrink-0 text-emerald2" />
              <span className="min-w-0 flex-1 truncate text-fog">{u.kind === "drawing" ? "Answer sheet saved" : u.name}</span>
              {u.url ? <a href={u.url} target="_blank" rel="noreferrer" className="shrink-0 text-cyan hover:underline">view</a> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WriteCanvas({ imageUrl, qid, code, onSaved }: { imageUrl: string; qid: string; code: string; onSaved: (u: Upload) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#1436d6");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Load the past-paper image as a same-origin blob (avoids canvas taint on save).
  useEffect(() => {
    let cancelled = false; let objUrl = "";
    (async () => {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        objUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          const wrap = wrapRef.current; const base = baseRef.current; const ink = inkRef.current;
          if (!wrap || !base || !ink) return;
          const w = Math.min(wrap.clientWidth || 640, img.naturalWidth);
          const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
          for (const c of [base, ink]) { c.width = w; c.height = h; c.style.width = w + "px"; c.style.height = h + "px"; }
          const bctx = base.getContext("2d"); if (bctx) bctx.drawImage(img, 0, 0, w, h);
          setReady(true);
        };
        img.src = objUrl;
      } catch { setErr("Could not load the paper for drawing."); }
    })();
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [imageUrl]);

  const pos = (e: React.PointerEvent) => {
    const r = inkRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (inkRef.current!.width / r.width), y: (e.clientY - r.top) * (inkRef.current!.height / r.height) };
  };
  const down = (e: React.PointerEvent) => { if (!ready) return; drawing.current = true; last.current = pos(e); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = inkRef.current!.getContext("2d"); if (!ctx) return;
    const p = pos(e); const l = last.current || p;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (tool === "eraser") { ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = 24; }
    else { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = color; ctx.lineWidth = 3; }
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clearInk = () => { const c = inkRef.current; const ctx = c?.getContext("2d"); if (c && ctx) ctx.clearRect(0, 0, c.width, c.height); };

  const save = useCallback(async () => {
    const base = baseRef.current; const ink = inkRef.current; if (!base || !ink) return;
    setBusy(true); setErr("");
    try {
      const out = document.createElement("canvas"); out.width = base.width; out.height = base.height;
      const ctx = out.getContext("2d"); if (!ctx) throw new Error("no ctx");
      ctx.drawImage(base, 0, 0); ctx.drawImage(ink, 0, 0);
      const blob: Blob = await new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
      const u = await upload("drawing", qid, code, blob, `${qid}.png`);
      onSaved(u);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, [qid, code, onSaved]);

  return (
    <div className="el-noprint">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setTool("pen")} className={"inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs " + (tool === "pen" ? "border-cyan/60 text-cyan" : "border-white/10 text-dust hover:text-ice")}><PenLine size={12} /> Pen</button>
        <button type="button" onClick={() => setTool("eraser")} className={"inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs " + (tool === "eraser" ? "border-cyan/60 text-cyan" : "border-white/10 text-dust hover:text-ice")}><Eraser size={12} /> Eraser</button>
        {(["#1436d6", "#111111", "#d61436"]).map((c) => (
          <button key={c} type="button" onClick={() => { setTool("pen"); setColor(c); }} aria-label={"ink " + c} className={"h-6 w-6 rounded-full border-2 " + (color === c && tool === "pen" ? "border-cyan" : "border-white/20")} style={{ background: c }} />
        ))}
        <button type="button" onClick={clearInk} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-dust hover:text-signal"><Trash2 size={12} /> Clear</button>
        <button type="button" onClick={save} disabled={busy || !ready} className="btn-primary ml-auto !px-3 !py-1.5 text-xs">{busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save answer sheet</button>
      </div>
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg border border-white/15 bg-white">
        <canvas ref={baseRef} className="block w-full" />
        <canvas ref={inkRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
          className="absolute left-0 top-0 touch-none" style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }} />
        {!ready ? <div className="grid h-40 place-items-center text-xs text-dust">Loading paper…</div> : null}
      </div>
      {err ? <p className="mt-1 text-xs text-signal">{err}</p> : null}
      <p className="mt-1 text-[11px] text-dust">Write your answer directly in the paper&apos;s answer spaces, then <b>Save answer sheet</b>. It&apos;s stored for your teacher.</p>
    </div>
  );
}

function AttachUploader({ qid, code, onUploaded }: { qid: string; code: string; onUploaded: (u: Upload) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setErr("");
    try { for (const f of Array.from(files)) onUploaded(await upload("attachment", qid, code, f, f.name)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="el-noprint">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan/30 bg-abyss/40 px-4 py-6 text-sm text-fog hover:border-cyan/60 hover:text-cyan">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} {busy ? "Uploading…" : "Attach your answer (PDF, Word or image)"}
        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" multiple className="hidden" disabled={busy} onChange={(e) => pick(e.target.files)} />
      </label>
      {err ? <p className="mt-1 text-xs text-signal">{err}</p> : null}
    </div>
  );
}
