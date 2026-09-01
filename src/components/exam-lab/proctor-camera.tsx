"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanFace, ShieldAlert, Loader2, UserX, Users, CheckCircle2, Smartphone } from "lucide-react";
import type { GuardEvent } from "./use-exam-guard";

/**
 * On-device exam proctor. PRIVACY-FIRST: the webcam stream never leaves the
 * browser and no video is stored. Face/attention + object analysis run locally
 * via MediaPipe (FaceLandmarker + ObjectDetector, loaded from CDN at runtime;
 * graceful fallback keeps the window/tab guard protecting the test if a model
 * can't load). A single still JPEG snapshot is emitted to the parent on each
 * warning / violation for the super-admin forensic record.
 *
 * Escalation (per the brief): a sustained malpractice signal raises an on-screen
 * WARNING with a soft beep + snapshot. TWO warnings → a SIREN + terminal event
 * that cancels & LOCKS the test (student must justify to a super-admin).
 *
 * Legitimate writing posture (head down at the desk to solve a hard-copy answer
 * script) is WHITELISTED after calibration and never counts as a violation.
 * Turning LEFT / RIGHT / UP for a sustained span does.
 *
 * Signals: absence (no face) · multiface (2+ people) · headturn (left/right/up)
 * · material (phone / laptop / TV in frame).
 */

type Status = { ready: boolean; faceOk: boolean; faces: number; message: string; degraded: boolean; calibrated: boolean };

const MP_VERSION = "0.10.20";
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_FACE = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MP_OBJECT = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

// COCO classes we treat as "helping material" / second screens.
const MATERIAL = new Set(["cell phone", "laptop", "tv", "remote"]);
const MAX_WARNINGS = 2;

// Load a remote ES module at runtime. Native dynamic import() is CSP-safe (it
// needs the CDN origin in script-src, NOT 'unsafe-eval' like new Function/eval),
// so this must never use new Function. The ignore hints keep the bundler from
// trying to resolve the runtime URL at build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dynImport(u: string): Promise<any> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ u);
}

