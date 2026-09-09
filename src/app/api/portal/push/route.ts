import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { pushEnabled, vapidPublicKey, saveSubscription, removeSubscription } from "@/lib/portal/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → whether push is provisioned + the VAPID public key for the browser. */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ enabled: pushEnabled(), publicKey: vapidPublicKey() }, { status: 200 });
}

/** POST { op:'subscribe', subscription } | { op:'unsubscribe', endpoint }. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!pushEnabled()) return NextResponse.json({ error: "Push notifications are not enabled on this server yet." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { op?: string; subscription?: { endpoint: string; keys: { p256dh: string; auth: string } }; endpoint?: string } | null;
  if (b?.op === "subscribe" && b.subscription?.endpoint) {
    await saveSubscription(user.id, b.subscription as never);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  if (b?.op === "unsubscribe" && b.endpoint) {
    await removeSubscription(user.id, b.endpoint);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
