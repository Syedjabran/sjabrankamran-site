"use client";

import type { ReactNode } from "react";

/**
 * Route template — re-mounts on navigation so each page gets a smooth,
 * lightweight entrance. Pure CSS; neutralised by the global
 * prefers-reduced-motion rule.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
