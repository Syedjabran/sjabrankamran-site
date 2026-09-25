import type { MetadataRoute } from "next";
import { SITE } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    "",
    "profile",
    "education",
    "physics",
    "physics/cambridge-a-level-9702",
    "physics/o-level-5054",
    "physics/ib",
    "physics-studio",
    "physics-studio/library",
    "physics-studio/exam-lab",
    "enterprise",
    "ai-technology",
    "insights",
    "contact",
  ];

  const staticEntries: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${SITE.url}/${p}`,
    lastModified: new Date(),
    changeFrequency:
      p === "" || p === "physics-studio" || p === "physics-studio/library" ? "weekly" : "monthly",
    priority: p === "" ? 1 : p === "education" || p === "physics-studio" ? 0.9 : 0.7,
  }));

  // Approved, published library answers (best-effort; never break the sitemap).
  let libraryEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("physics_questions")
      .select("slug, reviewed_at")
      .eq("is_public", true)
      .eq("review_status", "approved")
      .eq("moderation_status", "ok")
      .order("reviewed_at", { ascending: false })
      .limit(1000);
    libraryEntries = ((data ?? []) as { slug: string | null; reviewed_at: string | null }[])
      .filter((r) => r.slug)
      .map((r) => ({
        url: `${SITE.url}/physics-studio/library/${r.slug}`,
        lastModified: r.reviewed_at ? new Date(r.reviewed_at) : new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
  } catch {
    /* schema not migrated or DB unavailable — ship the static sitemap */
  }

  return [...staticEntries, ...libraryEntries];
}
