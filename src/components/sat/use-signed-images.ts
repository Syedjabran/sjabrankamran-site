"use client";
import { useCallback, useEffect, useState } from "react";
import { isTimeoutError, splitSignedUrls } from "./sat-runner-utils";

const BATCH_SIZE = 80; // the signing endpoint's per-request limit
const SIGN_TIMEOUT_MS = 20_000;
const RETRY_AFTER_MS = 3_000;
const SIGN_FAILED = "Images couldn't be loaded.";
const SIGN_TIMED_OUT = "Images couldn't be loaded — the connection timed out.";
const NOT_AVAILABLE = "This question's image isn't available yet.";

export type SignedImages = {
  /** Signed URL per path. URLs from an earlier set of paths are kept, so an
   *  image already on screen stays while a new set is being signed. */
  urls: Record<string, string>;
  /** The signing request itself failed, after its one retry. It applies to
   *  every requested path that still has no URL. */
  error: string | null;
  /** Requested paths the server answered for without a URL, each with the
   *  message to show where that image would be. */
  missing: Record<string, string>;
  /** Signs one path again (a signed URL lasts an hour, so an <img> left
   *  open longer fails to load) and swaps the new URL into `urls`. Resolves
   *  to that URL, or null when re-signing failed. */
  resign: (path: string) => Promise<string | null>;
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

/** Signs private SAT image paths in batches of 80 via /api/exam-lab/asset.
 *  A failed or timed-out request is retried once, 3 s later; if that fails
 *  too, `error` says so. A path the server answers without a URL is listed in
 *  `missing`. Either way a path never stays pending for longer than two
 *  timed-out attempts. */
export function useSignedImages(paths: string[]): SignedImages {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const todo = Array.from(new Set(paths.filter(Boolean)));
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
      setUrls((prev) => ({ ...prev, ...signed }));
      setSettled({ key, error, missing });
    })();
    return () => { alive = false; clearTimeout(retryTimer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const resign = useCallback(async (path: string): Promise<string | null> => {
    const attempt = await signBatch([path]);
    const url = attempt.ok ? attempt.urls[path] : undefined;
    if (!url) return null;
    setUrls((prev) => ({ ...prev, [path]: url }));
    return url;
  }, []);
  // Only the answer for the paths asked for now counts; until it lands, every
  // path without a URL is still pending.
  const current = settled?.key === key ? settled : null;
  return { urls, error: current?.error ?? null, missing: current?.missing ?? {}, resign };
}
