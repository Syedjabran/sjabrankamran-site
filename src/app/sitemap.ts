import type { MetadataRoute } from "next";
export default function sitemap():MetadataRoute.Sitemap{const pages=["","about","ventures","education","consulting","projects","ai","insights","contact"];return pages.map(p=>({url:`https://www.sjabrankamran.com/${p}`,lastModified:new Date(),changeFrequency:p===""?"weekly":"monthly",priority:p===""?1:0.7}))}
