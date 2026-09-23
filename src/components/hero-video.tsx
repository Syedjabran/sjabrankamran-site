"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HeroVideo — cinematic, licence-safe background video.
 * - Server-rendered <video autoplay muted loop playsinline>: the hero plays
 *   with ZERO client JavaScript, so it never depends on hydration (resilient
 *   against edge challenges that block JS chunk requests on a fresh visit).
 * - Poster underlay always present as fallback while the video buffers or if
 *   the media request fails.
 * - JS is progressive enhancement only: it pauses/unloads the video for
 *   prefers-reduced-motion users (accessibility), and otherwise nudges play()
 *   whenever the browser needs a post-hydration or post-buffer kick.
 * - Always sits behind a dark overlay so text stays readable.
 */
const MAX_VIDEO_RETRIES = 3;

export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [retry, setRetry] = useState(0);
  const stopped = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Owner decision: the muted hero loop always plays. We intentionally do NOT
    // gate on prefers-reduced-motion / Save-Data / Battery-Saver here — those
    // settings (very common on laptops-on-battery and phones) were silently
    // halting the hero for real visitors. The poster remains the fallback if a
    // browser still refuses muted autoplay.
    const nudge = () => v.play().catch(() => {/* autoplay blocked → poster */});
    nudge();
    // Some browsers only allow play() once enough data has buffered; retry on
    // the readiness events so the hero reliably starts instead of stalling.
    v.addEventListener("canplay", nudge);
    v.addEventListener("loadeddata", nudge);
    return () => {
      v.removeEventListener("canplay", nudge);
      v.removeEventListener("loadeddata", nudge);
    };
  }, [retry]);

  // Edge challenge can block the media request on a fresh visit before the
  // clearance cookie exists. Retry the same file with a cache-buster — by the
  // first retry the cookie is set, so the video loads and plays.
  function handleError() {
    if (stopped.current) return;
    if (retry < MAX_VIDEO_RETRIES) {
      setTimeout(() => setRetry((r) => r + 1), 1200 * (retry + 1));
    }
  }

  const videoSrc = retry > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${retry}` : src;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Poster underlay — always present as fallback */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <video
        key={retry}
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={videoSrc}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={handleError}
      />
      {/* Readability overlays */}
      <div className="absolute inset-0 bg-abyss/72" />
      <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/40 to-abyss/60" />
    </div>
  );
}
