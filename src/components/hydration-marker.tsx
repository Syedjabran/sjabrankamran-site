"use client";

import { useEffect } from "react";

/**
 * HydrationMarker — proves client JS is alive.
 *
 * Adds `js-hydrated` to <html> once React hydrates. Two consumers:
 * 1. globals.css disables the pure-CSS reveal fallback when hydration
 *    succeeded, restoring the classic scroll-reveal animations.
 * 2. The inline self-heal bootstrap in the root layout checks for this class:
 *    if it never appears (edge challenge blocked the JS chunks on a fresh
 *    visit), it performs ONE automatic reload — by then the clearance cookie
 *    from the HTML request exists, so the second load gets every asset.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.classList.add("js-hydrated");
  }, []);
  return null;
}
