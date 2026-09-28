"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskRound } from "lucide-react";

/** How long the placeholder may wait for the lab before stepping aside anyway. */
const GIVE_UP_MS = 15_000;

/**
 * The Practical Lab's frame, with a placeholder over it until the lab has
 * loaded, instead of a blank box. The load can finish before this component
 * hydrates (onLoad would then never fire), so the frame's own document is
 * checked on mount too (it is same-origin, /lab); and the placeholder never
 * stays longer than GIVE_UP_MS.
 */
export function LabFrame({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc && doc.readyState === "complete" && doc.URL !== "about:blank") setLoaded(true);
    } catch { /* not readable: wait for onLoad */ }
    const timer = window.setTimeout(() => setLoaded(true), GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className="block h-[calc(100dvh-8rem)] min-h-[28rem] w-full rounded-2xl border border-white/10 bg-abyss"
      />
      {loaded ? null : (
        <div role="status" aria-busy="true" className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border border-white/10 bg-space">
          <span className="flex flex-col items-center gap-3 text-sm text-fog motion-safe:animate-pulse">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald2/30 bg-emerald2/10 text-emerald2">
              <FlaskRound size={22} aria-hidden="true" />
            </span>
            Setting up the lab…
          </span>
        </div>
      )}
    </div>
  );
}
