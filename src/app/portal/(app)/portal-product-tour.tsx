"use client";

import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";
import { CircleHelp } from "lucide-react";
import { driver, type Driver, type DriveStep } from "driver.js";

const SEEN_KEY = "sjak_portal_tooltips_seen_v1";

const HELP: Record<string, string> = {
  "Dashboard": "Your daily starting point for upcoming classes, tasks, announcements and study priorities.",
  "Physics timetable": "See lessons and additional classes filtered for your school, class and group.",
  "My study plan": "Follow personalised weekly activities based on your performance and learning needs.",
  "Exam Lab": "Open assigned tests, topical practice, past papers and timed assessments.",
  "My answer scripts": "Review submitted answers, marks, correct responses and teacher feedback.",
  "My Learning": "Find assignments and individual tasks, organised by status and deadline.",
  "My Progress": "Track patterns across assessments, practice and attendance.",
  "My Ranking": "Understand the performance pillars behind your private comparative position.",
  "Leaderboard": "View privacy-safe class and network comparisons using student call-signs.",
  "Notifications": "Read announcements, test reminders, class changes and marked-work alerts.",
  "Resource Library": "Open approved notes, worksheets, videos and collaborative learning material.",
  "Physics Resources": "Browse curated Cambridge Physics resources and supporting content.",
  "Users & activity": "Manage portal users and inspect authorised activity records.",
  "Access locks": "Lock or suspend a user, group, class or school with a custom message.",
  "Rankings & analytics": "Review performance evidence and portal analytics.",
  "Institutions": "Manage the school, class and group hierarchy.",
  "Post / Tests": "Assign learning activities and Exam Lab assessments.",
  "Attendance": "Record and manage lesson attendance.",
  "Daily attendance": "Review the current attendance picture for authorised classes.",
  "Proctoring & Locks": "Monitor proctored assessments and exam restrictions.",
  "Email": "Manage portal email communication and delivery status.",
  "Announcements": "Publish targeted announcements to portal users.",
  "Academics": "Manage academic configuration and teaching structures.",
  "Fees & Finance": "Access authorised fee and finance administration.",
  "My Classes": "Open the classes and students assigned to you.",
  "Physics Studio": "Reach the teaching and studio workspace.",
};

export function PortalProductTour() {
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
        return {
          element: link,
          popover: {
            title: label,
            description: HELP[label] || "Open this section to use the related portal feature.",
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

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (seen) return;
    const timer = window.setTimeout(startTour, 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <button type="button" onClick={startTour} className="inline-flex items-center gap-1.5 rounded-full border border-cyan/30 px-3 py-1.5 text-xs text-cyan transition hover:bg-cyan/10" title="Explain portal features">
      <CircleHelp size={13} /> <span className="hidden sm:inline">Tour</span>
    </button>
  );
}
