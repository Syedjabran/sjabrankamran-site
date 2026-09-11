import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listNotifications, markAllRead, markRead, synthesizeForUser, enforceCap } from "@/lib/portal/notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET ?limit=&sync=1 — the signed-in user's notifications + unread count.
 * On load we also synthesize due-soon reminders / marks-recorded items
 * (throttled server-side; pass sync=1 to force, e.g. on the full page).
 */
export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 1), 100);
  await synthesizeForUser(user.id, { force: url.searchParams.get("sync") === "1" });
  const { items, unread } = await listNotifications(user.id, limit);
  // Lazy per-user cap (~100, drop oldest) — cheap here, avoids broadcast fan-out cost.
  void enforceCap(user.id);
  return NextResponse.json({ items, unread }, { status: 200 });
}

/** POST { op:"read", id } | { op:"read_all" } — mark notifications read. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { op?: string; id?: string } | null;
  if (b?.op === "read_all") {
    await markAllRead(user.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  if (b?.op === "read" && b.id) {
    await markRead(user.id, b.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  return NextResponse.json({ error: "Invalid op." }, { status: 400 });
}
