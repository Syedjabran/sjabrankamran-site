import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SITE = {
  name: "Syed Jabran Ali Kamran",
  shortName: "S. Jabran Kamran",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sjabrankamran.com",
  title: "Syed Jabran Ali Kamran — Entrepreneur, Educator & Strategic Consultant",
  description:
    "Syed Jabran Ali Kamran is an entrepreneur, educator, and strategic consultant working across education, international trade, industrial performance, and AI-driven digital transformation.",
  headline:
    "Entrepreneur · Educator · Strategic & Industrial Consultant · AI-Driven Business Builder",
} as const;
