import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Canonical host is the apex (non-www): every brand surface, portal link and
// QR handout uses it, and www 308-redirects here (see vercel.json). A legacy
// NEXT_PUBLIC_SITE_URL that still points at www is coerced to the apex so
// canonical/robots/sitemap can never contradict the redirect.
const CANONICAL_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sjabrankamran.com")
  .replace("https://www.sjabrankamran.com", "https://sjabrankamran.com")
  .replace(/\/$/, "");

export const SITE = {
  name: "Syed Jabran Ali Kamran",
  shortName: "S. Jabran Kamran",
  url: CANONICAL_URL,
  title: "Syed Jabran Ali Kamran — Entrepreneur, Educator & Strategic Consultant",
  description:
    "Syed Jabran Ali Kamran is an entrepreneur, educator, and strategic consultant working across education, international trade, industrial performance, and AI-driven digital transformation.",
  headline:
    "Entrepreneur · Educator · Strategic & Industrial Consultant · AI-Driven Business Builder",
} as const;
