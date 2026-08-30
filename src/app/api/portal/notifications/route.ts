import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET — the signed-in user's notifications (recent 30) + unread count. */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const sb = createAdminClient();
  const [{ data: items }, { count }] = await Promise.all([
    sb.from("edu_notifications").select("id, kind, title, body, link, read_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    sb.from("edu_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  return NextResponse.json({ items: items || [], unread: count || 0 }, { status: 200 });
}

/** POST { op:"read", id } | { op:"read_all" } — mark notifications read. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { op?: string; id?: string } | null;
  const sb = createAdminClient();
  const now = new Date().toISOString();
  if (b?.op === "read_all") {
    await sb.from("edu_notifications").update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  if (b?.op === "read" && b.id) {
    await sb.from("edu_notifications").update({ read_at: now }).eq("user_id", user.id).eq("id", b.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  return NextResponse.json({ error: "Invalid op." }, { status: 400 });
}
