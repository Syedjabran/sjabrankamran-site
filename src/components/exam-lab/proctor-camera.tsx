"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanFace, ShieldAlert, Loader2, UserX, Users } from "lucide-react";
import type { GuardEvent } from "./use-exam-guard";

/**
 * On-device exam proctor. PRIVACY-FIRST: the webcam stream never leaves the
 * browser and no video is stored. Face/attention analysis runs locally via
 * MediaPipe FaceLandmarker (loaded from CDN at runtime; if it can't load the
 * camera still shows a live "scanning" preview and the window/tab guard keeps
 * protecting the test). A single still JPEG snapshot is emitted to the parent
 * ONLY on a violation, for the super-admin forensic record.
 *
 * Signals emitted via onEvent (source:"camera"):
 *   absence (no face)      → warn, then TERMINAL if it persists
 *   multiface (2+ faces)   → TERMINAL (someone else in frame)
 *   lookaway               → non-terminal flag (eyes/face off-screen)
 *   camera_off / degraded  → non-terminal system note
 */

type Status = { ready: boolean; faceOk: boolean; faces: number; message: string; degraded: boolean };

const MP_VERSION = "0.10.20";
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Import a remote ES module without the bundler trying to resolve it at build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynImport: (u: string) => Promise<any> = new Function("u", "return import(u)") as never;

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
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const lastPointsRef = useRef<{ x: number; y: number }[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const [status, setStatus] = useState<Status>({ ready: false, faceOk: false, faces: 0, message: "Starting camera…", degraded: false });
  const statusCb = useRef(onStatus); statusCb.current = onStatus;
  const eventCb = useRef(onEvent); eventCb.current = onEvent;
  const snapCb = useRef(onSnapshot); snapCb.current = onSnapshot;

  const push = useCallback((s: Partial<Status>) => {
    setStatus((prev) => {
      const next = { ...prev, ...s };
      try { statusCb.current?.(next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Cooldown so we don't spam identical events / snapshots.
  const lastEmit = useRef<Record<string, number>>({});
  const emit = useCallback((type: GuardEvent["type"] | string, reason: string, terminal: boolean, snapshot = false) => {
    const now = Date.now();
    if (!terminal && now - (lastEmit.current[type] || 0) < 8000) return; // throttle warnings
    lastEmit.current[type] = now;
    try { eventCb.current?.({ type: type as GuardEvent["type"], reason, terminal, at: now }); } catch { /* ignore */ }
    if (snapshot) {
      const url = grabFrame();
      if (url) { try { snapCb.current?.(url, reason); } catch { /* ignore */ } }
    }
  }, []);

  const grabFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const w = 320, h = Math.round((v.videoHeight / v.videoWidth) * 320) || 240;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    try { return c.toDataURL("image/jpeg", 0.6); } catch { return null; }
  }, []);

  // ---- camera + model lifecycle ----
  useEffect(() => {
    if (phase === "off") return;
    let alive = true;

    (async () => {
      // 1) camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        push({ ready: true, message: "Camera on — scanning…" });
      } catch {
        push({ ready: false, degraded: true, message: "Camera blocked. Allow camera access to sit the test." });
        emit("camera_off", "Camera access was denied or unavailable.", false);
        return;
      }

      // 2) on-device landmarker (best-effort; degrade gracefully)
      try {
        const vision = await dynImport(MP_MODULE);
        const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
        landmarkerRef.current = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL, delegate: "GPU" },
          runningMode: "VIDEO", numFaces: 2,
          outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
        });
      } catch {
        landmarkerRef.current = null;
        push({ degraded: true, message: "Live camera on (basic monitoring)." });
        emit("camera_degraded", "Advanced face model unavailable — basic monitoring active.", false);
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      try { landmarkerRef.current?.close?.(); } catch { /* ignore */ }
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase, push, emit]);

  // ---- analysis + green scan overlay ----
  useEffect(() => {
    if (phase === "off") return;

    let absentSince = 0;
    let multiSince = 0;
    let awaySince = 0;
    let scanY = 0;
    let lastDetect = 0;

    const loop = () => {
      const v = videoRef.current;
      const cv = overlayRef.current;
      const now = performance.now();
      if (v && cv && v.videoWidth) {
        const W = cv.width = cv.clientWidth;
        const H = cv.height = cv.clientHeight;
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, W, H);

          // run detection ~6fps
          let points: { x: number; y: number }[] = lastPointsRef.current;
          let faces = points.length ? 1 : 0;
          if (landmarkerRef.current && now - lastDetect > 160) {
            lastDetect = now;
            try {
              const res = landmarkerRef.current.detectForVideo(v, now);
              const list = (res?.faceLandmarks || []) as { x: number; y: number }[][];
              faces = list.length;
              points = (list[0] || []).map((p) => ({ x: p.x, y: p.y }));
              lastPointsRef.current = points;
              evaluate(faces, points);
            } catch { /* transient */ }
          } else if (!landmarkerRef.current) {
            faces = 1; // cannot verify without model; presence assumed, guard still protects
          }

          // ---- green scan overlay ----
          scanY = (scanY + 2.2) % H;
          // grid
          ctx.strokeStyle = "rgba(45,226,150,0.10)";
          ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = 0; y < H; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          // moving scan line
          const grad = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
          grad.addColorStop(0, "rgba(45,226,150,0)");
          grad.addColorStop(0.5, "rgba(45,226,150,0.55)");
          grad.addColorStop(1, "rgba(45,226,150,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, scanY - 18, W, 36);
          ctx.strokeStyle = "rgba(45,226,150,0.9)";
          ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke();

          // face mesh dots + bbox
          if (points.length) {
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            ctx.fillStyle = "rgba(45,226,150,0.85)";
            for (let i = 0; i < points.length; i += 3) {
              const px = points[i].x * W, py = points[i].y * H;
              ctx.fillRect(px, py, 1.4, 1.4);
              if (points[i].x < minX) minX = points[i].x; if (points[i].y < minY) minY = points[i].y;
              if (points[i].x > maxX) maxX = points[i].x; if (points[i].y > maxY) maxY = points[i].y;
            }
            ctx.strokeStyle = faces > 1 ? "rgba(240,61,110,0.9)" : "rgba(45,226,150,0.9)";
            ctx.lineWidth = 2;
            ctx.strokeRect(minX * W, minY * H, (maxX - minX) * W, (maxY - minY) * H);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    const evaluate = (faces: number, points: { x: number; y: number }[]) => {
      const live = phaseRef.current === "live";
      const t = Date.now();

      // multiple faces
      if (faces > 1) {
        if (!multiSince) multiSince = t;
        if (live && t - multiSince > 1800) {
          emit("multiface", "Another person appeared in the camera during the test.", true, true);
        }
        push({ faces, faceOk: false, message: "More than one face detected." });
        absentSince = 0; awaySince = 0;
        return;
      }
      multiSince = 0;

      // absence
      if (faces === 0) {
        if (!absentSince) absentSince = t;
        const gone = t - absentSince;
        push({ faces: 0, faceOk: false, message: "No face detected — stay in view." });
        if (live && gone > 2500) emit("absence_warn", "Your face left the camera view.", false, false);
        if (live && gone > 5000) emit("absence", "Your face was out of the camera view for too long.", true, true);
        return;
      }
      absentSince = 0;

      // look-away (nose offset from face-centre)
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const p of points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
      const nose = points[1] || points[0];
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const fw = Math.max(0.001, maxX - minX), fh = Math.max(0.001, maxY - minY);
      const offX = Math.abs(nose.x - cx) / fw;
      const offY = Math.abs(nose.y - cy) / fh;
      const away = offX > 0.22 || offY > 0.30;
      if (away) {
        if (!awaySince) awaySince = t;
        if (live && t - awaySince > 3500) { emit("lookaway", "You looked away from the screen for a while.", false, true); awaySince = t; }
        push({ faces: 1, faceOk: false, message: "Keep your eyes on the screen." });
      } else {
        awaySince = 0;
        push({ faces: 1, faceOk: true, message: "Face in view — good." });
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, emit, push]);

  if (phase === "off") return null;

  const border =
    status.faces > 1 ? "border-red-500/70" :
    !status.ready ? "border-amber-400/60" :
    status.faceOk ? "border-emerald-400/70" : "border-amber-400/70";

  return (
    <div className={"el-proctor-cam fixed bottom-4 right-4 z-[60] w-[168px] overflow-hidden rounded-xl border-2 bg-black/80 shadow-2xl backdrop-blur " + border}>
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
      <div className="flex items-center gap-1 border-t border-white/10 bg-emerald-500/5 px-2 py-0.5 text-[9px] text-emerald-300/80">
        <ShieldAlert size={9} /> AI proctor · on-device
      </div>
    </div>
  );
}
