/**
 * Web-search skill for the site's AI. SERVER-ONLY.
 *
 * Provider-independent and key-optional so it deploys without new secrets:
 *   1. TAVILY_API_KEY  → Tavily (best quality, AI-oriented)          [optional]
 *   2. BRAVE_API_KEY   → Brave Web Search API                        [optional]
 *   3. no key          → DuckDuckGo Instant Answer (best-effort)     [fallback]
 *
 * Every path is wrapped in a short timeout and never throws — if search is
 * unavailable the caller simply proceeds without grounding, mirroring the
 * tutor's graceful-degradation policy.
 */

export type SearchHit = { title: string; url: string; snippet: string };

const TIMEOUT_MS = 6000;

async function withTimeout(input: RequestInfo, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tavily(query: string, max: number): Promise<SearchHit[]> {
  const r = await withTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: max,
      search_depth: "basic",
    }),
  });
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => null);
  const results = Array.isArray(j?.results) ? j.results : [];
  return results.slice(0, max).map((x: { title?: string; url?: string; content?: string }) => ({
    title: x.title ?? "",
    url: x.url ?? "",
    snippet: (x.content ?? "").slice(0, 400),
  }));
}

async function brave(query: string, max: number): Promise<SearchHit[]> {
  const r = await withTimeout(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`,
    { headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY as string, accept: "application/json" } }
  );
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => null);
  const results = Array.isArray(j?.web?.results) ? j.web.results : [];
  return results.slice(0, max).map((x: { title?: string; url?: string; description?: string }) => ({
    title: x.title ?? "",
    url: x.url ?? "",
    snippet: (x.description ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
  }));
}

async function duckduckgo(query: string, max: number): Promise<SearchHit[]> {
  const r = await withTimeout(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { headers: { accept: "application/json" } }
  );
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => null);
  if (!j) return [];
  const hits: SearchHit[] = [];
  if (j.AbstractText) {
    hits.push({ title: j.Heading ?? query, url: j.AbstractURL ?? "", snippet: String(j.AbstractText).slice(0, 400) });
  }
  const topics = Array.isArray(j.RelatedTopics) ? j.RelatedTopics : [];
  for (const t of topics) {
    if (hits.length >= max) break;
    if (t?.Text) hits.push({ title: (t.Text as string).slice(0, 80), url: t.FirstURL ?? "", snippet: String(t.Text).slice(0, 400) });
  }
  return hits.slice(0, max);
}

/** Run a web search using the best available provider. Never throws. */
export async function webSearch(query: string, max = 5): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    if (process.env.TAVILY_API_KEY) return await tavily(q, max);
    if (process.env.BRAVE_API_KEY) return await brave(q, max);
    return await duckduckgo(q, max);
  } catch {
    return [];
  }
}

/** Compact grounding block for an LLM prompt. Empty string when nothing found. */
export async function groundingContext(query: string, max = 4): Promise<string> {
  const hits = await webSearch(query, max);
  if (!hits.length) return "";
  return (
    "Reference snippets from a web search (verify before use):\n" +
    hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}\n${h.url}`).join("\n\n")
  );
}

export function webSearchProvider(): "tavily" | "brave" | "duckduckgo" {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_API_KEY) return "brave";
  return "duckduckgo";
}
