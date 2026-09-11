"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X, Volume2 } from "lucide-react";

/**
 * Landing-page guided-tour popup. On a visitor's first arrival it appears as a
 * muted, poster-framed dialog that asks permission before the guided tour of the
 * Education Portal plays with sound (browser autoplay-policy compliant). The
 * choice is remembered per visitor so it never nags on return visits.
 */
const SEEN_KEY = "sjak_tour_seen_v1";
const VIDEO_SRC = "/portal-guided-tour.mp4";
const POSTER_SRC = "/portal-guided-tour-poster.jpg";

export function GuidedTourPopup() {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (seen) return;
    // Small delay so the hero renders first, then invite the visitor.
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function remember() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
  }
  function close() {
    videoRef.current?.pause();
    remember();
    setOpen(false);
  }
  async function startTour() {
    remember();
    setStarted(true);
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      v.currentTime = 0;
      try { await v.play(); } catch { /* user can press play control */ }
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Education Portal guided tour"
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan/30 bg-abyss/95 shadow-2xl">
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/40 text-fog transition hover:text-ice">
          <X size={16} />
        </button>

        <div className="relative aspect-video w-full bg-space">
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            poster={POSTER_SRC}
            className="h-full w-full object-cover"
            playsInline
            muted={!started}
            controls={started}
            preload="metadata"
          />
          {!started ? (
            <button
              onClick={startTour}
              className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/30 to-black/70 text-center"
            >
              <span className="grid h-20 w-20 place-items-center rounded-full border border-cyan/50 bg-cyan/10 text-cyan transition group-hover:scale-105 group-hover:bg-cyan/20">
                <Play size={30} className="ml-1" />
              </span>
              <span className="max-w-md px-6">
                <span className="block text-lg font-semibold text-ice">Take a quick guided tour</span>
                <span className="mt-1 block text-sm text-fog">
                  Meet the Physics learning ecosystem — classes, practice, personalised study plans and real-time alerts — narrated in 2 minutes.
                </span>
              </span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
          <p className="flex items-center gap-2 text-xs text-dust">
            <Volume2 size={13} className="text-cyan" /> {started ? "Playing with sound" : "Starts muted — press play to begin with audio"}
          </p>
          <div className="flex gap-2">
            {!started ? (
              <button onClick={startTour} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/50 bg-cyan/10 px-4 py-2 text-sm font-semibold text-cyan hover:bg-cyan/20">
                <Play size={14} /> Start guided tour
              </button>
            ) : null}
            <button onClick={close} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-fog hover:border-white/30 hover:text-ice">
              {started ? "Close" : "Skip for now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
