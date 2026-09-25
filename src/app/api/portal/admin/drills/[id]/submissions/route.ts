import { NextResponse } from "next/server";
import { getPortalUser, isAdmin, canViewDrillRecords } from "@/lib/edu/auth";
import { getDrillRecord, getDrillRecordByRef, canSeeDrill, DRILL_REF_RE, DRILL_ID_RE } from "@/lib/exam-lab/drill-records";
import { listAllocations, withProctorStatus, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET — per-student submission status for one stored drill, including the
 * integrity flags (late submission / unattempted) that are written onto the
 * allocation record at submission time. This is the staff-facing surface for
 * those flags; the student-facing review page only shows the student's own.
 *
 * Status is the same EFFECTIVE status the student sees (a locked proctored
 * test reads "locked", a begun drill "in_progress"), via the shared helper.
 * Class drills list the live class roster; drills assigned to specific
 * students list the recipients frozen on the record at allocation time.
 *
 * Same auth + scope rules as the record route: drill-records viewers only,
 * and non-admin staff must be able to see the record's classes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!canViewDrillRecords(user.roles)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const { id } = await params;
  const key = decodeURIComponent(id || "").trim();
  const isRef = DRILL_REF_RE.test(key.toUpperCase());
  if (!isRef && !DRILL_ID_RE.test(key)) return NextResponse.json({ error: "Drill record not found." }, { status: 404 });
  const record = isRef ? await getDrillRecordByRef(key) : await getDrillRecord(key);
  if (!record) return NextResponse.json({ error: "Drill record not found." }, { status: 404 });

  if (!isAdmin(user.roles)) {
    const classIds = await visibleClassIdsForUid(user.id, user.roles);
    if (!canSeeDrill(record, { all: false, uid: user.id, classIds })) {
      return NextResponse.json({ error: "Drill record not found." }, { status: 404 });
    }
  }

  const sb = createAdminClient();
  const classIds = (record.classIds?.length ? record.classIds : record.classId ? [record.classId] : []).filter(Boolean);
  let profileIds: string[];
  if (classIds.length) {
    const { data: enr } = await sb
      .from("edu_enrolments")
      .select("edu_students(profile_id)")
      .in("class_id", classIds)
      .eq("status", "active");
    profileIds = [...new Set(
      ((enr || []) as unknown as { edu_students?: { profile_id?: string } }[])
        .map((r) => r.edu_students?.profile_id)
        .filter((x): x is string => !!x),
    )];
  } else if (record.recipientIds?.length) {
    profileIds = [...new Set(record.recipientIds)];
  } else {
    // Individual drills recorded before recipients were stored: no roster.
    return NextResponse.json({ items: [], roster: false }, { status: 200 });
  }
  if (!profileIds.length) return NextResponse.json({ items: [], roster: true }, { status: 200 });

  const { data: profs } = await sb.from("edu_profiles").select("id, full_name").in("id", profileIds);
  const nameOf = new Map((profs || []).map((p) => [p.id as string, (p.full_name as string) || ""]));

  const items = await Promise.all(profileIds.map(async (uid) => {
    let alloc: ExamAllocation | null = null;
    try {
      const allocs = await listAllocations(uid);
      const found = allocs.find((a) =>
        a.id === record.allocationId ||
        (a.content.type === "drillref" && a.content.drillId === record.id),
      );
      alloc = found ? await withProctorStatus(uid, found) : null;
    } catch { /* unreadable doc → treat as pending */ }
    return {
      uid,
      name: nameOf.get(uid) || "Student",
      status: alloc?.status ?? "pending",
      lateSubmission: !!alloc?.lateSubmission,
      unattempted: !!alloc?.unattempted,
      daily: !!alloc?.daily,
      startedAt: alloc?.startedAt ?? null,
      completedAt: alloc?.completedAt ?? null,
    };
  }));

  // Submitted first (most recent first), pending at the end — the flagged
  // rows are what staff scan for, so late/unattempted sorts within submitted.
  const rank = (s: string) => (s === "submitted" ? 0 : s === "pending" ? 2 : 1);
  items.sort((a, b) => rank(a.status) - rank(b.status) || (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return NextResponse.json({ items, roster: true }, { status: 200 });
}
