import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getOrCreateCalendarToken, buildCalendarEvents, googleCalendarUrl } from "@/lib/portal/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authed helper for the UI: the caller's stable subscription URLs (https +
 * webcal) plus their next events with one-click "Add to Google Calendar" links.
 */
export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const token = await getOrCreateCalendarToken(user.id);
  const url = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;
  const feed = `${origin}/api/portal/calendar/${token}.ics`;
  const events = (await buildCalendarEvents(user.id, origin)).slice(0, 20).map((e) => ({
    title: e.title, start: e.start, end: e.end, url: e.url, googleUrl: googleCalendarUrl(e),
  }));
  return NextResponse.json({
    subscribeUrl: feed,
    webcalUrl: feed.replace(/^https?:/, "webcal:"),
    googleSubscribeUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`,
    events,
  }, { status: 200 });
}
