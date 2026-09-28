"use client";

import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";
import { CircleHelp } from "lucide-react";
import { driver, type Driver, type DriveStep } from "driver.js";
import { itemForRoute } from "@/lib/portal/subjects";

const SEEN_KEY = "sjak_portal_tooltips_seen_v1";

export function PortalProductTour({ autoStart = true }: { autoStart?: boolean }) {
  const tourRef = useRef<Driver | null>(null);

  function startTour() {
    tourRef.current?.destroy();
    const links = [...document.querySelectorAll<HTMLElement>("[data-portal-tour]")];
    const steps: DriveStep[] = [
      {
        popover: {
          title: "Welcome to your portal",
          description: "Use Next to explore each live control. The highlighted items are the actual links you will use—not a video demonstration.",
        },
      },
      {
        element: "[data-tour='portal-navigation']",
        popover: {
          title: "Your role-aware navigation",
          description: "The menu automatically shows only the tools available to your student, parent or staff role.",
          side: "right",
          align: "start",
        },
      },
      ...links.map((link): DriveStep => {
        const label = link.dataset.portalTour || link.textContent?.trim() || "Portal feature";
        // Each link's one-line purpose comes from the subject registry.
        const purpose = itemForRoute(link.getAttribute("href"))?.purpose;
        return {
          element: link,
          popover: {
            title: label,
            description: purpose || "Open this section to use the related portal feature.",
            side: "right",
            align: "center",
          },
        };
      }),
      {
        element: "[data-tour='portal-alerts']",
        popover: {
          title: "Real-time alerts",
          description: "The bell updates for announcements, scheduled activities, reminders and marked work.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "[data-tour='portal-profile']",
        popover: {
          title: "Profile and settings",
          description: "Manage your profile, guardian information and available device settings here.",
          side: "bottom",
          align: "end",
        },
      },
    ];

    const tour = driver({
      animate: true,
      smoothScroll: true,
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.74,
      stagePadding: 8,
      stageRadius: 12,
      nextBtnText: "Next feature",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      steps,
      onDestroyed: () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
      },
    });
    tourRef.current = tour;
    tour.drive();
  }

  // Not over the mandatory onboarding form: the tour points at portal features
  // the student cannot open yet, and dismissing it there would mark it seen, so
  // they would never get it once onboarding is done.
  useEffect(() => {
    if (!autoStart) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (seen) return;
    const timer = window.setTimeout(startTour, 700);
    return () => window.clearTimeout(timer);
  }, [autoStart]);

  return (
    <button type="button" onClick={startTour} className="inline-flex items-center gap-1.5 rounded-full border border-cyan/30 px-3 py-1.5 text-xs text-cyan transition hover:bg-cyan/10" title="Explain portal features">
      <CircleHelp size={13} /> <span className="hidden sm:inline">Tour</span>
    </button>
  );
}
