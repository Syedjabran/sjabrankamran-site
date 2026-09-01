"use client";

import { useEffect, useRef } from "react";

/**
 * Exam integrity guard — mode-aware.
 *
 *   "off"      Practice. No monitoring at all. The student may switch tabs,
 *              minimise, use notes — nothing is captured or cancelled.
 *   "standard" No-help assignment. The classic guard: leaving the exam window
 *              (hidden / blur / split-screen) cancels the drill. Screenshots are
 *              deterred with a black-out. Every trip is reported via onEvent.
 *   "strict"   Formal test. Everything in "standard" PLUS screenshot / print /
 *              copy / full-screen-exit are treated as TERMINAL violations (they
 *              cancel + lock the test), and a wider net of events is reported to
 *              the forensic log (contextmenu, copy, paste, blur, focus, PiP).
 *
 * The hook reports two channels:
 *   - onEvent(ev)      every integrity-relevant signal (for the forensic log),
 *                      whether or not it cancels the attempt.
 *   - onViolation(ev)  fired at most once, only for a TERMINAL event, so the
 *                      caller can void/lock the attempt.
 *
 * NOTE (honest limits): browsers cannot fully block OS-level screenshots or
 * third-party screen recorders. Screenshot/print key-combos and the black-out
 * are a strong deterrent; genuine assurance in "strict" mode comes from the
 * combination of these signals with the on-device camera proctor.
 */

export type GuardMode = "off" | "standard" | "strict";

export type GuardEvent = {
  type:
    | "hidden"
    | "blur"
    | "focus"
    | "resize_split"
    | "screenshot"
    | "print"
    | "contextmenu"
    | "copy"
    | "paste"
    | "cut"
    | "fullscreen_exit"
    | "pip"
    | "devtools";
  reason: string;
  terminal: boolean;
  at: number;
};

export function useExamGuard({
  active,
  mode = "standard",
  onViolation,
  onEvent,
}: {
  active: boolean;
  mode?: GuardMode;
  onViolation: (reason: string) => void;
  onEvent?: (ev: GuardEvent) => void;
}) {
  const armed = useRef(false);
  const fired = useRef(false);
  const base = useRef({ w: 0, h: 0 });
  const cb = useRef(onViolation);
  const evb = useRef(onEvent);
  cb.current = onViolation;
  evb.current = onEvent;

  useEffect(() => {
    // Practice mode: zero monitoring.
    if (!active || mode === "off") {
      armed.current = false;
      return;
    }
    const strict = mode === "strict";

    const armTimer = setTimeout(() => {
      armed.current = true;
      base.current = { w: window.innerWidth, h: window.innerHeight };
    }, 1400);

    const report = (type: GuardEvent["type"], reason: string, terminal: boolean) => {
      const ev: GuardEvent = { type, reason, terminal, at: Date.now() };
      try { evb.current?.(ev); } catch { /* ignore */ }
      if (terminal && armed.current && !fired.current) {
        fired.current = true;
        armed.current = false;
        cb.current(reason);
      }
    };

    // A focused answer field means the on-screen keyboard is up on touch
    // devices — that legitimately shrinks the viewport height and can blur the
    // window, so we must not treat it as cheating.
    const fieldFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "");
    };

    const onVis = () => {
      if (document.hidden) report("hidden", "You minimised or switched away from the exam screen.", true);
    };
    const onBlur = () => {
      if (fieldFocused()) return;
      report("blur", "You left the exam window (alt-tab / split-screen / another app).", true);
    };
    const onFocus = () => {
      // Non-terminal: useful in the forensic timeline to see how long they were away.
      if (strict) report("focus", "Returned to the exam window.", false);
    };
    const onResize = () => {
      let b = base.current;
      if (!b.w) return;
      if (!fieldFocused() && (window.innerWidth > b.w || window.innerHeight > b.h)) {
        base.current = { w: Math.max(b.w, window.innerWidth), h: Math.max(b.h, window.innerHeight) };
        b = base.current;
      }
      const widthDrop = window.innerWidth < b.w * 0.8;
      const heightDrop = window.innerHeight < b.h * 0.72 && !fieldFocused();
      if (widthDrop || heightDrop) report("resize_split", "You resized the window into split-screen.", true);
    };

    const blackout = () => {
      document.documentElement.classList.add("el-blackout");
      setTimeout(() => document.documentElement.classList.remove("el-blackout"), 1000);
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const snip =
        k === "PrintScreen" ||
        (e.metaKey && e.shiftKey && ["3", "4", "5", "S", "s"].includes(k)) ||
        (e.ctrlKey && (k === "p" || k === "P"));
      if (snip) {
        try { navigator.clipboard?.writeText?.("Screenshots are disabled during an Exam Lab drill."); } catch { /* ignore */ }
        blackout();
        e.preventDefault();
        const isPrint = e.ctrlKey && (k === "p" || k === "P");
        // Strict tests cancel on a capture attempt; standard drills only deter + log.
        report(isPrint ? "print" : "screenshot", isPrint ? "You tried to print the test." : "You tried to screenshot the test.", strict);
      }
    };
    const onCopy = () => report("copy", "You tried to copy the test content.", strict);
    const onCut = () => report("cut", "You tried to cut the test content.", strict);
    const onPaste = () => report("paste", "You tried to paste into the test.", false);
    const preventCtx = (e: Event) => { e.preventDefault(); report("contextmenu", "You opened the right-click menu.", false); };
    const preventDrag = (e: Event) => e.preventDefault();
    const onFsChange = () => {
      if (strict && !document.fullscreenElement) {
        report("fullscreen_exit", "You left full-screen exam mode.", true);
      }
    };
    const onPip = () => report("pip", "Picture-in-Picture opened during the test.", strict);

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    document.addEventListener("contextmenu", preventCtx);
    document.addEventListener("dragstart", preventDrag);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    if (strict) {
      document.addEventListener("fullscreenchange", onFsChange);
      document.addEventListener("enterpictureinpicture", onPip as EventListener);
    }

    return () => {
      clearTimeout(armTimer);
      armed.current = false;
      fired.current = false;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      document.removeEventListener("contextmenu", preventCtx);
      document.removeEventListener("dragstart", preventDrag);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("enterpictureinpicture", onPip as EventListener);
      document.documentElement.classList.remove("el-blackout");
    };
  }, [active, mode]);
}
