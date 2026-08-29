"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Lightweight presence beacon: pings the server on mount, on route change,
 * and every 25s while the tab is visible, so staff can see who's online. */
export function PresenceBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    let stopped = false;
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/portal/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const id = setInterval(() => { if (!stopped) ping(); }, 25_000);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [pathname]);
  return null;
}
