// src/lib/sat/signed-images.ts
//
// SERVER-ONLY. Signed URLs for the private exam-asset images, stable for an
// hour (image-urls.ts: the same image gets the same URL, so the browser and
// the storage CDN can cache it). Used by the signing endpoint
// (/api/exam-lab/asset) and by the SAT responses that already name images
// -- a drill page, a sitting's state, a checked drill question -- so their
// images start loading without a second round trip. Those responses wait
// at most IMAGES_WAIT_MS for it and go without on a slow signing (the page
// signs what is missing). Callers check access; this only signs.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DrillState, SessionState } from "./client-types.ts";
import {
  IMAGES_WAIT_MS, SIGNED_URL_REUSE_MS, SIGNED_URL_TTL_S, imagePathsOf, rememberSigned, reuseSigned, settleWithin, type SignedUrlCache,
} from "./image-urls.ts";

const BUCKET = "exam-assets";
const SIGN_CHUNK = 100;
// One cache per server process, shared by every route that signs.
const CACHE_KEY = Symbol.for("sjak.signedImageUrls");

function cache(): SignedUrlCache {
  const g = globalThis as unknown as Record<symbol, SignedUrlCache | undefined>;
  const existing = g[CACHE_KEY];
  if (existing) return existing;
  const created: SignedUrlCache = new Map();
  g[CACHE_KEY] = created;
  return created;
}

/** URLs for `paths` (a path the bucket has no object for is left out), or
 *  `ok: false` when signing failed. `fresh`: a new signature for each path
 *  even if one was handed out within the hour -- the retry of an image that
 *  failed to load with its URL. Local development with SAT_LOCAL_CROPS=1
 *  points sat/ paths at the dev-only local image route instead. */
export async function imageUrls(paths: string[], opts: { fresh?: boolean } = {}): Promise<{ ok: true; urls: Record<string, string> } | { ok: false }> {
  const urls: Record<string, string> = {};
  const localSat = process.env.NODE_ENV === "development" && process.env.SAT_LOCAL_CROPS === "1";
  if (localSat) for (const p of paths) if (p.startsWith("sat/")) urls[p] = `/api/sat/local-image?path=${encodeURIComponent(p)}`;
  const now = Date.now();
  const { urls: reused, toSign } = reuseSigned(cache(), paths.filter((p) => !urls[p]), now, SIGNED_URL_REUSE_MS, opts.fresh === true);
  Object.assign(urls, reused);
  if (!toSign.length) return { ok: true, urls };
  try {
    const storage = createAdminClient().storage.from(BUCKET);
    const chunks: string[][] = [];
    for (let i = 0; i < toSign.length; i += SIGN_CHUNK) chunks.push(toSign.slice(i, i + SIGN_CHUNK));
    const results = await Promise.all(chunks.map((chunk) => storage.createSignedUrls(chunk, SIGNED_URL_TTL_S)));
    const signed: Record<string, string> = {};
    for (const { data, error } of results) {
      if (error) {
        console.error("signed url error", error.message);
        return { ok: false };
      }
      for (const d of data ?? []) if (d.signedUrl && d.path) signed[d.path] = d.signedUrl;
    }
    rememberSigned(cache(), signed, now);
    return { ok: true, urls: { ...urls, ...signed } };
  } catch {
    return { ok: false };
  }
}

/** The URLs of the images `state` shows (imagePathsOf), for a response
 *  that carries it; undefined when there are none, signing failed or took
 *  longer than IMAGES_WAIT_MS (the page then signs them itself). */
export function imagesFor(state: SessionState | DrillState): Promise<Record<string, string> | undefined> {
  return imagesOf(imagePathsOf(state));
}

/** `imageUrls` for a response, bounded by IMAGES_WAIT_MS: the URLs, or
 *  undefined on failure, timeout or none. Never rejects. */
export function imagesOf(paths: string[]): Promise<Record<string, string> | undefined> {
  if (!paths.length) return Promise.resolve(undefined);
  const signing = imageUrls(paths).then((got) => (got.ok && Object.keys(got.urls).length ? got.urls : undefined));
  return settleWithin(signing, IMAGES_WAIT_MS, undefined);
}
