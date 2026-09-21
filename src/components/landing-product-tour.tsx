"use client";

import "driver.js/dist/driver.css";
import { useRef } from "react";
import { CircleHelp } from "lucide-react";
import { driver, type Driver } from "driver.js";

const SEEN_KEY = "sjak_live_tour_seen_v1";

export function LandingProductTour() {
  const tourRef = useRef<Driver | null>(null);

  function startTour() {
    tourRef.current?.destroy();
    const tour = driver({
      animate: true,
      smoothScroll: true,
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 10,
      stageRadius: 16,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Open portal",
      steps: [
        {
          element: "[data-tour='welcome']",
          popover: {
            title: "Welcome to the learning ecosystem",
            description: "This website connects Cambridge Physics teaching, resources, assessments and personalised guidance in one place.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "[data-tour='portal-entry']",
          popover: {
            title: "Enter the Education Portal",
            description: "Students, parents and staff sign in here to reach classes, tasks, Exam Lab, progress, notifications and study plans.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "[data-tour='physics-studio']",
          popover: {
            title: "Explore Physics Studio",
            description: "Visit the public Physics Studio for teaching information, learning resources and Exam Lab access.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "[data-tour='educator-profile']",
          popover: {
            title: "Built around expert guidance",
            description: "The portal extends Syed Jabran Ali Kamran's Cambridge Physics teaching beyond the classroom.",
            side: "left",
            align: "center",
            onNextClick: () => {
              try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
              tour.destroy();
              window.location.href = "/portal/login";
            },
          },
        },
      ],
      onDestroyed: () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
      },
    });
    tourRef.current = tour;
    tour.drive();
  }

  // The first-visit experience is the professional video tour. Keep this
  // interactive tooltip tour available on demand without opening both at once.

  return (
    <button
      type="button"
      onClick={startTour}
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-abyss/95 px-4 py-2.5 text-sm font-semibold text-cyan shadow-2xl backdrop-blur transition hover:bg-space"
      aria-label="Start website tour"
    >
      <CircleHelp size={17} /> Guided tour
    </button>
  );
}
