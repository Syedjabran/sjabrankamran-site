"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { helperPausedOnPath } from "@/lib/ai/helper-pause-paths";
import { helperForPath } from "@/lib/portal/subjects";
import { MarkdownRenderer } from "./markdown-renderer";
import { ResilientImg } from "@/components/ui/resilient-image";

/**
 * Floating AI helper companion — site-wide "ask a question" widget. Its
 * persona (name, lines, examples, curricula, the API it asks, its two
 * cross-fading frames) is the open page's subject's helper from the subject
 * registry (subjects.ts helperForPath): today Physics' Einstein, an original
 * illustration (not a copyrighted meme asset) backed by the Physics Studio's
 * /api/physics-question. Respects prefers-reduced-motion; dismissible per
 * session.
 */
export function EinsteinCompanion() {
  const pathname = usePathname();
  // Not shown in the Exam Lab or the SAT Lab: tests, no-help assignments and
  // timed modules are sat there (the helper's API refuses those students too).
  const pausedHere = helperPausedOnPath(pathname);
  const helper = helperForPath(pathname);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [tongueOut, setTongueOut] = useState(true);
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const [question, setQuestion] = useState("");
  const [curriculum, setCurriculum] = useState<string>(helper?.curricula[0] ?? "");
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
    // The collapsed footprint is the greeting bubble stacked over the avatar,
    // and the avatar is deliberately smaller below Tailwind's sm breakpoint —
    // reserve the matching height so it parks snugly instead of floating.
    const compact = w < 640;
    const width = panel ? Math.min(400, w - 16) : compact ? 220 : 250;
    const height = panel ? Math.min(h * 0.75, 620) : compact ? 170 : 210;
    return { x: Math.max(8, w - width - 16), y: Math.max(8, h - height - 12) };
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    // Storage can throw when blocked (privacy settings, sandboxed frames); this
    // runs in the root layout, so an uncaught throw would take down every page.
    let wasDismissed = false;
    try { wasDismissed = sessionStorage.getItem("einstein-dismissed") === "1"; } catch { /* treat as not dismissed */ }
    if (wasDismissed) {
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
      () => setMsgIndex((i) => (i + 1) % Math.max(1, helper?.greetings.length ?? 1)),
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
  }, [dismissed, visible, reducedMotion, open, helper]);

  // Position management: NO auto-roaming. He stays exactly where you drop him.
  // Opening the ask panel docks him to a corner so the panel always fits;
  // closing it returns him to the spot you last placed him.
  useEffect(() => {
    if (dismissed || !visible) return;
    if (open) { setPos(parkPosition(true)); return; }
    if (dragging) return; // being carried
    if (homePos.current) setPos(homePos.current);
    const onResize = () => setPos((p) => (p ? clampToView(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dismissed, visible, open, dragging]);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!helper) return;
    setError(null);
    if (question.trim().length < 10) {
      setError("Please write a slightly longer question (at least 10 characters).");
      return;
    }
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch(helper.endpoint, {
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
        setLabel(j.label || helper.answerLabel);
      } else {
        setAnswer(null);
        setLabel("");
        setError(helper.offline);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem("einstein-dismissed", "1"); } catch { /* dismissal lasts for this page view only */ }
  }

  if (dismissed || !visible || pausedHere || !helper) return null;

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
          aria-label={helper.ariaLabel}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ice">
              <Sparkles size={14} className="text-cyan" /> {helper.panelTitle}
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
                <p className="pt-1 text-center text-xs text-dust">{helper.thinking}</p>
              </div>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-fog">{helper.intro}</p>
                <ul className="space-y-1.5">
                  {helper.examples.map((q) => (
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
                placeholder={helper.placeholder}
                className="w-full resize-none rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={curriculum}
                  onChange={(e) => setCurriculum(e.target.value)}
                  aria-label="Curriculum"
                  className="rounded-lg border border-white/10 bg-abyss/60 px-2 py-1.5 text-xs text-ice focus:border-cyan focus:outline-none"
                >
                  {helper.curricula.map((c) => (
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
                <Link href={helper.fullPage.href} className="text-cyan hover:underline" onClick={() => setOpen(false)}>
                  open the full {helper.fullPage.label}
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
            {helper.greetings[msgIndex % helper.greetings.length]}
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
          aria-label={open ? "Close the ask panel" : `${helper.ariaLabel} (left-click and drag to move him)`}
          title="Click to ask · left-click and drag to move me"
          aria-expanded={open}
          className={`relative block h-14 w-14 rounded-full border border-cyan/20 bg-abyss/70 shadow-lg outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-cyan sm:h-20 sm:w-20 lg:h-24 lg:w-24 ${
            dragging ? "cursor-grabbing scale-105" : "cursor-grab"
          }`}
          style={{ touchAction: "none" }}
        >
          <ResilientImg
            src={helper.images[0]}
            alt=""
            fetchPriority="high"
            className={`absolute inset-0 h-full w-full rounded-full object-cover object-top transition-opacity duration-500 ${tongueOut ? "opacity-100" : "opacity-0"}`}
            loading="eager"
          />
          <ResilientImg
            src={helper.images[1]}
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
      </div>
    </div>
  );
}
