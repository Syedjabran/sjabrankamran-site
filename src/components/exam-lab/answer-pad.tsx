"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PenLine, Keyboard, Paperclip, Eraser, Trash2, Save, Loader2, FileText, Check,
  Highlighter, Undo2, Redo2, ZoomIn, ZoomOut, Hand, RotateCcw,
} from "lucide-react";

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

// ---------------------------------------------------------------------------
// Write mode: a stylus-aware, zoomable writing surface ("Samsung Notes"-class)
// ---------------------------------------------------------------------------

type Tool = "pen" | "highlighter" | "eraser" | "pan";
type LayerSnapshot = { ink: string; hl: string };

const PEN_COLORS = ["#1436d6", "#111111", "#d61436", "#0a8f3c", "#e08a1d", "#7a3fd6", "#0891b2"];
const HL_COLORS = ["#fde047", "#86efac", "#f9a8d4", "#93c5fd"];
const PEN_WIDTHS = [2, 3, 5, 8];
const ERASER_SIZES = [16, 24, 40];
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
const MAX_HISTORY = 20;

function WriteCanvas({ imageUrl, qid, code, onSaved }: { imageUrl: string; qid: string; code: string; onSaved: (u: Upload) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokeToolRef = useRef<Tool>("pen");
  const activePenId = useRef<number | null>(null);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const historyPushedForStroke = useRef(false);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1436d6");
  const [hlColor, setHlColor] = useState("#fde047");
  const [width, setWidth] = useState(3);
  const [eraserSize, setEraserSize] = useState(24);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Undo/redo history: capped stack of compact PNG data-URL snapshots of the
  // ink + highlighter layers (not raw ImageData, to keep memory bounded).
  const history = useRef<LayerSnapshot[]>([]);
  const redo = useRef<LayerSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistoryFlags = () => { setCanUndo(history.current.length > 0); setCanRedo(redo.current.length > 0); };

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
          const wrap = wrapRef.current; const base = baseRef.current; const hl = hlRef.current; const ink = inkRef.current;
          if (!wrap || !base || !hl || !ink) return;
          const w = Math.min(wrap.clientWidth || 640, img.naturalWidth);
          const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
          for (const c of [base, hl, ink]) { c.width = w; c.height = h; c.style.width = w + "px"; c.style.height = h + "px"; }
          const bctx = base.getContext("2d"); if (bctx) bctx.drawImage(img, 0, 0, w, h);
          setReady(true);
        };
        img.src = objUrl;
      } catch { setErr("Could not load the paper for drawing."); }
    })();
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [imageUrl]);

  // Map a pointer event's client coordinates to ink-canvas pixel coordinates.
  // getBoundingClientRect() already reflects any CSS zoom/pan transform on the
  // ancestor surface, so this stays correct at any zoom level without extra math.
  const pos = (e: React.PointerEvent) => {
    const r = inkRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (inkRef.current!.width / r.width),
      y: (e.clientY - r.top) * (inkRef.current!.height / r.height),
    };
  };

  const snapshot = (): LayerSnapshot => ({
    ink: inkRef.current?.toDataURL("image/png") || "",
    hl: hlRef.current?.toDataURL("image/png") || "",
  });
  const restore = (snap: LayerSnapshot) => {
    const ink = inkRef.current; const hl = hlRef.current;
    if (!ink || !hl) return;
    const ictx = ink.getContext("2d"); const hctx = hl.getContext("2d");
    if (ictx) ictx.clearRect(0, 0, ink.width, ink.height);
    if (hctx) hctx.clearRect(0, 0, hl.width, hl.height);
    if (snap.ink && ictx) { const im = new Image(); im.onload = () => ictx.drawImage(im, 0, 0); im.src = snap.ink; }
    if (snap.hl && hctx) { const im = new Image(); im.onload = () => hctx.drawImage(im, 0, 0); im.src = snap.hl; }
  };
  const pushHistory = () => {
    history.current.push(snapshot());
    if (history.current.length > MAX_HISTORY) history.current.shift();
    redo.current = [];
    syncHistoryFlags();
  };
  const undo = () => {
    if (!history.current.length) return;
    redo.current.push(snapshot());
    if (redo.current.length > MAX_HISTORY) redo.current.shift();
    const prev = history.current.pop()!;
    restore(prev);
    syncHistoryFlags();
  };
  const doRedo = () => {
    if (!redo.current.length) return;
    history.current.push(snapshot());
    if (history.current.length > MAX_HISTORY) history.current.shift();
    const next = redo.current.pop()!;
    restore(next);
    syncHistoryFlags();
  };

  // Resolve pressure + tilt into a stroke width. Pressure 0.5 (the constant
  // value mice/most touch report) maps back to the selected base width, so a
  // mouse or finger draws normally when no real pressure signal exists.
  const strokeWidthFor = (e: React.PointerEvent, base: number) => {
    const pr = e.pressure > 0 ? e.pressure : 0.5;
    const pressureScale = 0.4 + pr * 1.2; // 0.5 -> 1.0x, 1.0 -> 1.6x, ~0 -> 0.4x
    const tiltX = e.tiltX || 0; const tiltY = e.tiltY || 0;
    const tiltMag = Math.min(1, Math.sqrt(tiltX * tiltX + tiltY * tiltY) / 90);
    const tiltBoost = 1 + tiltMag * 0.5; // subtle chisel-style widening on tilted pens
    return Math.max(0.75, Math.min(base * 6, base * pressureScale * tiltBoost));
  };

  // Stylus eraser button (S Pen / Wacom / XP-Pen barrel button): pointerType
  // "pen" with the eraser-button bit (buttons & 32) or button === 5. This
  // overrides the active tool for the duration of the stroke only, then the
  // previously-selected tool applies again automatically on the next stroke.
  const resolveStrokeTool = (e: React.PointerEvent): Tool => {
    const inverted = e.pointerType === "pen" && ((e.buttons & 32) !== 0 || e.button === 5);
    return inverted ? "eraser" : tool;
  };

  const down = (e: React.PointerEvent) => {
    if (!ready) return;
    // Palm rejection: while a pen stroke is active, ignore incoming touch pointers.
    if (activePenId.current !== null && e.pointerType === "touch") return;
    if (e.pointerType === "pen") activePenId.current = e.pointerId;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const st = resolveStrokeTool(e);
    strokeToolRef.current = st;
    historyPushedForStroke.current = false;

    if (st === "pan") {
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    drawing.current = true;
    last.current = pos(e);
    if (!historyPushedForStroke.current) { pushHistory(); historyPushedForStroke.current = true; }
  };

  const move = (e: React.PointerEvent) => {
    if (panStart.current) {
      const dx = e.clientX - panStart.current.x; const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }
    if (!drawing.current) return;
    const st = strokeToolRef.current;
    const p = pos(e); const l = last.current || p;

    if (st === "eraser") {
      for (const ref of [inkRef, hlRef]) {
        const ctx = ref.current?.getContext("2d"); if (!ctx) continue;
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.lineWidth = eraserSize;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.restore();
      }
    } else if (st === "highlighter") {
      const ctx = hlRef.current?.getContext("2d"); if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = hlColor;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = strokeWidthFor(e, width * 3.5);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.restore();
    } else {
      const ctx = inkRef.current?.getContext("2d"); if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = strokeWidthFor(e, width);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.restore();
    }
    last.current = p;
  };

  const up = (e: React.PointerEvent) => {
    if (e.pointerId === activePenId.current) activePenId.current = null;
    drawing.current = false; last.current = null; panStart.current = null;
  };

  const clearInk = () => {
    pushHistory();
    for (const ref of [inkRef, hlRef]) { const c = ref.current; const ctx = c?.getContext("2d"); if (c && ctx) ctx.clearRect(0, 0, c.width, c.height); }
  };

  const zoomIndex = useMemo(() => Math.max(0, ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001)), [zoom]);
  const zoomIn = () => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1)]);
  const zoomOut = () => { const next = ZOOM_STEPS[Math.max(0, zoomIndex - 1)]; setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }); };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const save = useCallback(async () => {
    const base = baseRef.current; const hl = hlRef.current; const ink = inkRef.current; if (!base || !hl || !ink) return;
    setBusy(true); setErr("");
    try {
      const out = document.createElement("canvas"); out.width = base.width; out.height = base.height;
      const ctx = out.getContext("2d"); if (!ctx) throw new Error("no ctx");
      ctx.drawImage(base, 0, 0); ctx.drawImage(hl, 0, 0); ctx.drawImage(ink, 0, 0);
      const blob: Blob = await new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
      const u = await upload("drawing", qid, code, blob, `${qid}.png`);
      onSaved(u);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, [qid, code, onSaved]);

  const toolBtn = (t: Tool, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setTool(t)}
      className={"inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs " + (tool === t ? "border-cyan/60 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
      {icon} {label}
    </button>
  );

  return (
    <div className="el-noprint">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {toolBtn("pen", "Pen", <PenLine size={12} />)}
        {toolBtn("highlighter", "Highlighter", <Highlighter size={12} />)}
        {toolBtn("eraser", "Eraser", <Eraser size={12} />)}
        {toolBtn("pan", "Pan", <Hand size={12} />)}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button type="button" onClick={undo} disabled={!canUndo} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-dust hover:text-ice disabled:opacity-30"><Undo2 size={12} /></button>
        <button type="button" onClick={doRedo} disabled={!canRedo} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-dust hover:text-ice disabled:opacity-30"><Redo2 size={12} /></button>
        <button type="button" onClick={clearInk} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-dust hover:text-signal"><Trash2 size={12} /> Clear</button>
        <button type="button" onClick={save} disabled={busy || !ready} className="btn-primary ml-auto !px-3 !py-1.5 text-xs">{busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save answer sheet</button>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {tool === "highlighter" ? (
          <>
            {HL_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setHlColor(c)} aria-label={"highlighter " + c}
                className={"h-6 w-6 rounded-full border-2 " + (hlColor === c ? "border-cyan" : "border-white/20")} style={{ background: c }} />
            ))}
          </>
        ) : tool === "eraser" ? (
          <>
            <span className="text-[11px] text-dust">Size</span>
            {ERASER_SIZES.map((s) => (
              <button key={s} type="button" onClick={() => setEraserSize(s)}
                className={"inline-flex h-6 items-center rounded-lg border px-2 text-[11px] " + (eraserSize === s ? "border-cyan/60 text-cyan" : "border-white/10 text-dust hover:text-ice")}>{s}px</button>
            ))}
          </>
        ) : tool === "pan" ? (
          <span className="text-[11px] text-dust">Drag to pan the view</span>
        ) : (
          <>
            {PEN_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={"ink " + c}
                className={"h-6 w-6 rounded-full border-2 " + (color === c ? "border-cyan" : "border-white/20")} style={{ background: c }} />
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            <span className="text-[11px] text-dust">Width</span>
            {PEN_WIDTHS.map((w) => (
              <button key={w} type="button" onClick={() => setWidth(w)}
                className={"inline-flex h-6 items-center rounded-lg border px-2 text-[11px] " + (width === w ? "border-cyan/60 text-cyan" : "border-white/10 text-dust hover:text-ice")}>{w}px</button>
            ))}
          </>
        )}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]} className="inline-flex items-center rounded-lg border border-white/10 px-2 py-1 text-xs text-dust hover:text-ice disabled:opacity-30"><ZoomOut size={12} /></button>
        <span className="text-[11px] tabular-nums text-dust">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} className="inline-flex items-center rounded-lg border border-white/10 px-2 py-1 text-xs text-dust hover:text-ice disabled:opacity-30"><ZoomIn size={12} /></button>
        <button type="button" onClick={resetView} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-dust hover:text-ice"><RotateCcw size={11} /> Reset view</button>
      </div>

      <div ref={viewportRef} className="relative w-full overflow-hidden rounded-lg border border-white/15 bg-white" style={{ maxHeight: 640 }}>
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          <div ref={wrapRef} className="relative w-full">
            <canvas ref={baseRef} className="block w-full" />
            <canvas ref={hlRef} className="pointer-events-none absolute left-0 top-0" />
            <canvas ref={inkRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
              className="absolute left-0 top-0 touch-none"
              style={{ cursor: tool === "eraser" ? "cell" : tool === "pan" ? "grab" : "crosshair" }} />
          </div>
        </div>
        {!ready ? <div className="grid h-40 place-items-center text-xs text-dust">Loading paper…</div> : null}
      </div>
      {err ? <p className="mt-1 text-xs text-signal">{err}</p> : null}
      <p className="mt-1 text-[11px] text-dust">Write your answer directly in the paper&apos;s answer spaces, then <b>Save answer sheet</b>. Pressure-sensitive stylus input, an S&nbsp;Pen/Wacom eraser button, and pinch-free zoom/pan are all supported. It&apos;s stored for your teacher.</p>
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
