"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X, Volume2 } from "lucide-react";

/**
 * Landing-page guided-tour popup. On a visitor's first arrival it appears as a
 * muted, poster-framed dialog that asks permission before the guided tour of the
 * Education Portal plays with sound (browser autoplay-policy compliant). The
 * choice is remembered per visitor so it never nags on return visits.
 */
const SEEN_KEY = "sjak_revised_video_tour_v1";
const VIDEO_SRC = "https://ops.sjabrankamran.com/dl/sjak-education-portal-revised-demo.mp4";
const POSTER_SRC = "https://ops.sjabrankamran.com/dl/sjak-education-portal-revised-demo-poster.jpg";

export function GuidedTourPopup() {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (seen) return;
    // Reveal almost immediately after hydration so the invitation is visible
    // in the visitor's first viewport without blocking the initial page paint.
    const t = setTimeout(() => setOpen(true), 250);
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-2 pt-[max(2.5vh,env(safe-area-inset-top))] sm:px-5 sm:pt-[6vh]">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Education Portal guided tour"
        className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-cyan/40 bg-abyss/98 shadow-[0_24px_100px_rgba(0,0,0,0.8)]">
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/40 text-fog transition hover:text-ice">
          <X size={16} />
        </button>

        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 pr-14 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan">First-time visitor</p>
            <h2 className="mt-0.5 text-base font-semibold text-ice sm:text-xl">Discover the SJAK Education Portal</h2>
          </div>
          <span className="hidden rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-medium text-cyan sm:block">6 min 14 sec</span>
        </div>

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
            onEnded={() => { remember(); setOpen(false); }}
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
                <span className="block text-xl font-semibold text-ice sm:text-2xl">See how the learning ecosystem works</span>
                <span className="mt-1 block text-sm text-fog">
                  Explore classes, practice, assessments, personalised study plans and real-time alerts in one guided tour.
                </span>
              </span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-6 sm:py-4">
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
