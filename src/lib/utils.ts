import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SITE = {
  name: "Syed Jabran Ali Kamran",
  shortName: "S. Jabran Kamran",
  // Canonical host is the apex (non-www): every brand surface, portal link and
  // QR handout uses it, and www 308-redirects here (see vercel.json). Keep the
  // fallback in sync with that redirect or canonical/sitemap signals split.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://sjabrankamran.com",
  title: "Syed Jabran Ali Kamran — Entrepreneur, Educator & Strategic Consultant",
  description:
    "Syed Jabran Ali Kamran is an entrepreneur, educator, and strategic consultant working across education, international trade, industrial performance, and AI-driven digital transformation.",
  headline:
    "Entrepreneur · Educator · Strategic & Industrial Consultant · AI-Driven Business Builder",
} as const;
