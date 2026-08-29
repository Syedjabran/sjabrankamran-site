import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { recordPresence, activityLabel } from "@/lib/portal/presence";

export const runtime = "nodejs";

/** POST { path } — the signed-in user's presence beacon. Any authed user. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { path?: string; label?: string };
  const path = (b.path || "/portal").slice(0, 200);
  const role = user.roles[0] || "user";
  await recordPresence({
    uid: user.id,
    name: user.fullName || user.email || "User",
    role,
    path,
    label: (b.label || activityLabel(path)).slice(0, 60),
    ts: Date.now(),
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
