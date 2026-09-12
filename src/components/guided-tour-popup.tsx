"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Play, RefreshCw, X, Volume2 } from "lucide-react";

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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setMounted(true);
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
    setMediaError(false);
    setBuffering(true);
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      if (v.ended) v.currentTime = 0;
      try {
        await v.play();
      } catch {
        // Keep native controls visible and offer a retry if the browser delays
        // cross-origin media startup or changes its autoplay policy.
        setBuffering(false);
        setMediaError(true);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-2 pt-[max(7rem,calc(env(safe-area-inset-top)+4rem))] sm:px-5 sm:pt-[12vh]">
      <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Education Portal guided tour"
        className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-cyan/35 bg-abyss/70 shadow-[0_24px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl">
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

        <div className="relative aspect-video w-full bg-black/70">
          <video
            ref={videoRef}
            poster={POSTER_SRC}
            className="h-full w-full object-cover"
            playsInline
            muted={!started}
            controls
            preload="auto"
            onLoadStart={() => setBuffering(started)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => { setBuffering(false); setMediaError(false); }}
            onCanPlay={() => setBuffering(false)}
            onError={() => { setBuffering(false); setMediaError(true); }}
            onEnded={() => { remember(); setOpen(false); }}
          >
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
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
          {started && buffering && !mediaError ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25" aria-live="polite">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-sm text-ice">
                <Loader2 size={16} className="animate-spin text-cyan" /> Loading tour…
              </span>
            </div>
          ) : null}
          {started && mediaError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center">
              <p className="text-sm text-ice">The video did not start automatically.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={startTour} className="inline-flex items-center gap-2 rounded-lg border border-cyan/50 bg-cyan/10 px-4 py-2 text-sm font-semibold text-cyan">
                  <RefreshCw size={14} /> Retry playback
                </button>
                <a href={VIDEO_SRC} target="_blank" rel="noreferrer" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-ice">
                  Open video directly
                </a>
              </div>
            </div>
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
    </div>,
    document.body,
  );
}
