import { NextResponse } from "next/server";
import { getPortalUser, isAdmin, canViewDrillRecords } from "@/lib/edu/auth";
import { listDrillRecordsForScope } from "@/lib/exam-lab/drill-records";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";

export const runtime = "nodejs";

/**
 * GET — stored Exam Lab drill records.
 *
 * Admins and super-admins see the whole network. Teachers, coordinators and
 * facilitators see only the drills they conducted themselves or that reached
 * one of the classes they are scoped to — a teacher can never read another
 * class's paper, and a school-scoped role can never read another school's.
 */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!canViewDrillRecords(user.roles)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const all = isAdmin(user.roles);
  const classIds = all ? [] : await visibleClassIdsForUid(user.id, user.roles);
  const items = await listDrillRecordsForScope({ all, uid: user.id, classIds });
  return NextResponse.json({ items, scoped: !all }, { status: 200 });
}
