"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HeroVideo — cinematic, licence-safe background video.
 * - Lazy: the <video> src is attached only when the hero nears the viewport.
 * - Silent, muted, looping, playsInline; poster shown until playable.
 * - Respects prefers-reduced-motion and the Save-Data hint: poster only.
 * - Always sits behind a dark overlay so text stays readable.
 */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (active && videoRef.current) {
      videoRef.current.play().catch(() => {
        /* autoplay blocked → poster remains */
      });
    }
  }, [active]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Poster underlay — always present as fallback */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      {active ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : null}
      {/* Readability overlays */}
      <div className="absolute inset-0 bg-abyss/72" />
      <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/40 to-abyss/60" />
    </div>
  );
}
