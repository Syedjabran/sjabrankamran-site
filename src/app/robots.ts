import type { MetadataRoute } from "next";
import { SITE } from "@/lib/utils";

// Single canonical host (non-www) — derived from SITE.url so robots, sitemap
// and canonical tags can never disagree again. /portal/ is additionally kept
// out of crawl here; real protection remains auth + per-page noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/portal/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
