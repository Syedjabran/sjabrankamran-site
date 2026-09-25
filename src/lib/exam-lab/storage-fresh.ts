/**
 * Fresh (cache-busted) JSON reads for Exam Lab's Storage-as-DB. SERVER-ONLY.
 *
 * A plain `storage.download()` can be served STALE by the storage CDN for many
 * seconds even though every write passes cacheControl "0" (verified live,
 * commit 4630d72), so a read-modify-write built on it silently drops whatever
 * was written in between. This is the same cache-busted read as `readJson` in
 * src/lib/portal/forum.ts, plus the one thing every writer needs: it tells a
 * MISSING object (start a new doc) apart from a FAILED read (never write, or
 * the existing doc is overwritten with a near-empty one).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type FreshRead<T> = { ok: true; data: T | null } | { ok: false };

function isNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  // Older Storage API versions answer a missing object with HTTP 400 and a
  // JSON body whose statusCode is "404".
  return status === 400 && /"statusCode"\s*:\s*"?404|not[ _-]?found/i.test(body);
}

/** `{ ok: true, data: null }` = object does not exist; `{ ok: false }` = unknown. */
export async function readFreshJson<T>(bucket: string, path: string): Promise<FreshRead<T>> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (base && key) {
      const enc = path.split("/").map(encodeURIComponent).join("/");
      const cb = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${enc}?cb=${cb}`, {
        cache: "no-store",
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      const text = await res.text();
      if (res.ok) return { ok: true, data: JSON.parse(text) as T };
      return isNotFound(res.status, text) ? { ok: true, data: null } : { ok: false };
    }
    // No REST endpoint configured (scripts / local harnesses): SDK read.
    const { data, error } = await createAdminClient().storage.from(bucket).download(path);
    if (data) return { ok: true, data: JSON.parse(await data.text()) as T };
    if (!error) return { ok: true, data: null };
    const e = error as { status?: number; statusCode?: string | number; message?: string };
    return isNotFound(Number(e.status ?? e.statusCode), e.message || "") ? { ok: true, data: null } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Upsert a JSON doc with cacheControl "0". Returns false on any failure. */
export async function writeFreshJson(bucket: string, path: string, value: unknown): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify(value)], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(bucket).upload(path, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch {
    return false;
  }
}
