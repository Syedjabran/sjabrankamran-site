"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { MarkdownRenderer } from "./markdown-renderer";

/**
 * Einstein-inspired floating companion — site-wide "ask a physics question"
 * widget. Original illustration (not a copyrighted meme asset). Two frames
 * (tongue-out / smile) cross-fade playfully. Clicking the character opens a
 * mini ask panel powered by the same /api/physics-question endpoint as the
 * Physics Studio. Respects prefers-reduced-motion; dismissible per session.
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
  "What is the difference between e.m.f. and potential difference?",
];

const CURRICULA = ["A-Level", "O-Level", "IBDP", "General"] as const;

export function EinsteinCompanion() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [tongueOut, setTongueOut] = useState(true);
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [roaming, setRoaming] = useState(false); // default: parked, no auto-roam

  const [question, setQuestion] = useState("");
  const [curriculum, setCurriculum] = useState<(typeof CURRICULA)[number]>("A-Level");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [label, setLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const timers = useRef<number[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Drag-to-reposition: hold the mouse button (or a finger) on him and move.
  const [dragging, setDragging] = useState(false);
  const dragMoved = useRef(false);
  const grabOffset = useRef({ x: 0, y: 0 });
  const homePos = useRef<{ x: number; y: number } | null>(null);

  function onGrab(e: React.PointerEvent) {
    if (open) return; // don't drag while the ask panel is open
    if (e.pointerType === "mouse" && e.button !== 0) return; // left button only
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    grabOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragMoved.current = false;
    setRoaming(false); // grabbing pauses auto-roam so he follows the cursor
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragging) return;
    const nx = e.clientX - grabOffset.current.x;
    const ny = e.clientY - grabOffset.current.y;
    if (!dragMoved.current) {
      // Ignore tiny jitters so a normal click still opens the panel.
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect && Math.hypot(nx - rect.left, ny - rect.top) < 3) return;
      dragMoved.current = true;
    }
    // Allow placing him anywhere on screen (keep a sliver on-screen so he's
    // always grabbable again). Works whether roaming or paused.
    setPos({
      x: Math.min(Math.max(-24, nx), window.innerWidth - 56),
      y: Math.min(Math.max(-8, ny), window.innerHeight - 56),
    });
  }

  function onRelease() {
    if (!dragging) return;
    setDragging(false);
    // Manual placement wins: he stays exactly where you drop him, and the spot is
    // remembered across pages/reloads (per browser).
    if (dragMoved.current) {
      setRoaming(false);
      setPos((p) => {
        if (p) { homePos.current = p; try { localStorage.setItem("einstein-pos", JSON.stringify(p)); } catch { /* */ } }
        return p;
      });
    }
  }

  function clampToView(p: { x: number; y: number }) {
    return { x: Math.min(Math.max(8, p.x), window.innerWidth - 72), y: Math.min(Math.max(8, p.y), window.innerHeight - 72) };
  }

  // Free-roaming position (top-left translate offsets).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Wrapper is right-aligned (items-end); pos is the wrapper's top-left offset.
  function parkPosition(panel: boolean) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const width = panel ? Math.min(400, w - 16) : 250;
    const height = panel ? Math.min(h * 0.75, 620) : 210;
    return { x: Math.max(8, w - width - 16), y: Math.max(8, h - height - 12) };
  }

  function randomPosition() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bw = 250; // approx wrapper width incl. speech bubble
    const bh = 220; // approx wrapper height
    const minX = 8;
    const maxX = Math.max(minX, w - bw - 8);
    const minY = 76; // keep clear of the sticky header
    const maxY = Math.max(minY, h - bh - 8);
    return {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
    };
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    if (sessionStorage.getItem("einstein-dismissed") === "1") {
      setDismissed(true);
    } else {
      let start = parkPosition(false);
      try {
        const s = localStorage.getItem("einstein-pos");
        if (s) { const j = JSON.parse(s); if (typeof j?.x === "number" && typeof j?.y === "number") start = clampToView(j); }
      } catch { /* ignore */ }
      homePos.current = start;
      setPos(start);
      const t = window.setTimeout(() => setVisible(true), 250);
      timers.current.push(t);
    }
    return () => {
      mq.removeEventListener("change", onChange);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (dismissed || !visible || open) return;
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
  }, [dismissed, visible, reducedMotion, open]);

  // Free roaming: glide to a new random spot every so often (panel closed only).
  useEffect(() => {
    if (dismissed || !visible) return;
    // Opening the ask panel docks him to a corner so the panel always fits;
    // closing it returns him to the spot you last placed him.
    if (open) { setPos(parkPosition(true)); return; }
    if (dragging) return; // being carried
    if (!roaming || reducedMotion) {
      if (homePos.current) setPos(homePos.current);
      const onResize = () => setPos((p) => (p ? clampToView(p) : p));
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    // Optional playful roam — only when the user presses ▶ (play).
    const wander = window.setInterval(() => setPos(randomPosition()), 24000);
    const first = window.setTimeout(() => setPos(randomPosition()), 4000);
    const onResize = () => setPos((p) => (p ? clampToView(p) : p));
    window.addEventListener("resize", onResize);
    timers.current.push(first);
    return () => { clearInterval(wander); clearTimeout(first); window.removeEventListener("resize", onResize); };
  }, [dismissed, visible, open, reducedMotion, roaming, dragging]);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (question.trim().length < 10) {
      setError("Please write a slightly longer question (at least 10 characters).");
      return;
    }
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/physics-question", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          curriculum,
          topic: "",
          responseMode: "Explain the concept",
          requestReview: false,
          email: "",
          consent: false,
          website: "",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Something went wrong. Please try again.");
      } else if (j.answer) {
        setAnswer(j.answer);
        setLabel(j.label || "AI Physics Tutor");
      } else {
        setAnswer(null);
        setLabel("");
        setError(
          "The tutor is offline right now — your question was saved for a personal teacher review. Try the full Physics Studio to leave your email."
        );
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem("einstein-dismissed", "1");
  }

  if (dismissed || !visible) return null;

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none fixed left-0 top-0 z-40 flex flex-col items-end gap-2"
      style={{
        transform: pos ? `translate3d(${pos.x}px, ${pos.y}px, 0)` : undefined,
        transition: dragging
          ? "none"
          : reducedMotion
            ? undefined
            : open
              ? "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)"
              : "transform 13s cubic-bezier(0.45, 0.05, 0.35, 1)",
        willChange: "transform",
      }}
      aria-live="polite"
    >
      {/* Ask panel */}
      {open && (
        <div
          ref={panelRef}
          className="pointer-events-auto flex max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-cyan/20 bg-space/95 shadow-2xl backdrop-blur sm:w-96"
          role="dialog"
          aria-label="Ask Einstein a physics question"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ice">
              <Sparkles size={14} className="text-cyan" /> Ask a physics question
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the ask panel"
              className="text-dust transition hover:text-ice"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {answer ? (
              <div>
                <span className="mb-2 inline-flex items-center rounded-full border border-cyan/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widelabel text-cyan">
                  {label}
                </span>
                <div className="text-sm leading-relaxed text-fog">
                  <MarkdownRenderer content={answer} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAnswer(null);
                    setQuestion("");
                  }}
                  className="mt-3 text-xs text-cyan underline-offset-2 hover:underline"
                >
                  Ask another question
                </button>
              </div>
            ) : loading ? (
              <div className="space-y-2" role="status" aria-label="The tutor is preparing your answer">
                <div className="skeleton h-4 w-11/12" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-14 w-full" />
                <div className="skeleton h-4 w-3/4" />
                <p className="pt-1 text-center text-xs text-dust">Working through the physics…</p>
              </div>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-fog">
                  Ask anything from your physics course — the AI tutor explains step by step. Or start from an
                  example:
                </p>
                <ul className="space-y-1.5">
                  {EXAMPLES.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => setQuestion(q)}
                        className="w-full rounded-lg border border-white/10 bg-abyss/60 px-2.5 py-1.5 text-left text-xs leading-snug text-fog transition hover:border-cyan/50 hover:text-ice"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {error ? <p className="text-xs leading-relaxed text-signal">{error}</p> : null}
          </div>

          {!answer && (
            <form onSubmit={ask} className="space-y-2 border-t border-white/10 px-4 py-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                placeholder="Type your physics question…"
                className="w-full resize-none rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={curriculum}
                  onChange={(e) => setCurriculum(e.target.value as (typeof CURRICULA)[number])}
                  aria-label="Curriculum"
                  className="rounded-lg border border-white/10 bg-abyss/60 px-2 py-1.5 text-xs text-ice focus:border-cyan focus:outline-none"
                >
                  {CURRICULA.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary ml-auto !px-4 !py-1.5 text-xs disabled:opacity-60"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Ask
                </button>
              </div>
              <p className="text-center text-[10px] leading-snug text-dust">
                AI-assisted · answers are labelled ·{" "}
                <Link href="/physics-studio" className="text-cyan hover:underline" onClick={() => setOpen(false)}>
                  open the full Physics Studio
                </Link>
              </p>
            </form>
          )}
        </div>
      )}

      {/* Speech bubble */}
      {!open && (
        <div className="pointer-events-auto max-w-[13rem] rounded-2xl rounded-br-sm border border-cyan/20 bg-space/95 px-3.5 py-2.5 shadow-lg backdrop-blur sm:max-w-[15rem]">
          <p
            key={msgIndex}
            className={reducedMotion ? "text-xs leading-snug text-ice" : "animate-msg-fade text-xs leading-snug text-ice"}
          >
            {MESSAGES[msgIndex]}
          </p>
        </div>
      )}

      {/* Character */}
      <div className="pointer-events-auto relative">
        <button
          type="button"
          onClick={() => {
            if (dragMoved.current) {
              dragMoved.current = false;
              return; // that was a drag, not a click
            }
            setOpen((v) => !v);
          }}
          onPointerDown={onGrab}
          onPointerMove={onDragMove}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          aria-label={open ? "Close the ask panel" : "Ask Einstein a physics question (left-click and drag to move him)"}
          title="Click to ask · left-click and drag to move me"
          aria-expanded={open}
          className={`relative block h-20 w-20 rounded-full border border-cyan/20 bg-abyss/70 shadow-lg outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-cyan sm:h-24 sm:w-24 ${
            dragging ? "cursor-grabbing scale-105" : "cursor-grab"
          } ${reducedMotion || open || !roaming || dragging ? "" : "animate-einstein-float"}`}
          style={{ touchAction: "none" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/einstein/einstein-tongue.webp"
            alt=""
            fetchPriority="high"
            className={`absolute inset-0 h-full w-full rounded-full object-cover object-top transition-opacity duration-500 ${tongueOut ? "opacity-100" : "opacity-0"}`}
            loading="eager"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/einstein/einstein-smile.webp"
            alt=""
            fetchPriority="high"
            className={`absolute inset-0 h-full w-full rounded-full object-cover object-top transition-opacity duration-500 ${tongueOut ? "opacity-0" : "opacity-100"}`}
            loading="eager"
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
        <button
          type="button"
          onClick={() => setRoaming((r) => !r)}
          aria-label={roaming ? "Stop the helper from moving around" : "Let the helper move around again"}
          title={roaming ? "Stop him here" : "Let him roam"}
          className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-abyss text-dust transition hover:text-cyan"
        >
          {roaming ? <Pause size={10} /> : <Play size={10} />}
        </button>
      </div>
    </div>
  );
}
