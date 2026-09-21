"use client";

import { useEffect, useRef } from "react";

/**
 * HeroVideo — cinematic, licence-safe background video.
 * - Server-rendered <video autoplay muted loop playsinline>: the hero plays
 *   with ZERO client JavaScript, so it never depends on hydration (resilient
 *   against edge challenges that block JS chunk requests on a fresh visit).
 * - Poster underlay always present as fallback while the video buffers or if
 *   the media request fails.
 * - JS is progressive enhancement only: it pauses/unloads the video for
 *   prefers-reduced-motion and Save-Data users, and nudges play() where
 *   autoplay needs a post-hydration kick.
 * - Always sits behind a dark overlay so text stays readable.
 */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData) {
      v.pause();
      v.removeAttribute("src");
      v.load(); // poster remains
      return;
    }
    v.play().catch(() => {
      /* autoplay blocked → poster remains */
    });
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
        preload="metadata"
      />
      {/* Readability overlays */}
      <div className="absolute inset-0 bg-abyss/72" />
      <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/40 to-abyss/60" />
    </div>
  );
}
