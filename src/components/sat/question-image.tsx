"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { retryStep } from "./sat-runner-utils";

/** A question's image, shared by the runner, the drill and the score
 *  report's review (and their official rationales). The pulsing
 *  placeholder stays until the signed URL exists AND the image itself has
 *  loaded (an <img> still fetching has no height, leaving an empty area). If there is no URL and `error` is set
 *  (signing failed, or the server has no image for this path), the message
 *  shows in its place instead of a placeholder pulsing forever.
 *
 *  An image that fails to load (an expired URL -- each is handed out with
 *  at least an hour left, and a page can stay open longer -- a network
 *  blip, a CDN error) gets one retry before giving up: `resign` asks for a
 *  freshly signed URL, and when that gives the same URL or none, the same
 *  URL is loaded again in a new <img> (sat-runner-utils retryStep). Without
 *  `resign`, the retry is that reload. `failedText` replaces the default
 *  question wording of every failure message, and `fallback` shows under it
 *  (the drill's text rationale). Key it by the image path, so each image
 *  starts from its own state and its own single retry.
 *
 *  Also the Exam Lab paper runner's image, which lists a whole paper at once:
 *  `lazy` lets an image below the fold wait until it is near the viewport
 *  (use-image-preload.ts warms the upcoming ones meanwhile) -- such an image
 *  stays in the layout while it loads (a display:none image is never "near
 *  the viewport", so it would never load) -- and `imgClassName` adds classes
 *  to the image. */
export function QuestionImage({ src, alt, error, resign, failedText, fallback, lazy = false, imgClassName = "" }: {
  src: string | undefined;
  alt: string;
  error: string | null;
  resign?: () => Promise<string | null>;
  failedText?: string;
  fallback?: ReactNode;
  lazy?: boolean;
  imgClassName?: string;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const retried = useRef(false);
  // Bumped to load the same URL again in a new <img> element.
  const [attempt, setAttempt] = useState(0);
  // An image the browser already has (navigating back to a question, or one
  // preloaded while the previous question was open) is complete the moment
  // its element mounts, before any load event. Marking it loaded here,
  // during the commit, means the placeholder is never painted.
  const markIfComplete = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setStatus("loaded");
  }, []);
  const onError = () => {
    if (retried.current) { setStatus("failed"); return; }
    retried.current = true;
    setStatus("loading");
    const failedSrc = src ?? "";
    if (!resign) { setAttempt((n) => n + 1); return; }
    // A new URL re-renders this <img> with it; otherwise the same URL is
    // requested again by a new element. Either way it loads or fails for good.
    void resign().catch(() => null).then((url) => { if (retryStep(failedSrc, url) === "reload") setAttempt((n) => n + 1); });
  };
  const failure = (message: string) => (
    <>
      <p className="text-sm text-signal">{failedText ?? message}</p>
      {fallback}
    </>
  );
  const placeholder = <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />;
  if (!src) return error ? failure(error) : placeholder;
  return (
    <>
      {status === "loading" && !lazy ? placeholder : null}
      {status === "failed" ? failure("This question's image couldn't be loaded.") : null}
      <img
        key={attempt} ref={markIfComplete} src={src} alt={alt} onLoad={() => setStatus("loaded")} onError={onError}
        /* the image on screen outranks the background preloads (use-image-preload.ts) */
        decoding="async" fetchPriority="high" loading={lazy ? "lazy" : undefined} draggable={lazy ? false : undefined}
        className={"w-full rounded-lg bg-white" + (imgClassName ? ` ${imgClassName}` : "") + (status === "loaded" || (lazy && status === "loading") ? "" : " hidden")}
      />
    </>
  );
}
