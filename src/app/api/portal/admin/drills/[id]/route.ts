import { NextResponse } from "next/server";
import { getPortalUser, isAdmin, canViewDrillRecords } from "@/lib/edu/auth";
import { getDrillRecord, getDrillRecordByRef, canSeeDrill, DRILL_REF_RE, DRILL_ID_RE } from "@/lib/exam-lab/drill-records";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";

export const runtime = "nodejs";

/**
 * GET — one stored drill record incl. the frozen question paper.
 *
 * `id` accepts either the internal drill id or the human reference number
 * (DR-YYMM-XXXX), so staff can pull a drill straight from the reference they
 * were given. Non-admin staff are scope-checked against the record's classes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!canViewDrillRecords(user.roles)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const { id } = await params;
  const key = decodeURIComponent(id || "").trim();
  const isRef = DRILL_REF_RE.test(key.toUpperCase());
  // The id becomes part of a storage path (exam-drills/<id>.json): only a
  // reference number or a plain drill id is ever looked up.
  if (!isRef && !DRILL_ID_RE.test(key)) return NextResponse.json({ error: "Drill record not found." }, { status: 404 });
  const record = isRef ? await getDrillRecordByRef(key) : await getDrillRecord(key);
  if (!record) return NextResponse.json({ error: "Drill record not found." }, { status: 404 });

  if (!isAdmin(user.roles)) {
    const classIds = await visibleClassIdsForUid(user.id, user.roles);
    // Out-of-scope reads answer 404, not 403, so the endpoint never confirms
    // that a drill belonging to another class or school exists.
    if (!canSeeDrill(record, { all: false, uid: user.id, classIds })) {
      return NextResponse.json({ error: "Drill record not found." }, { status: 404 });
    }
  }
  return NextResponse.json({ record }, { status: 200 });
}
