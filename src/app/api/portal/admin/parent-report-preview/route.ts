// GET /api/portal/admin/parent-report-preview?uid=<student id>[&ai=1]
//
// Admin-only preview of the SAT section of the Saturday parent email (SAT
// Coach spec 9), as a SAT-only family would get it this week: { html, text,
// week }. Never sends anything and never writes the plan. The Physics part
// is omitted. `ai=1` asks the AI for the two-line summary, which spends one
// of the student's two daily "parent" AI calls -- without it the preview
// shows the deterministic summary and costs nothing.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { pkToday } from "@/lib/portal/pk-time";
import { buildSatWeek } from "@/lib/sat/coach/parent-report";
import { composeParentEmail } from "@/lib/sat/coach/parent-report-core";

export const runtime = "nodejs";
export const maxDuration = 60;

const PREVIEW_GUARDIAN = "Parent/Guardian";

export async function GET(req: Request) {
  // Split like the other admin routes, so a signed-out caller gets 401.
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isAdmin(user.roles)) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const url = new URL(req.url);
  const uid = url.searchParams.get("uid") ?? "";
  if (!z.string().uuid().safeParse(uid).success) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  const ai = url.searchParams.get("ai") === "1";

  let week;
  try {
    week = await buildSatWeek(uid, pkToday(), { ai });
  } catch {
    return NextResponse.json({ error: "The SAT report couldn't be built just now. Please try again." }, { status: 503 });
  }
  if (!week) return NextResponse.json({ error: "This student has no Digital SAT set up." }, { status: 404 });

  const email = composeParentEmail({ studentName: week.firstName, guardianName: PREVIEW_GUARDIAN, physics: null, sat: week });
  if (!email) return NextResponse.json({ error: "This student has no Digital SAT set up." }, { status: 404 });
  return NextResponse.json({ html: email.html, text: email.text, week });
}
