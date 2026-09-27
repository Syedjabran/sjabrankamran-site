// src/lib/sat/image-urls.ts
//
// Pure rules behind stable signed image URLs (signed-images.ts signs; this
// decides -- Node-testable, no answer data). A Supabase signed URL embeds
// the moment it was signed, so signing one image twice gives two different
// URLs, and every new URL misses both the browser's cache and the storage
// CDN's: measured 2026-09-27 from Pakistan, a CDN miss answers in ~0.6-2 s,
// a hit on the same URL in ~0.1 s. So the server keeps each URL it signs
// and hands the same one out for its first hour; each is signed for two,
// so every URL handed out still has at least an hour to run -- the same
// guarantee as before, when each lasted exactly one.
//
// Also: which image paths a state the student is shown already names --
// never a rationale of an unchecked question or an unsubmitted module (a
// running module's state has none), so a response may carry their URLs.
import type { DrillState, SessionState } from "./client-types.ts";

/** How long each signed URL is valid, seconds. */
export const SIGNED_URL_TTL_S = 2 * 60 * 60;
/** How long the server hands out the same URL after signing it. */
export const SIGNED_URL_REUSE_MS = 60 * 60_000;
/** Entries kept at most (the bank's question and rationale images, and the
 *  practice tests', are ~8,000 paths). */
export const SIGNED_URL_CACHE_MAX = 20_000;

export type SignedUrlEntry = { url: string; signedAt: number };
export type SignedUrlCache = Map<string, SignedUrlEntry>;

/** The URLs `cache` can hand out again for `paths` at `now` (signed less
 *  than `reuseMs` ago), and the paths that need signing. Duplicates and
 *  empty paths are dropped. */
export function reuseSigned(
  cache: SignedUrlCache, paths: string[], now: number, reuseMs: number = SIGNED_URL_REUSE_MS,
): { urls: Record<string, string>; toSign: string[] } {
  const urls: Record<string, string> = {};
  const toSign: string[] = [];
  for (const path of new Set(paths)) {
    if (!path) continue;
    const hit = cache.get(path);
    if (hit && now >= hit.signedAt && now - hit.signedAt < reuseMs) urls[path] = hit.url;
    else toSign.push(path);
  }
  return { urls, toSign };
}

/** Records URLs just signed at `now`. Past `max` entries, the ones no longer
 *  handed out go first, then the oldest signed. */
export function rememberSigned(
  cache: SignedUrlCache, urls: Record<string, string>, now: number, max: number = SIGNED_URL_CACHE_MAX, reuseMs: number = SIGNED_URL_REUSE_MS,
): void {
  for (const [path, url] of Object.entries(urls)) {
    cache.delete(path); // re-inserted: the Map's order stays oldest-signed first
    cache.set(path, { url, signedAt: now });
  }
  if (cache.size <= max) return;
  for (const [path, entry] of cache) if (now - entry.signedAt >= reuseMs) cache.delete(path);
  for (const path of cache.keys()) {
    if (cache.size <= max) break;
    cache.delete(path);
  }
}

/** Every image a state shows or can show without another request: a
 *  drill's questions and its CHECKED questions' rationales; a sitting's
 *  current module and, once it is finished, its review. */
export function imagePathsOf(state: SessionState | DrillState): string[] {
  const paths = state.kind === "drill"
    ? [...state.questions.map((q) => q.img), ...Object.values(state.checked).map((r) => r.rationaleImg ?? "")]
    : [...(state.stage?.questions.map((q) => q.img) ?? []), ...(state.report?.review.flatMap((r) => [r.img, r.rationaleImg ?? ""]) ?? [])];
  return [...new Set(paths.filter(Boolean))];
}
