import type { MetadataRoute } from "next";
import { PORTAL_APP_NAME, PORTAL_NAME } from "@/lib/portal/brand";
import { portalItem } from "@/lib/portal/subjects";

const TIMETABLE = portalItem("timetable");
const EXAM_LAB = portalItem("exam-lab");

/**
 * PWA web manifest — makes the site (and the Education Portal) installable
 * on phones/tablets. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PORTAL_APP_NAME,
    short_name: PORTAL_NAME,
    description:
      "Cambridge Physics educator, entrepreneur and AI consultant. Physics Studio tutor and the Education Portal for students, parents, teachers and staff.",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    orientation: "portrait-primary",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Education Portal", short_name: "Portal", url: "/portal" },
      { name: "Notifications", short_name: "Alerts", url: "/portal/notifications" },
      // Subject pages: named by the subject registry.
      { name: TIMETABLE.menuLabel, short_name: TIMETABLE.name, url: TIMETABLE.route },
      { name: EXAM_LAB.menuLabel, short_name: EXAM_LAB.name, url: EXAM_LAB.route },
    ],
  };
}
