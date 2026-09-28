"use client";

import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { driver, type Driver, type DriveStep } from "driver.js";
import { isTourHome, presentSteps, tourSteps, type PortalNav } from "@/lib/portal/portal-nav";
import { TOUR_POPOVER_CLASS } from "@/lib/portal/tour-style";

// v2: the subject-first navigation replaced the sidebar the first tour
// walked, so everyone sees the new tour once.
const SEEN_KEY = "sjak_portal_tooltips_seen_v2";

/**
 * The product tour: the viewer's own navigation, step by step (portal-nav.ts
 * `tourSteps`), on the page they are on. A step whose control isn't on the
 * page (a group the role doesn't have, a space they can't open) is skipped.
 */
export function PortalProductTour({ nav, autoStart = true }: { nav: PortalNav; autoStart?: boolean }) {
  const tourRef = useRef<Driver | null>(null);
  const pathname = usePathname();

  function startTour() {
    tourRef.current?.destroy();
    const steps = presentSteps(tourSteps(nav, pathname), (target) => !!document.querySelector(target))
      .map((step): DriveStep => ({
        element: step.target ?? undefined,
        popover: { title: step.title, description: step.body, side: step.side, align: step.align },
      }));
    const tour = driver({
      animate: true,
      smoothScroll: true,
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      allowClose: true,
      overlayColor: "#02040b",
      overlayOpacity: 0.72,
      stagePadding: 6,
      stageRadius: 14,
      popoverClass: TOUR_POPOVER_CLASS,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      steps,
      onDestroyed: () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
      },
    });
    tourRef.current = tour;
    tour.drive();
  }

  // It starts by itself once per user, and only where it has something to
  // walk: a home page (the portal home, a desk) or a subject space. Never over
  // the mandatory onboarding form (autoStart is off there: dismissing it would
  // mark it seen before the student could use the portal), never on a sitting
  // or a deep link into one (a SAT session, an Exam Lab allocation link), and
  // never over a full-screen run. It waits until the page's skeletons have
  // given way to its cards, so no step is dropped for arriving late.
  useEffect(() => {
    if (!autoStart || !isTourHome(pathname, nav)) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (seen) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 40 || document.fullscreenElement || document.querySelector(".el-exam-live")) { window.clearInterval(timer); return; }
      if (document.querySelector("#portal-content [aria-busy='true']")) return;
      window.clearInterval(timer);
      if (!tourRef.current?.isActive()) startTour();
    }, 350);
    return () => window.clearInterval(timer);
    // startTour reads this render's pathname and nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, pathname]);

  useEffect(() => () => tourRef.current?.destroy(), []);

  return (
    <button type="button" onClick={startTour} aria-label="Take the tour" title="Take the tour"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-fog transition hover:border-cyan/40 hover:text-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
      <CircleHelp size={16} />
    </button>
  );
}
