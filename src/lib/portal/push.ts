/**
 * Web Push for the installed PWA. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * Delivers OS-level notifications (tests, assignments, reminders, class timings,
 * announcements) even when the portal tab/app is closed. Subscriptions live in
 * the private `portal-data` bucket:  push-subs/<uid>.json → { subs: [...] }.
 *
 * Fully optional: if the VAPID env vars are absent the whole module no-ops, so
 * the portal builds and runs unchanged until push is provisioned.
 */
import webpush, { type PushSubscription } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const DATA = "portal-data";
const subPath = (uid: string) => `push-subs/${uid}.json`;

let _configured: boolean | null = null;
/** Configure web-push once; returns whether push is enabled (keys present). */
export function pushEnabled(): boolean {
  if (_configured !== null) return _configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:info@sjabrankamran.com";
  if (pub && priv) {
    try { webpush.setVapidDetails(subject, pub, priv); _configured = true; }
    catch { _configured = false; }
  } else _configured = false;
  return _configured;
}

export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

type StoredSub = PushSubscription & { addedAt?: string };
type SubDoc = { subs: StoredSub[] };

function sb() { return createAdminClient(); }

async function readSubs(uid: string): Promise<StoredSub[]> {
  try {
    const { data } = await sb().storage.from(DATA).download(subPath(uid));
    if (data) return (JSON.parse(await data.text()) as SubDoc).subs || [];
  } catch { /* none */ }
  return [];
}
async function writeSubs(uid: string, subs: StoredSub[]): Promise<void> {
  const doc: SubDoc = { subs: subs.slice(-10) }; // cap devices per user
  const body = new Blob([JSON.stringify(doc)], { type: "application/json" });
  await sb().storage.from(DATA).upload(subPath(uid), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
}

export async function saveSubscription(uid: string, sub: PushSubscription): Promise<void> {
  const subs = await readSubs(uid);
  if (!subs.some((s) => s.endpoint === sub.endpoint)) {
    subs.push({ ...sub, addedAt: new Date().toISOString() });
    await writeSubs(uid, subs);
  }
}

export async function removeSubscription(uid: string, endpoint: string): Promise<void> {
  const subs = await readSubs(uid);
  const next = subs.filter((s) => s.endpoint !== endpoint);
  if (next.length !== subs.length) await writeSubs(uid, next);
}

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

/** Best-effort push to every device of the given users. Prunes dead endpoints. */
export async function sendPush(uids: string[], payload: PushPayload): Promise<number> {
  if (!pushEnabled() || !uids.length) return 0;
  const data = JSON.stringify(payload);
  let sent = 0;
  await Promise.all([...new Set(uids)].map(async (uid) => {
    const subs = await readSubs(uid);
    if (!subs.length) return;
    const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification(s, data); sent++; }
      catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint); // gone
      }
    }));
    if (dead.length) await writeSubs(uid, subs.filter((s) => !dead.includes(s.endpoint)));
  }));
  return sent;
}