export function ProctorCamera({
  phase,
  onStatus,
  onEvent,
  onSnapshot,
}: {
  phase: "preview" | "live" | "off";
  onStatus?: (s: Status) => void;
  onEvent?: (ev: GuardEvent) => void;
  onSnapshot?: (dataUrl: string, reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const lastPointsRef = useRef<{ x: number; y: number }[]>([]);
  const lastFaceAtRef = useRef<number>(0);
  const baselineRef = useRef<{ nx: number; ny: number } | null>(null);
  const modelReadyRef = useRef(false);   // face landmarker is live
  const modelDoneRef = useRef(false);    // model load finished (ready OR failed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filesetRef = useRef<any>(null);
  const faceDelegateRef = useRef<"GPU" | "CPU">("GPU");
  const detectCountRef = useRef(0);      // successful face detections so far
  const camOnAtRef = useRef(0);
  const recreatedRef = useRef(false);    // one-time GPU→CPU recreate done
  const tsRef = useRef(0);               // strictly-increasing detect timestamp
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioRef = useRef<any>(null);

  const [status, setStatus] = useState<Status>({ ready: false, faceOk: false, faces: 0, message: "Starting camera…", degraded: false, calibrated: false });
  const [warnBanner, setWarnBanner] = useState<{ n: number; msg: string } | null>(null);
  const warningsRef = useRef(0);
  const statusCb = useRef(onStatus); statusCb.current = onStatus;
  const eventCb = useRef(onEvent); eventCb.current = onEvent;
  const snapCb = useRef(onSnapshot); snapCb.current = onSnapshot;

  const push = useCallback((s: Partial<Status>) => {
    setStatus((prev) => { const next = { ...prev, ...s }; try { statusCb.current?.(next); } catch { /* ignore */ } return next; });
  }, []);

  const grabFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const w = 360, h = Math.round((v.videoHeight / v.videoWidth) * 360) || 270;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    try { return c.toDataURL("image/jpeg", 0.6); } catch { return null; }
  }, []);

  // ---- WebAudio beep / siren (no external asset) ----
  const tone = useCallback((kind: "beep" | "siren") => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return;
      if (!audioRef.current) audioRef.current = new AC();
      const ctx = audioRef.current; if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      if (kind === "beep") {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(880, now);
        g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.25, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.36);
      } else {
        // rising/falling siren for ~2.2s
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sawtooth";
        for (let i = 0; i < 5; i++) { const t = now + i * 0.44; o.frequency.setValueAtTime(650, t); o.frequency.linearRampToValueAtTime(1180, t + 0.22); o.frequency.linearRampToValueAtTime(650, t + 0.44); }
        g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.3, now + 0.05); g.gain.setValueAtTime(0.3, now + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
        o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 2.25);
      }
    } catch { /* audio optional */ }
  }, []);

  const emit = useCallback((type: string, reason: string, terminal: boolean) => {
    try { eventCb.current?.({ type: type as GuardEvent["type"], reason, terminal, at: Date.now() }); } catch { /* ignore */ }
  }, []);
  const snap = useCallback((reason: string) => {
    const url = grabFrame();
    if (url) { try { snapCb.current?.(url, reason); } catch { /* ignore */ } }
  }, [grabFrame]);

  // A sustained malpractice episode → escalate.
  const escalate = useCallback((type: string, reason: string) => {
    warningsRef.current += 1;
    const n = warningsRef.current;
    snap(reason);
    if (n >= MAX_WARNINGS) {
      tone("siren");
      setWarnBanner({ n, msg: reason });
      emit(type, `${reason} (final warning — test locked after ${n} warnings).`, true);
    } else {
      tone("beep");
      setWarnBanner({ n, msg: reason });
      emit(type, `${reason} (warning ${n} of ${MAX_WARNINGS}).`, false);
      setTimeout(() => setWarnBanner((b) => (b && b.n === n ? null : b)), 4500);
    }
  }, [emit, snap, tone]);

  const setBaselineFrom = useCallback((pts: { x: number; y: number }[]) => {
    let mnX = 1, mxX = 0, mnY = 1, mxY = 0;
    for (const p of pts) { if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x; if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y; }
    const nose = pts[1] || pts[0];
    const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, fw = Math.max(0.001, mxX - mnX), fh = Math.max(0.001, mxY - mnY);
    baselineRef.current = { nx: (nose.x - cx) / fw, ny: (nose.y - cy) / fh };
  }, []);

  // AUTOMATIC calibration — no button, no manual step. As soon as the camera is
  // on we watch for a stable face: first good detection locks the baseline and
  // approves the position. If the on-device model can't produce detections
  // within ~8s (older device / broken GPU / blocked CDN), we approve under
  // BASIC monitoring so nobody is ever stuck at the gate.
  useEffect(() => {
    if (phase !== "preview") return;
    let done = false;
    const startedAt = Date.now();
    const iv = setInterval(() => {
      if (done) return;
      const pts = lastPointsRef.current;
      const fresh = Date.now() - lastFaceAtRef.current < 800;
      if (modelReadyRef.current && pts.length >= 100 && fresh) {
        done = true; clearInterval(iv);
        setBaselineFrom(pts);
        warningsRef.current = 0;
        push({ calibrated: true, degraded: false, message: "Position approved ✓" });
        return;
      }
      const waited = Date.now() - startedAt;
      // Model finished but failed, or nothing detected after a fair wait → basic.
      if ((modelDoneRef.current && !modelReadyRef.current && waited > 1500) || waited > 8000) {
        done = true; clearInterval(iv);
        baselineRef.current = null;
        warningsRef.current = 0;
        push({ calibrated: true, degraded: !modelReadyRef.current, message: modelReadyRef.current ? "Camera approved ✓" : "Approved · basic monitoring" });
      }
    }, 250);
    return () => clearInterval(iv);
  }, [phase, push, setBaselineFrom]);

  // Create a FaceLandmarker on the given delegate (GPU fast / CPU reliable).
  const makeFace = useCallback(async (delegate: "GPU" | "CPU") => {
    return visionRef.current.FaceLandmarker.createFromOptions(filesetRef.current, {
      baseOptions: { modelAssetPath: MP_FACE, delegate }, runningMode: "VIDEO", numFaces: 2,
    });
  }, []);

  // If GPU created OK but produced zero detections shortly after the camera is
  // on, transparently rebuild on CPU (the classic broken-GPU-delegate case).
  const healthCheckFace = useCallback(() => {
    if (recreatedRef.current) return;
    if (faceDelegateRef.current !== "GPU" || !modelReadyRef.current) return;
    if (!camOnAtRef.current || Date.now() - camOnAtRef.current < 2600) return;
    if (detectCountRef.current > 0) return;
    recreatedRef.current = true;
    (async () => {
      try {
        const next = await makeFace("CPU");
        const old = faceRef.current;
        faceRef.current = next; faceDelegateRef.current = "CPU";
        try { old?.close?.(); } catch { /* ignore */ }
      } catch { /* keep GPU instance */ }
    })();
  }, [makeFace]);

  // ---- camera + models lifecycle ----
  useEffect(() => {
    if (phase === "off") return;
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        push({ ready: true, message: "Camera on — centre your face, then calibrate." });
      } catch {
        push({ ready: false, degraded: true, message: "Camera blocked. Allow camera access to sit the test." });
        emit("camera_off", "Camera access was denied or unavailable.", false);
        return;
      }
      try {
        const vision = await dynImport(MP_MODULE);
        const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
        visionRef.current = vision; filesetRef.current = fileset;
        // GPU (WebGL) is fastest but on many tablets/browsers it CREATES fine yet
        // never produces results — fall back to CPU on throw, and a runtime
        // health-check below recreates on CPU if GPU yields no detections.
        try {
          faceRef.current = await makeFace("GPU");
          faceDelegateRef.current = "GPU";
        } catch {
          faceRef.current = await makeFace("CPU");
          faceDelegateRef.current = "CPU";
        }
        if (!alive) return;
        modelReadyRef.current = true; modelDoneRef.current = true;
        camOnAtRef.current = Date.now();
        push({ degraded: false, message: "AI proctor ready — centre your face and tap Calibrate." });
        // Object detector is optional. Load on CPU (running two GPU tasks at once
        // can break FaceLandmarker inference), in the background, never blocking.
        (async () => {
          try {
            objRef.current = await vision.ObjectDetector.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MP_OBJECT, delegate: "CPU" }, runningMode: "VIDEO", scoreThreshold: 0.45, maxResults: 6,
            });
          } catch { objRef.current = null; }
        })();
      } catch {
        faceRef.current = null; objRef.current = null;
        modelReadyRef.current = false; modelDoneRef.current = true;
        push({ degraded: true, message: "Live camera on (basic monitoring)." });
        emit("camera_degraded", "Advanced models unavailable — basic monitoring active.", false);
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      try { faceRef.current?.close?.(); } catch { /* ignore */ }
      try { objRef.current?.close?.(); } catch { /* ignore */ }
      faceRef.current = null; objRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase, push, emit]);

  // ---- analysis + green scan overlay ----
  useEffect(() => {
    if (phase === "off") return;
    let absentSince = 0, multiSince = 0, turnSince = 0, matSince = 0, scanY = 0, lastFace = 0, lastObj = 0;
    let matPresent = false, matLabel = "";
    // episode latches so ONE sustained event = ONE warning until it clears
    const latch = { turn: false, absent: false, multi: false, material: false };

    const loop = () => {
      // Re-arm FIRST and guard the body: a single throw must never kill the
      // scan loop (that exact failure made detection permanently dead before).
      rafRef.current = requestAnimationFrame(loop);
      try {
      const v = videoRef.current, cv = overlayRef.current, now = performance.now();
      if (v && cv && v.videoWidth) {
        const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight, ctx = cv.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, W, H);
          let points = lastPointsRef.current;
          let faces = points.length ? 1 : 0;
          if (faceRef.current && now - lastFace > 150) {
            lastFace = now;
            healthCheckFace();
            try {
              // detectForVideo needs strictly-increasing ms timestamps or it throws.
              const ts = tsRef.current = Math.max(tsRef.current + 1, Math.round(now));
              const res = faceRef.current.detectForVideo(v, ts);
              const list = (res?.faceLandmarks || []) as { x: number; y: number }[][];
              faces = list.length; points = (list[0] || []).map((p) => ({ x: p.x, y: p.y })); lastPointsRef.current = points;
              if (points.length) { lastFaceAtRef.current = Date.now(); detectCountRef.current++; }
            } catch { /* transient */ }
          } else if (!faceRef.current) { faces = 1; }
          if (objRef.current && now - lastObj > 550) {
            lastObj = now;
            try {
              const od = objRef.current.detectForVideo(v, now);
              const dets = (od?.detections || []) as { categories: { categoryName: string; score: number }[] }[];
              const hit = dets.find((d) => d.categories?.[0] && MATERIAL.has(d.categories[0].categoryName));
              matPresent = !!hit; matLabel = hit?.categories?.[0]?.categoryName || "";
            } catch { /* transient */ }
          }
          evaluate(faces, points);

          // ---- green scan overlay ----
          scanY = (scanY + 2.2) % H;
          ctx.strokeStyle = "rgba(45,226,150,0.10)"; ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = 0; y < H; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          const grad = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
          grad.addColorStop(0, "rgba(45,226,150,0)"); grad.addColorStop(0.5, "rgba(45,226,150,0.55)"); grad.addColorStop(1, "rgba(45,226,150,0)");
          ctx.fillStyle = grad; ctx.fillRect(0, scanY - 18, W, 36);
          ctx.strokeStyle = "rgba(45,226,150,0.9)"; ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke();
          if (points.length) {
            let mnX = 1, mnY = 1, mxX = 0, mxY = 0;
            ctx.fillStyle = "rgba(45,226,150,0.85)";
            for (let i = 0; i < points.length; i += 3) {
              const px = points[i].x * W, py = points[i].y * H; ctx.fillRect(px, py, 1.4, 1.4);
              if (points[i].x < mnX) mnX = points[i].x; if (points[i].y < mnY) mnY = points[i].y;
              if (points[i].x > mxX) mxX = points[i].x; if (points[i].y > mxY) mxY = points[i].y;
            }
            ctx.strokeStyle = faces > 1 || matPresent ? "rgba(240,61,110,0.9)" : "rgba(45,226,150,0.9)"; ctx.lineWidth = 2;
            ctx.strokeRect(mnX * W, mnY * H, (mxX - mnX) * W, (mxY - mnY) * H);
          }
        }
      }
      } catch { /* keep scanning next frame */ }
    };

    const evaluate = (faces: number, points: { x: number; y: number }[]) => {
      const live = phaseRef.current === "live";
      const t = Date.now();

      // helping material (phone / laptop / TV)
      if (matPresent) {
        if (!matSince) matSince = t;
        if (live && t - matSince > 1500 && !latch.material) { latch.material = true; escalate("material", `Possible helping material detected in frame (${matLabel}).`); }
        push({ message: `Put away any ${matLabel || "devices/notes"}.` });
      } else { matSince = 0; latch.material = false; }

      // multiple faces
      if (faces > 1) {
        if (!multiSince) multiSince = t;
        if (live && t - multiSince > 1600 && !latch.multi) { latch.multi = true; escalate("multiface", "Another person appeared in the camera."); }
        push({ faces, faceOk: false, message: "More than one face detected." });
        absentSince = 0; turnSince = 0; return;
      }
      multiSince = 0; latch.multi = false;

      // absence
      if (faces === 0) {
        if (!absentSince) absentSince = t;
        push({ faces: 0, faceOk: false, message: "No face detected — stay in view." });
        if (live && t - absentSince > 4500 && !latch.absent) { latch.absent = true; escalate("absence", "Your face left the camera view."); }
        return;
      }
      absentSince = 0; latch.absent = false;

      // No landmark data yet (model warming up, or basic-monitoring mode):
      // nothing to measure — never fall through to head-pose math with an
      // empty array (nose would be undefined → crash → dead loop).
      if (points.length < 3) {
        push({ faces: 1, faceOk: true, message: modelReadyRef.current ? "Scanning…" : "Camera live — preparing AI…" });
        return;
      }

      // head pose vs calibrated baseline (down = writing = allowed)
      let mnX = 1, mxX = 0, mnY = 1, mxY = 0;
      for (const p of points) { if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x; if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y; }
      const nose = points[1] || points[0];
      const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, fw = Math.max(0.001, mxX - mnX), fh = Math.max(0.001, mxY - mnY);
      const nx = (nose.x - cx) / fw, ny = (nose.y - cy) / fh;
      const base = baselineRef.current || { nx, ny };
      const sideways = Math.abs(nx - base.nx) > 0.20;   // turned left / right
      const up = (ny - base.ny) < -0.22;                // looking up / away (down is allowed)
      const off = sideways || up;
      if (off) {
        if (!turnSince) turnSince = t;
        push({ faces: 1, faceOk: false, message: sideways ? "Face forward — don't turn away." : "Eyes on the screen." });
        if (live && t - turnSince > 3500 && !latch.turn) { latch.turn = true; escalate("headturn", sideways ? "You turned your head away from the screen." : "You looked up/away from the screen."); }
      } else {
        turnSince = 0; latch.turn = false;
        push({ faces: 1, faceOk: true, message: baselineRef.current ? "Face in view — good." : "Centre your face, then calibrate." });
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, escalate, push, healthCheckFace]);

  if (phase === "off") return null;

  const border = status.faces > 1 ? "border-red-500/70" : !status.ready ? "border-amber-400/60" : status.faceOk ? "border-emerald-400/70" : "border-amber-400/70";

  return (
    <>
      {warnBanner && (
        <div className={"fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 px-4 py-2.5 text-center text-sm font-semibold " + (warnBanner.n >= MAX_WARNINGS ? "bg-red-600 text-white" : "bg-amber-500 text-black")}>
          <ShieldAlert size={16} /> {warnBanner.n >= MAX_WARNINGS ? "TEST LOCKED — " : `WARNING ${warnBanner.n}/${MAX_WARNINGS} — `}{warnBanner.msg}
        </div>
      )}

      <div className={"el-proctor-cam fixed bottom-4 right-4 z-[60] w-[176px] overflow-hidden rounded-xl border-2 bg-black/80 shadow-2xl backdrop-blur " + border}>
        <div className="relative aspect-[4/3] w-full">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
          <canvas ref={overlayRef} className="absolute inset-0 h-full w-full -scale-x-100" />
          {!status.ready && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-center text-[10px] text-amber-200">
              <span><Loader2 size={16} className="mx-auto mb-1 animate-spin" />{status.message}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px]">
          {status.faces > 1 ? <Users size={11} className="text-red-400" /> :
           status.faces === 0 && status.ready ? <UserX size={11} className="text-amber-300" /> :
           status.faceOk ? <ScanFace size={11} className="text-emerald-400" /> :
           <Camera size={11} className="text-amber-300" />}
          <span className={"truncate " + (status.faces > 1 ? "text-red-300" : status.faceOk ? "text-emerald-300" : "text-amber-200")}>
            {status.degraded && status.ready ? "Live · basic scan" : status.message}
          </span>
        </div>
        {phase === "preview" && status.ready && (
          <div className={"flex w-full items-center justify-center gap-1.5 border-t border-white/10 px-2 py-1.5 text-[11px] font-semibold " + (status.calibrated ? "bg-emerald-500/15 text-emerald-300" : "bg-cyan-500/15 text-cyan-300")}>
            {status.calibrated ? <><CheckCircle2 size={12} /> Position approved</> : <><Loader2 size={12} className="animate-spin" /> Detecting your position…</>}
          </div>
        )}
        <div className="flex items-center gap-1 border-t border-white/10 bg-emerald-500/5 px-2 py-0.5 text-[9px] text-emerald-300/80">
          <ShieldAlert size={9} /> AI proctor · on-device{objRef.current ? <> · <Smartphone size={8} /> object scan</> : null}
        </div>
      </div>
    </>
  );
}
