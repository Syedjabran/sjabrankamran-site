"use client";
import { useCallback, useEffect, useRef } from "react";

// Two preloads in flight at a time: the module fills in the background
// without crowding out the image on screen.
const PRELOAD_CONCURRENCY = 2;
// The image on screen goes first; preloading starts once it has loaded, or
// after this long whatever happens to it.
const CURRENT_FIRST_MS = 4000;
// Joins the URL list into an effect key; no URL holds a space.
const SEPARATOR = " ";

/** Starts loading `url` into the browser's cache; resolves when it has
 *  loaded or failed (never rejects). */
function load(url: string, priority: "high" | "low", into: Map<string, HTMLImageElement>): Promise<void> {
  const known = into.get(url);
  if (known) return known.complete ? Promise.resolve() : settleOf(known);
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = priority;
  const settled = settleOf(img);
  img.src = url;
  into.set(url, img);
  return settled;
}

function settleOf(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

/** Preloads `upcoming` (already in the order wanted -- sat-runner-utils
 *  preloadOrder / reviewPreloadOrder), two at a time at low priority, once
 *  `current` (the image on screen, if any) has loaded. Every image started
 *  stays referenced for the life of the page, so going back to one shows
 *  it at once. A new `current` or list restarts the queue; what already
 *  started keeps going. `warm(url)` loads one image right away at high
 *  priority (a rationale the moment its check answers). Only URLs of
 *  images the student may already see are ever passed in: a module's own
 *  questions, a checked question's rationale, a finished review. */
export function useImagePreload(current: string | undefined, upcoming: string[]): { warm: (url: string) => void } {
  const images = useRef(new Map<string, HTMLImageElement>());
  const key = upcoming.join(SEPARATOR);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queue = key ? key.split(SEPARATOR) : [];
    (async () => {
      if (current) {
        await Promise.race([
          load(current, "high", images.current),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, CURRENT_FIRST_MS); }),
        ]);
      }
      let next = 0;
      const worker = async () => {
        while (alive && next < queue.length) {
          const url = queue[next++];
          if (!images.current.has(url)) await load(url, "low", images.current);
        }
      };
      await Promise.all(Array.from({ length: PRELOAD_CONCURRENCY }, worker));
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [current, key]);
  const warm = useCallback((url: string) => { if (url) void load(url, "high", images.current); }, []);
  return { warm };
}
