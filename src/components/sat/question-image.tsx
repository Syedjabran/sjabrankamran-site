"use client";
import { useCallback, useState } from "react";

/** A question's image, shared by the runner and the drill. The pulsing
 *  placeholder stays until the signed URL exists AND the image itself has
 *  loaded (an <img> still fetching has no height, leaving an empty area). If
 *  there is no URL and `error` is set (signing failed, or the server has no
 *  image for this path), the message shows in its place instead of a
 *  placeholder pulsing forever. Key it by the image path, so each question
 *  starts from its own state. */
export function QuestionImage({ src, alt, error }: { src: string | undefined; alt: string; error: string | null }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  // An image the browser already has (navigating back to a question) is
  // complete the moment its element mounts, before any load event. Marking it
  // loaded here, during the commit, means the placeholder is never painted.
  const markIfComplete = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setStatus("loaded");
  }, []);
  const placeholder = <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />;
  if (!src) return error ? <p className="text-sm text-signal">{error}</p> : placeholder;
  return (
    <>
      {status === "loading" ? placeholder : null}
      {status === "failed" ? <p className="text-sm text-signal">This question&apos;s image couldn&apos;t be loaded.</p> : null}
      <img
        ref={markIfComplete} src={src} alt={alt} onLoad={() => setStatus("loaded")} onError={() => setStatus("failed")}
        className={"w-full rounded-lg bg-white" + (status === "loaded" ? "" : " hidden")}
      />
    </>
  );
}
