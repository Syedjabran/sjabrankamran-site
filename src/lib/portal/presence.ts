/**
 * Live presence. SERVER-ONLY (service-role).
 *
 * Each signed-in user's portal beacon writes one small file
 *   portal-data/presence/<uid>.json  = { uid, name, role, path, label, ts }
 * (upsert). Because every user only ever writes THEIR OWN file there is no
 * read-modify-write race. "Who's online" is derived from Storage's own
 * `updated_at` on each object (no downloads needed to know recency), then the
 * recent few are downloaded for their current-activity label.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export const PRESENCE_BUCKET = "portal-data";
export const PRESENCE_DIR = "presence";
export const ONLINE_WINDOW_MS = 90_000; // considered "online" if seen in last 90s

export type Presence = { uid: string; name: string; role: string; path: string; label: string; ts: number };
export type OnlineUser = Presence & { secondsAgo: number };

/** Human label for a portal path (kept in sync with the client beacon). */
export function activityLabel(path: string): string {
  const p = (path || "").split("?")[0].replace(/\/$/, "") || "/portal";
  if (p === "/portal") return "Dashboard";
  if (p.startsWith("/portal/exam-lab")) return "Exam Lab";
  if (p.startsWith("/portal/learn/assignments")) return "On an assignment";
  if (p.startsWith("/portal/learn")) return "My Learning";
  if (p.startsWith("/portal/progress")) return "Checking progress";
  if (p.startsWith("/portal/onboarding")) return "Onboarding";
  if (p.startsWith("/portal/admin/users")) return "Managing users";
  if (p.startsWith("/portal/admin/analytics")) return "Analytics";
  if (p.startsWith("/portal/admin/assign")) return "Posting work";
  if (p.startsWith("/portal/admin/institutions")) return "Institutions";
  if (p.startsWith("/portal/admin/mail")) return "Email";
  if (p.startsWith("/portal/admin")) return "Admin";
  if (p.startsWith("/portal/teach")) return "Teaching";
  if (p.startsWith("/portal/studio")) return "Physics Studio";
  if (p.startsWith("/portal/family")) return "My Children";
  return "In portal";
}

export async function recordPresence(p: Presence): Promise<boolean> {
  try {
    const sb = createAdminClient();
    const body = new Blob([JSON.stringify(p)], { type: "application/json" });
    const { error } = await sb.storage.from(PRESENCE_BUCKET).upload(`${PRESENCE_DIR}/${p.uid}.json`, body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch {
    return false;
  }
}

export async function getOnline(windowMs = ONLINE_WINDOW_MS): Promise<OnlineUser[]> {
  try {
    const sb = createAdminClient();
    const { data: files } = await sb.storage.from(PRESENCE_BUCKET).list(PRESENCE_DIR, { limit: 1000, sortBy: { column: "updated_at", order: "desc" } });
    if (!files?.length) return [];
    const now = Date.now();
    const recent = files.filter((f) => {
      const t = f.updated_at || f.created_at;
      return t && now - new Date(t).getTime() < windowMs;
    });
    const out: OnlineUser[] = [];
    await Promise.all(
      recent.map(async (f) => {
        try {
          const { data } = await sb.storage.from(PRESENCE_BUCKET).download(`${PRESENCE_DIR}/${f.name}`);
          if (!data) return;
          const p = JSON.parse(await data.text()) as Presence;
          const ts = p.ts || new Date(f.updated_at || f.created_at || now).getTime();
          if (now - ts < windowMs) out.push({ ...p, secondsAgo: Math.max(0, Math.round((now - ts) / 1000)) });
        } catch {
          /* skip */
        }
      })
    );
    return out.sort((a, b) => a.secondsAgo - b.secondsAgo);
  } catch {
    return [];
  }
}
