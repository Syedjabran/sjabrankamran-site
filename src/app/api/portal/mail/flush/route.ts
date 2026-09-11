import { NextResponse } from "next/server";
import { getPortalUser, canAccessGlobalStaffData } from "@/lib/edu/auth";
import { flushQueued, mailConfigured } from "@/lib/portal/mail";

export const runtime = "nodejs";
export const maxDuration = 300;

// Re-send every queued message. Auth: staff portal session OR the service-role
// key in x-admin-key (scheduled agent). Safe no-op until the relay is connected.
export async function POST(req: Request) {
  const keyHeader = req.headers.get("x-admin-key");
  const isSystem = !!keyHeader && !!process.env.SUPABASE_SERVICE_ROLE_KEY && keyHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSystem) {
    const user = await getPortalUser();
    if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  if (!mailConfigured()) {
    return NextResponse.json({ ok: true, mailConfigured: false, note: "Relay not connected — nothing sent.", attempted: 0, sent: 0 }, { status: 200 });
  }
  const res = await flushQueued();
  return NextResponse.json({ ok: true, mailConfigured: true, ...res }, { status: 200 });
}
