import type { MetadataRoute } from "next";
import { SITE } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "",
    "profile",
    "education",
    "physics-studio",
    "enterprise",
    "ai-technology",
    "insights",
    "contact",
  ];
  return pages.map((p) => ({
    url: `${SITE.url}/${p}`,
    lastModified: new Date(),
    changeFrequency: p === "" || p === "physics-studio" ? "weekly" : "monthly",
    priority: p === "" ? 1 : p === "education" || p === "physics-studio" ? 0.9 : 0.7,
  }));
}
