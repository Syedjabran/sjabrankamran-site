"use client";

import { useEffect, useRef } from "react";

/**
 * HeroVideo — cinematic background video that always plays.
 * - Server-rendered <video autoplay muted loop playsinline>: the hero plays
 *   with zero client JS, so it survives hydration issues and flaky networks.
 * - We intentionally do NOT gate on prefers-reduced-motion / Save-Data /
 *   Battery-Saver — those (common on laptops-on-battery and phones) were
 *   silently halting the hero on the poster for real visitors.
 * - Poster underlay (inlined data URI) is the only fallback if a browser
 *   refuses muted autoplay.
 * - Always sits behind a dark overlay so text stays readable.
 */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const nudge = () => v.play().catch(() => {/* autoplay blocked → poster */});
    nudge();
    // Some browsers only allow play() once enough data has buffered.
    v.addEventListener("canplay", nudge);
    v.addEventListener("loadeddata", nudge);
    return () => {
      v.removeEventListener("canplay", nudge);
      v.removeEventListener("loadeddata", nudge);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Poster underlay — always present as fallback */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* Readability overlays */}
      <div className="absolute inset-0 bg-abyss/72" />
      <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/40 to-abyss/60" />
    </div>
  );
}
