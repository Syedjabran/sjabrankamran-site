"use client";
import { useEffect, useState } from "react";

/** Signs private SAT image paths in batches of 80 via /api/exam-lab/asset. */
export function useSignedImages(paths: string[]): { urls: Record<string, string>; error: string | null } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    const todo = Array.from(new Set(paths.filter(Boolean)));
    if (!todo.length) return;
    (async () => {
      try {
        const out: Record<string, string> = {};
        for (let i = 0; i < todo.length; i += 80) {
          const res = await fetch("/api/exam-lab/asset", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: todo.slice(i, i + 80) }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || "Images couldn't be loaded.");
          Object.assign(out, j.urls || {});
        }
        if (alive) { setUrls(out); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { urls, error };
}
