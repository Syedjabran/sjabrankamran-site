import { NextResponse } from "next/server";
import { resolveCalendarToken, buildCalendarEvents, toICS } from "@/lib/portal/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, token-authorised iCalendar feed consumed by Google/Apple Calendar.
 * No cookies (calendar apps fetch it unauthenticated); the opaque per-user
 * token is the capability. Returns text/calendar so "Add from URL" works.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const uid = await resolveCalendarToken((token || "").replace(/\.ics$/i, ""));
  if (!uid) return new NextResponse("Not found", { status: 404 });
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://sjabrankamran.com";
  const events = await buildCalendarEvents(uid, origin);
  const body = toICS(events);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="sjak-portal.ics"',
      "cache-control": "public, max-age=1800",
    },
  });
}
