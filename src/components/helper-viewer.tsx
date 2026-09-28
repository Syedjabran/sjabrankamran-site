"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The signed-in viewer's courses, handed from the portal layout to the
 * floating helper (einstein-companion.tsx). The helper is mounted once in the
 * root layout, outside the portal layout's tree, so a context can't reach it;
 * the portal layout renders <HelperViewerCourses> and the helper reads them
 * with useHelperViewerCourses(). Browser-only: courses are published from an
 * effect, so the server's copy of this module always reads "none", and a
 * sign-out (a full page load) starts afresh.
 */
const NONE: readonly string[] = [];
let current: readonly string[] = NONE;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Publishes the viewer's courses (from course access) to the helper. Renders nothing. */
export function HelperViewerCourses({ courses }: { courses: readonly string[] }) {
  const key = courses.join(",");
  useEffect(() => {
    if (current.join(",") === key) return;
    current = key ? key.split(",") : NONE;
    listeners.forEach((listener) => listener());
  }, [key]);
  return null;
}

/** The viewer's courses as last published by the portal layout (none on a
 *  page opened before any portal page). */
export function useHelperViewerCourses(): readonly string[] {
  return useSyncExternalStore(subscribe, () => current, () => NONE);
}
