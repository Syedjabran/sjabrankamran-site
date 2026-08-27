"use client";

import { useEffect, useRef } from "react";

/**
 * Exam integrity guard. While `active` (the drill/paper timer is running and the
 * script is not yet submitted), it treats any of the following as malpractice and
 * fires `onViolation` exactly once:
 *   - the tab/window is hidden or minimised (visibilitychange => hidden)
 *   - focus leaves the exam window (blur => alt-tab / split-screen interaction)
 *   - the window is shrunk into a split-screen / snapped layout (resize below baseline)
 * It also deters screenshots/printing (PrintScreen, OS snip shortcuts, Ctrl/Cmd+P,
 * right-click, drag & text selection) with a brief black-out — a best-effort
 * deterrent, since browsers cannot fully block OS-level screen capture.
 */
export function useExamGuard({
  active,
  onViolation,
}: {
  active: boolean;
  onViolation: (reason: string) => void;
}) {
  const armed = useRef(false);
  const base = useRef({ w: 0, h: 0 });
  const cb = useRef(onViolation);
  cb.current = onViolation;

  useEffect(() => {
    if (!active) {
      armed.current = false;
      return;
    }
    // Arm after a short grace so the initial focus/layout settling (and any
    // fullscreen request) doesn't trip a false violation.
    const armTimer = setTimeout(() => {
      armed.current = true;
      base.current = { w: window.innerWidth, h: window.innerHeight };
    }, 1400);

    const fire = (reason: string) => {
      if (!armed.current) return;
      armed.current = false;
      cb.current(reason);
    };

    const onVis = () => {
      if (document.hidden) fire("You minimised or switched away from the exam screen.");
    };
    const onBlur = () => fire("You left the exam window (alt-tab / split-screen / another app).");
    const onResize = () => {
      const b = base.current;
      if (!b.w) return;
      if (window.innerWidth < b.w * 0.82 || window.innerHeight < b.h * 0.82) {
        fire("You resized the window into split-screen.");
      }
    };

    const blackout = () => {
      document.documentElement.classList.add("el-blackout");
      setTimeout(() => document.documentElement.classList.remove("el-blackout"), 1000);
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const snip =
        k === "PrintScreen" ||
        (e.metaKey && e.shiftKey && ["3", "4", "5", "S", "s"].includes(k)) || // mac / win snip
        (e.ctrlKey && (k === "p" || k === "P")); // print
      if (snip) {
        try {
          navigator.clipboard?.writeText?.("Screenshots are disabled during an Exam Lab drill.");
        } catch {
          /* ignore */
        }
        blackout();
        e.preventDefault();
      }
    };
    const prevent = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("dragstart", prevent);

    return () => {
      clearTimeout(armTimer);
      armed.current = false;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("dragstart", prevent);
      document.documentElement.classList.remove("el-blackout");
    };
  }, [active]);
}
