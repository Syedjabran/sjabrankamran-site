"use client";

/**
 * Resilient image components — self-healing against transient asset failures.
 *
 * Why: Vercel's edge bot-challenge (Security Checkpoint) can challenge parallel
 * image subresource requests on a first visit before the clearance cookie
 * exists, leaving above-the-fold images broken even though the assets are
 * healthy. Once the HTML request has set the clearance cookie, a retry of the
 * same request succeeds. These components retry automatically: on error, wait
 * ~1s, then re-request the same src with a cache-busting query param, up to
 * MAX_RETRIES times. Normal visitors never see a broken image for more than a
 * moment; crawlers/bots are unaffected.
 */

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function bust(src: string, retry: number): string {
  return `${src}${src.includes("?") ? "&" : "?"}r=${retry}`;
}

type SharedRetry = {
  /** Called on every error, before any retry. */
  onError?: (event: SyntheticEvent<HTMLElement>) => void;
};

/** next/image wrapper with transparent error-retry. */
export function ResilientImage({
  src,
  onError,
  ...rest
}: ComponentProps<typeof Image> & SharedRetry) {
  const [retry, setRetry] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      onError?.(event);
      if (retry < MAX_RETRIES) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setRetry((r) => r + 1), RETRY_DELAY_MS);
      }
    },
    [retry, onError]
  );

  // Only string srcs can be cache-busted; imported static assets pass through.
  const resilientSrc =
    retry > 0 && typeof src === "string" ? bust(src, retry) : src;

  return (
    <Image
      key={retry}
      src={resilientSrc}
      onError={handleError}
      {...rest}
    />
  );
}

/** Plain <img> wrapper with the same error-retry (for lazy logos, posters). */
export function ResilientImg({
  src,
  onError,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & SharedRetry) {
  const [retry, setRetry] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      onError?.(event);
      if (retry < MAX_RETRIES) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setRetry((r) => r + 1), RETRY_DELAY_MS);
      }
    },
    [retry, onError]
  );

  const resilientSrc =
    retry > 0 && typeof src === "string" ? bust(src, retry) : src;

  // eslint-disable-next-line @next/next/no-img-element
  return <img key={retry} src={resilientSrc} onError={handleError} {...rest} />;
}
