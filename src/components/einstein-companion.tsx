"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Einstein-inspired interactive companion for the Physics Studio.
 * Original illustration (not a copyrighted meme asset). Two frames
 * (tongue-out / smile) cross-fade for a playful "tongue" animation.
 * Respects prefers-reduced-motion; dismissible; mobile-friendly.
 */

const MESSAGES = [
  "Curious minds ask better questions.",
  "Stuck on a physics problem? Ask me.",
  "Let us turn confusion into understanding.",
  "Ready to challenge the universe?",
  "No question is too small for physics.",
  "Ask before gravity pulls your marks down.",
  "Let us calculate it together.",
];

const EXAMPLES = [
  "Why does a satellite in a higher orbit move more slowly?",
  "A car brakes from 30 m/s to rest in 60 m. Find the deceleration.",
  "Explain the difference between e.m.f. and potential difference.",
];

export function EinsteinCompanion() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [tongueOut, setTongueOut] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    if (sessionStorage.getItem("einstein-dismissed") === "1") {
      setDismissed(true);
    } else {
      // Ease into view after a moment rather than popping instantly.
      const t = window.setTimeout(() => setVisible(true), 1200);
      timers.current.push(t);
    }
    return () => {
      mq.removeEventListener("change", onChange);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  // Rotate messages; subtle tongue in/out swap. Skipped under reduced motion.
  useEffect(() => {
    if (dismissed || !visible) return;
    const msgTimer = window.setInterval(
      () => setMsgIndex((i) => (i + 1) % MESSAGES.length),
      8000
    );
    let tongueTimer: number | undefined;
    if (!reducedMotion) {
      tongueTimer = window.setInterval(() => {
        setTongueOut(false);
        const back = window.setTimeout(() => setTongueOut(true), 1600);
        timers.current.push(back);
      }, 11000);
    }
    return () => {
      clearInterval(msgTimer);
      if (tongueTimer) clearInterval(tongueTimer);
    };
  }, [dismissed, visible, reducedMotion]);

  function focusQuestion() {
    const el = document.getElementById("physics-question-input");
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      window.setTimeout(() => (el as HTMLTextAreaElement).focus({ preventScroll: true }), reducedMotion ? 0 : 450);
    }
  }

  function useExample(q: string) {
    window.dispatchEvent(new CustomEvent("physics-studio:example", { detail: q }));
    setHelpOpen(false);
    focusQuestion();
  }

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem("einstein-dismissed", "1");
  }

  if (dismissed || !visible) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-40 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
    >
      {/* Help bubble */}
      {helpOpen && (
        <div className="pointer-events-auto w-64 rounded-2xl border border-white/10 bg-space/95 p-4 shadow-xl backdrop-blur sm:w-72">
          <p className="text-xs font-semibold text-ice">How to ask a great question</p>
          <p className="mt-1 text-xs leading-relaxed text-fog">
            Say what you tried, what you expected, and where it went wrong. Or start from an example:
          </p>
          <ul className="mt-2 space-y-1.5">
            {EXAMPLES.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => useExample(q)}
                  className="w-full rounded-lg border border-white/10 bg-abyss/60 px-2.5 py-1.5 text-left text-xs leading-snug text-fog transition hover:border-cyan/50 hover:text-ice"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Speech bubble */}
      <div className="pointer-events-auto max-w-[13rem] rounded-2xl rounded-br-sm border border-cyan/20 bg-space/95 px-3.5 py-2.5 shadow-lg backdrop-blur sm:max-w-[15rem]">
        <p key={msgIndex} className={reducedMotion ? "text-xs leading-snug text-ice" : "animate-msg-fade text-xs leading-snug text-ice"}>
          {MESSAGES[msgIndex]}
        </p>
      </div>

      {/* Character */}
      <div className="pointer-events-auto relative">
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          onDoubleClick={focusQuestion}
          aria-label="Physics Studio helper — open question tips"
          className={`relative block h-20 w-20 cursor-pointer rounded-full border border-cyan/20 bg-abyss/70 shadow-lg outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-cyan sm:h-24 sm:w-24 ${
            reducedMotion ? "" : "animate-einstein-float"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/einstein/einstein-tongue.webp"
            alt=""
            className={`absolute inset-0 h-full w-full rounded-full object-cover object-top transition-opacity duration-500 ${tongueOut ? "opacity-100" : "opacity-0"}`}
            loading="lazy"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/einstein/einstein-smile.webp"
            alt=""
            className={`absolute inset-0 h-full w-full rounded-full object-cover object-top transition-opacity duration-500 ${tongueOut ? "opacity-0" : "opacity-100"}`}
            loading="lazy"
          />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the helper"
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-abyss text-dust transition hover:text-ice"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
