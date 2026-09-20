/**
 * Community contribution points. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * Rewards the behaviours JB wants to encourage — peer teaching/help, sharing
 * resources, raising new topics, and participation — and feeds the community
 * leaderboard (monthly top-5 are recognised/rewarded).
 *
 * One doc per user: portal-data/contrib/<uid>.json
 *   { uid, name, total, month: "YYYY-MM", monthPoints, breakdown{kind:count}, updatedAt }
 */
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "portal-data";
const DIR = "contrib";

export type ContribKind = "thread" | "resource" | "answer" | "helpful" | "topic";
export const POINTS: Record<ContribKind, number> = {
  thread: 5,     // start a discussion / ask that helps others
  topic: 8,      // bring a new topic into light (tagged 'topic')
  resource: 10,  // share a resource to the library
  answer: 6,     // reply / help someone
  helpful: 12,   // marked helpful by a peer or teacher (peer teaching)
};
export const POINTS_GUIDE: { kind: ContribKind; label: string; pts: number }[] = [
  { kind: "resource", label: "Share a resource in the library", pts: POINTS.resource },
  { kind: "helpful", label: "Be marked ‘Helpful’ by a peer or teacher", pts: POINTS.helpful },
  { kind: "topic", label: "Bring a new topic into the light", pts: POINTS.topic },
  { kind: "answer", label: "Answer / help on someone’s post", pts: POINTS.answer },
  { kind: "thread", label: "Start a discussion or ask for help", pts: POINTS.thread },
];

export type Contrib = { uid: string; name: string; total: number; month: string; monthPoints: number; breakdown: Record<string, number>; updatedAt: number };

function thisMonth(): string { return new Date().toISOString().slice(0, 7); }
function path(uid: string) { return `${DIR}/${uid}.json`; }

async function read(uid: string): Promise<Contrib | null> {
  try {
    // Cache-busted read — see src/lib/portal/forum.ts readJson for why.
    const enc = `${DIR}/${uid}.json`.split("/").map(encodeURIComponent).join("/");
    const cb = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${enc}?cb=${cb}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });
    if (res.ok) return (await res.json()) as Contrib;
  } catch { /* none */ }
  return null;
}

export async function award(uid: string, name: string, kind: ContribKind, times = 1): Promise<void> {
  try {
    const sb = createAdminClient();
    const cur = (await read(uid)) || { uid, name, total: 0, month: thisMonth(), monthPoints: 0, breakdown: {}, updatedAt: 0 };
    const pts = (POINTS[kind] || 0) * times;
    const m = thisMonth();
    if (cur.month !== m) { cur.month = m; cur.monthPoints = 0; } // monthly reset
    cur.name = name || cur.name;
    cur.total += pts;
    cur.monthPoints += pts;
    cur.breakdown[kind] = (cur.breakdown[kind] || 0) + times;
    cur.updatedAt = Date.now();
    const body = new Blob([JSON.stringify(cur)], { type: "application/json" });
    await sb.storage.from(BUCKET).upload(path(uid), body, { upsert: true, contentType: "application/json" });
  } catch { /* best effort */ }
}

export type ContribRow = { uid: string; name: string; total: number; monthPoints: number };
export async function leaderboard(): Promise<{ month: string; allTime: ContribRow[]; monthly: ContribRow[] }> {
  const sb = createAdminClient();
  const m = thisMonth();
  const out: ContribRow[] = [];
  try {
    const { data: files } = await sb.storage.from(BUCKET).list(DIR, { limit: 1000 });
    await Promise.all((files || []).map(async (f) => {
      try {
        const { data } = await sb.storage.from(BUCKET).download(`${DIR}/${f.name}`);
        if (!data) return;
        const c = JSON.parse(await data.text()) as Contrib;
        out.push({ uid: c.uid, name: c.name, total: c.total, monthPoints: c.month === m ? c.monthPoints : 0 });
      } catch { /* skip */ }
    }));
  } catch { /* none */ }
  const allTime = [...out].sort((a, b) => b.total - a.total).slice(0, 20);
  const monthly = [...out].sort((a, b) => b.monthPoints - a.monthPoints).filter((r) => r.monthPoints > 0).slice(0, 20);
  return { month: m, allTime, monthly };
}

export async function getContrib(uid: string): Promise<Contrib | null> { return read(uid); }
