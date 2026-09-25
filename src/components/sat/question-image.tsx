"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";

/** A question's image, shared by the runner and the drill (and the drill's
 *  official rationale). The pulsing placeholder stays until the signed URL
 *  exists AND the image itself has loaded (an <img> still fetching has no
 *  height, leaving an empty area). If there is no URL and `error` is set
 *  (signing failed, or the server has no image for this path), the message
 *  shows in its place instead of a placeholder pulsing forever.
 *
 *  A signed URL expires after an hour, so an image that fails to load asks
 *  `resign` for a fresh URL once before giving up. `failedText` replaces the
 *  default question wording of every failure message, and `fallback` shows
 *  under it (the drill's text rationale). Key it by the image path, so each
 *  image starts from its own state and its own single re-sign. */
export function QuestionImage({ src, alt, error, resign, failedText, fallback }: {
  src: string | undefined;
  alt: string;
  error: string | null;
  resign?: () => Promise<string | null>;
  failedText?: string;
  fallback?: ReactNode;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const resigned = useRef(false);
  // An image the browser already has (navigating back to a question) is
  // complete the moment its element mounts, before any load event. Marking it
  // loaded here, during the commit, means the placeholder is never painted.
  const markIfComplete = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setStatus("loaded");
  }, []);
  const onError = () => {
    if (resigned.current || !resign) { setStatus("failed"); return; }
    resigned.current = true;
    setStatus("loading");
    // A new URL re-renders this <img> with it (load or fail again, for good);
    // no new URL, or the same one, means there is nothing left to try.
    void resign().then((url) => { if (!url || url === src) setStatus("failed"); });
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
      {status === "loading" ? placeholder : null}
      {status === "failed" ? failure("This question's image couldn't be loaded.") : null}
      <img
        ref={markIfComplete} src={src} alt={alt} onLoad={() => setStatus("loaded")} onError={onError}
        className={"w-full rounded-lg bg-white" + (status === "loaded" ? "" : " hidden")}
      />
    </>
  );
}
