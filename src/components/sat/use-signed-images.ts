"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTimeoutError, splitSignedUrls } from "./sat-runner-utils";

const BATCH_SIZE = 80; // the signing endpoint's per-request limit
const SIGN_TIMEOUT_MS = 20_000;
const RETRY_AFTER_MS = 3_000;
const SIGN_FAILED = "Images couldn't be loaded.";
const SIGN_TIMED_OUT = "Images couldn't be loaded — the connection timed out.";
const NOT_AVAILABLE = "This question's image isn't available yet.";

export type SignedImages = {
  /** Signed URL per path. A path keeps its URL for the life of the page
   *  (only `resign` replaces one), so the browser's cache always finds it
   *  -- and an image already on screen stays while a new set is signed. */
  urls: Record<string, string>;
  /** The signing request itself failed, after its one retry. It applies to
   *  every requested path that still has no URL. */
  error: string | null;
  /** Requested paths the server answered for without a URL, each with the
   *  message to show where that image would be. */
  missing: Record<string, string>;
  /** Signs one path again (a signed URL expires, so an <img> left open
   *  long enough fails to load) and swaps the new URL into `urls`.
   *  Resolves to that URL, or null when re-signing failed. */
  resign: (path: string) => Promise<string | null>;
  /** Adds URLs a response already carried (a drill check's rationale, a
   *  sitting's next module): those paths are never signed again. */
  seed: (urls: Record<string, string>) => void;
};

type Settled = { key: string; error: string | null; missing: Record<string, string> };
type Attempt = { ok: true; urls: Record<string, string>; missing: string[] } | { ok: false; message: string };

/** One signing request, bounded by a timeout. */
async function signBatch(paths: string[]): Promise<Attempt> {
  try {
    const res = await fetch("/api/exam-lab/asset", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(SIGN_TIMEOUT_MS),
    });
    const j: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (j as { error?: unknown } | null)?.error;
      return { ok: false, message: typeof message === "string" && message ? message : SIGN_FAILED };
    }
    const split = splitSignedUrls(paths, j);
    return split ? { ok: true, ...split } : { ok: false, message: SIGN_FAILED };
  } catch (e) {
    return { ok: false, message: isTimeoutError(e) ? SIGN_TIMED_OUT : SIGN_FAILED };
  }
}

/** Signs private SAT image paths in batches of 80 via /api/exam-lab/asset --
 *  only paths that have no URL yet (`initial` and `seed` supply URLs a page
 *  or a response already carried). A failed or timed-out request is retried
 *  once, 3 s later; if that fails too, `error` says so. A path the server
 *  answers without a URL is listed in `missing`. Either way a path never
 *  stays pending for longer than two timed-out attempts. */
export function useSignedImages(paths: string[], initial?: Record<string, string>): SignedImages {
  const [urls, setUrls] = useState<Record<string, string>>(() => ({ ...initial }));
  // The same URLs, readable from the signing effect without re-running it.
  const known = useRef<Record<string, string>>({ ...initial });
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = paths.join("|");
  const seed = useCallback((more: Record<string, string>) => {
    const fresh = Object.entries(more).filter(([path, url]) => path && url && known.current[path] !== url);
    if (!fresh.length) return;
    const add = Object.fromEntries(fresh);
    known.current = { ...known.current, ...add };
    setUrls((prev) => ({ ...prev, ...add }));
  }, []);
  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const todo = Array.from(new Set(paths.filter(Boolean))).filter((path) => !known.current[path]);
    if (!todo.length) return;
    const pause = (ms: number) => new Promise<void>((resolve) => { retryTimer = setTimeout(resolve, ms); });
    (async () => {
      const signed: Record<string, string> = {};
      const missing: Record<string, string> = {};
      let error: string | null = null;
      for (let i = 0; i < todo.length; i += BATCH_SIZE) {
        const batch = todo.slice(i, i + BATCH_SIZE);
        let attempt = await signBatch(batch);
        if (!attempt.ok && alive) {
          await pause(RETRY_AFTER_MS);
          if (alive) attempt = await signBatch(batch);
        }
        if (!alive) return;
        if (attempt.ok) {
          Object.assign(signed, attempt.urls);
          for (const path of attempt.missing) missing[path] = NOT_AVAILABLE;
        } else {
          error = attempt.message;
        }
      }
      // A URL seeded meanwhile (a response that carried it) stays.
      seed(Object.fromEntries(Object.entries(signed).filter(([path]) => !known.current[path])));
      setSettled({ key, error, missing });
    })();
    return () => { alive = false; clearTimeout(retryTimer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const resign = useCallback(async (path: string): Promise<string | null> => {
    const attempt = await signBatch([path]);
    const url = attempt.ok ? attempt.urls[path] : undefined;
    if (!url) return null;
    seed({ [path]: url });
    return url;
  }, [seed]);
  // Only the answer for the paths asked for now counts; until it lands, every
  // path without a URL is still pending.
  const current = settled?.key === key ? settled : null;
  return { urls, error: current?.error ?? null, missing: current?.missing ?? {}, resign, seed };
}
