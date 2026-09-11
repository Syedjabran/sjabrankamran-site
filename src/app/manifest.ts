import type { MetadataRoute } from "next";

/**
 * PWA web manifest — makes the site (and the Education Portal) installable
 * on phones/tablets. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Syed Jabran Ali Kamran — Physics Educator & Education Portal",
    short_name: "SJAK",
    description:
      "Cambridge Physics educator, entrepreneur and AI consultant. Physics Studio tutor and the Education Portal for students, parents, teachers and staff.",
    start_url: "/",
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
      { name: "Physics timetable", short_name: "Timetable", url: "/portal/timetable" },
      { name: "Exam Lab", short_name: "Exam Lab", url: "/portal/exam-lab" },
    ],
  };
}
