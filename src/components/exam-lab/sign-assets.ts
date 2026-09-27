// src/components/exam-lab/sign-assets.ts
//
// Staff views of stored papers (drill records, the printable paper): signed
// URLs for exam-asset images through /api/exam-lab/asset, 80 paths a call
// (its limit). The server hands the same URL out for an hour
// (src/lib/sat/signed-images.ts), so the browser and the storage CDN cache
// each image; `fresh` asks for a new signature -- the one retry of an image
// that failed to load. A path the server could not sign is simply missing.
export async function signAssetPaths(paths: string[], fresh = false): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    try {
      const res = await fetch("/api/exam-lab/asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fresh ? { paths: chunk, fresh } : { paths: chunk }),
      });
      const j = (await res.json().catch(() => null)) as { urls?: Record<string, string> } | null;
      if (res.ok && j?.urls) Object.assign(out, j.urls);
    } catch { /* an unsigned path renders as "image unavailable" */ }
  }
  return out;
}
