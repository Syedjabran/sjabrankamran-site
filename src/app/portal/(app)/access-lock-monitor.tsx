"use client";

import { useEffect } from "react";

/**
 * A layout can survive App Router soft navigations. This lightweight monitor
 * makes a newly-issued lock take effect in an already-open portal tab without
 * waiting for the user to refresh it.
 */
export function AccessLockMonitor() {
  useEffect(() => {
    let stopped = false;
    let checking = false;

    const check = async () => {
      if (stopped || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const res = await fetch("/api/portal/access-status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json() as { restricted?: boolean };
          if (data.restricted) window.location.assign("/portal?access=restricted");
        }
      } catch {
        // The server layout and API gate remain authoritative.
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(check, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
