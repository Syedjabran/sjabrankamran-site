import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/portal/admin";
import { allocateToStudentsDetailed, newAllocId, type AllocMode, type AllocContent, type FanoutResult } from "@/lib/exam-lab/allocations";
import { notify } from "@/lib/portal/notifications";
import { saveDrillRecord, resolveSnapshot, newDrillId, reserveDrillRef, getDrillRecordStrict, type DrillRecord, type DrillTargetType } from "@/lib/exam-lab/drill-records";
import { questionById } from "@/lib/exam-lab/bank-all";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";
import { getPortalUser, isAdmin, isExamLabStaff } from "@/lib/edu/auth";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { coveredTopicsForTarget, DEFAULT_COURSE } from "@/lib/exam-lab/syllabus-coverage";
import { formatPk, pkDateTimeToIso } from "@/lib/portal/pk-time";

export const runtime = "nodejs";
export const maxDuration = 30;

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Deterministic allocation + drill ids for one client idempotency key, scoped
 * to the staff member: a retried request (e.g. after a timeout halfway through
 * a big group) lands on the SAME allocation and the SAME frozen paper, so
 * students who already have it are skipped instead of receiving a duplicate.
 */
async function idempotentIds(staffId: string, key: string): Promise<{ id: string; drillId: string }> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${staffId}:${key}`));
  const hex = [...new Uint8Array(digest)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { id: `ik-${hex}`, drillId: `drill-ik-${hex}` };
}

/**
 * POST — allocate an Exam Lab drill to a target.
 * body: {
 *   target_type: "class"|"school"|"network"|"individual",
 *   class_ids?: string[],        // for class/school/network (resolved by the client)
 *   student_email?: string,      // for individual
 *   scope_label?: string,        // human label shown to the student
 *   mode, content, title, instructions?, duration_min?, due_at?, starts_at?, notify?,
 *   idempotency_key?,            // optional; also read from the Idempotency-Key header
 * }
 *   due_at / starts_at: datetime-local values are Pakistan wall-clock time.
 *   A retry with the same idempotency_key reuses the allocation id + frozen
 *   paper and only fills in the students still missing. Partial fan-out
 *   failures return 200 with { partial: true, failedCount, warning }.
 *   mode: assignment_help | assignment_nohelp | test  (test = super_admin/admin/TA)
 *
 * Drills are FROZEN here: the exact question paper is resolved once, stored on
 * the Drill Record, and the allocation fanned to students carries a reference
 * to those exact question ids (`drillref`) rather than the randomised spec.
 * That is what makes one class drill identical for every student and identical
 * again on every re-open.
 */
export async function POST(req: Request) {
  const staff = await getPortalUser();
  // Owner-defined staff set for Exam Lab assignment/sharing:
  // super_admin / admin / teacher / coordinator / facilitator ONLY.
  // Students (and every other role) are rejected with 403 — the assign/share
  // surface is staff-only in every mode, enforced here server-side regardless
  // of what any client renders.
  if (!staff || !isExamLabStaff(staff.roles)) {
    return NextResponse.json({ error: "Staff only." }, { status: 403 });
  }

  const b = (await req.json().catch(() => null)) as {
    target_type?: string; class_ids?: string[]; student_email?: string; student_ids?: string[]; scope_label?: string;
    mode?: string; content?: AllocContent; title?: string;
    instructions?: string; duration_min?: number; due_at?: string; starts_at?: string; notify?: boolean;
    idempotency_key?: string;
  } | null;
  if (!b?.title?.trim() || !b.mode || !b.content) {
    return NextResponse.json({ error: "title, mode and content are required." }, { status: 400 });
  }
  // datetime-local values carry no zone: they are Pakistan wall-clock time.
  // (`new Date()` on a UTC server read them as UTC — tests opened 5 h late.)
  const dueAt = b.due_at ? pkDateTimeToIso(b.due_at) : null;
  const startsAt = b.starts_at ? pkDateTimeToIso(b.starts_at) : null;
  if ((b.due_at && !dueAt) || (b.starts_at && !startsAt)) {
    return NextResponse.json({ error: "Invalid due / start date." }, { status: 400 });
  }
  const idemKey = String(b.idempotency_key || req.headers?.get?.("idempotency-key") || "").trim();
  if (idemKey && !IDEMPOTENCY_KEY_RE.test(idemKey)) {
    return NextResponse.json({ error: "Invalid idempotency key." }, { status: 400 });
  }
  const mode = b.mode as AllocMode;
  if (!["assignment_help", "assignment_nohelp", "test"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }
  const canSetTest = staff.roles.some((r) => ["super_admin", "admin", "teaching_assistant"].includes(r));
  if (mode === "test" && !canSetTest) {
    return NextResponse.json({ error: "You are not allowed to allocate a proctored test." }, { status: 403 });
  }

  let c = b.content;
  if (c.type === "paper") { if (!c.code) return NextResponse.json({ error: "Choose a past paper." }, { status: 400 }); }
  else if (c.type === "drill") { if (!c.paperType || !Array.isArray(c.topics) || !c.count) return NextResponse.json({ error: "Incomplete drill spec." }, { status: 400 }); }
  else if (c.type === "custom") {
    if (!Array.isArray(c.ids) || c.ids.length < 1) return NextResponse.json({ error: "Pick at least one question." }, { status: 400 });
    if (c.ids.length > 500 || c.ids.some((id) => typeof id !== "string") || new Set(c.ids).size !== c.ids.length) return NextResponse.json({ error: "Invalid question list." }, { status: 400 });
  }
  else if (c.type !== "daily") return NextResponse.json({ error: "Invalid content type." }, { status: 400 });

  const sb = createAdminClient();
  const tt = b.target_type || "class";
  if (!["class", "school", "network", "individual", "group"].includes(tt)) {
    return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }
  let uids: string[] = [];
  const classIds: string[] = tt === "individual" ? [] : (b.class_ids || []).filter(Boolean);

  if (tt === "individual") {
    // Preferred: a set of student profile ids chosen from the roster picker.
    // Fallback: a single student email (kept for the assign-form flow).
    const pickedIds = Array.isArray(b.student_ids) ? [...new Set(b.student_ids.filter((x): x is string => typeof x === "string" && !!x))] : [];
    if (pickedIds.length) {
      if (pickedIds.length > 200) return NextResponse.json({ error: "Select 200 students or fewer." }, { status: 400 });
      const { data: profs } = await sb.from("edu_profiles").select("id").in("id", pickedIds);
      uids = [...new Set((profs || []).map((p) => p.id as string).filter(Boolean))];
      if (!uids.length) return NextResponse.json({ error: "None of the selected students were found." }, { status: 400 });
    } else {
      const email = (b.student_email || "").trim().toLowerCase();
      if (!email) return NextResponse.json({ error: "Choose at least one student." }, { status: 400 });
      const { data: prof } = await sb.from("edu_profiles").select("id").ilike("email", email).maybeSingle();
      if (!prof?.id) return NextResponse.json({ error: "No student found with that email." }, { status: 400 });
      uids = [prof.id as string];
    }
  } else {
    const ids = (b.class_ids || []).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "No classes in the selected target." }, { status: 400 });
    const { data: enr } = await sb
      .from("edu_enrolments")
      .select("edu_students(profile_id)")
      .in("class_id", ids)
      .eq("status", "active");
    const rows = (enr || []) as unknown as { edu_students?: { profile_id?: string } }[];
    uids = [...new Set(rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x))];
  }
  if (!uids.length) return NextResponse.json({ error: "No active students in the selected target." }, { status: 400 });

  // Non-admin staff may only assign to their mapped classes, including groups.
  if (!isAdmin(staff.roles)) {
    const visible = await visibleClassIdsForUid(staff.id, staff.roles);
    if (!isAdmin(staff.roles)) {
      const allowed = new Set(visible);
      if (tt === "individual") {
        // Every selected student must sit in one of the staff member's classes.
        const { data: sts } = await sb.from("edu_students").select("id, profile_id").in("profile_id", uids);
        const stById = (sts || []) as { id: string; profile_id: string }[];
        const { data: en } = stById.length
          ? await sb.from("edu_enrolments").select("student_id, class_id").in("student_id", stById.map((s) => s.id)).eq("status", "active")
          : { data: [] as { student_id: string; class_id: string | null }[] };
        const inScope = new Set(
          (en || [])
            .filter((r) => r.class_id && allowed.has(r.class_id as string))
            .map((r) => stById.find((s) => s.id === r.student_id)?.profile_id)
            .filter((x): x is string => !!x),
        );
        const blocked = uids.filter((u) => !inScope.has(u));
        if (blocked.length) return NextResponse.json({ error: blocked.length === uids.length ? "Those students are not in one of your classes." : "Some selected students are not in one of your classes." }, { status: 403 });
      } else {
        const outside = classIds.filter((cid) => !allowed.has(cid));
        if (outside.length) {
          return NextResponse.json({ error: "Some of the selected classes are outside your scope." }, { status: 403 });
        }
      }
    }
  }

  // ---- SYLLABUS-SCOPED ASSIGNMENT (owner rule) ----
  // Randomized draws (topic drills + daily challenges) may ONLY contain
  // topics confirmed COMPLETED for the target class(es)/school. If nothing is
  // marked complete we refuse outright — never random uncovered syllabus.
  // Full past papers and hand-picked custom sets are deliberate staff choices
  // and are not gated.
  let coveredForSnapshot: Set<string> | undefined;
  if (c.type === "drill" || c.type === "daily") {
    const covered = await coveredTopicsForTarget(DEFAULT_COURSE, uids, classIds);
    if (covered.size === 0) {
      return NextResponse.json({
        error: "No syllabus topics are marked complete for the selected class(es) yet. Record coverage first (My Classes → Syllabus coverage). Refusing to assign questions from uncovered syllabus.",
      }, { status: 400 });
    }
    if (c.type === "drill" && c.topics.length) {
      const kept = c.topics.filter((t) => covered.has(t));
      if (!kept.length) {
        return NextResponse.json({
          error: `None of the selected topics have been marked complete for this class yet. Covered so far: ${[...covered].slice(0, 8).join(", ")}${covered.size > 8 ? "…" : ""}. Record coverage on the Syllabus coverage page first.`,
        }, { status: 400 });
      }
      if (kept.length !== c.topics.length) c = { ...c, topics: kept };
    }
    coveredForSnapshot = covered;
  }

  // Freeze every assigned paper once, preserving the on-screen order. A retry
  // under the same idempotency key reuses the paper frozen the first time, so
  // every student in the group still sits the identical questions.
  let id = newAllocId();
  let drillId = newDrillId();
  let existing: DrillRecord | null = null;
  if (idemKey) {
    ({ id, drillId } = await idempotentIds(staff.id, idemKey));
    try { existing = await getDrillRecordStrict(drillId); } catch {
      return NextResponse.json({ error: "Could not check the earlier attempt at this assignment. Please retry." }, { status: 503 });
    }
    if (existing && (existing.mode !== mode || existing.allocationId !== id)) {
      return NextResponse.json({ error: "That idempotency key was already used for a different assignment." }, { status: 409 });
    }
  }
  const drillRef = existing?.ref || await reserveDrillRef();
  const snapshotQs = existing
    ? existing.snapshot.map((s) => questionById(s.id)).filter((q): q is ImgQuestion => !!q)
    : resolveSnapshot(c, coveredForSnapshot);
  if (!snapshotQs.length || (existing && snapshotQs.length !== existing.snapshot.length) || (!existing && c.type === "custom" && snapshotQs.length !== c.ids.length)) {
    return NextResponse.json({ error: "The selected paper contains unavailable questions. Reopen the drill and try again." }, { status: 400 });
  }
  const frozen: AllocContent = { type: "drillref", drillId, ref: drillRef, ids: snapshotQs.map((q) => q.id), spec: c };

  // Permanent, viewable-after Drill Record with a frozen snapshot of the exact
  // question paper + which class/group it was conducted for. The recipient
  // uids are kept so an individually-assigned drill still has a roster.
  let savedDrillId: string | null = null;
  try {
    savedDrillId = drillId;
    const saved = await saveDrillRecord({
      id: drillId, ref: drillRef, allocationId: id, name: b.title.trim().slice(0, 160), mode, content: c,
      snapshotQs,
      targetType: tt as DrillTargetType,
      scopeLabel: (b.scope_label || "").slice(0, 120) || null,
      classId: tt === "class" ? (classIds[0] || null) : null,
      className: tt === "class" ? ((b.scope_label || "").slice(0, 120) || null) : null,
      classIds, studentCount: uids.length, recipientIds: uids,
      createdBy: staff.id, createdByName: staff.fullName || staff.email,
    });
    if (!saved) throw new Error("Drill could not be saved.");
  } catch { return NextResponse.json({ error: "Could not save the drill. Please retry." }, { status: 503 }); }

  let fan: FanoutResult;
  try {
    fan = await allocateToStudentsDetailed([...new Set([...uids, staff.id])], {
      id, mode, content: frozen,
      title: b.title.trim().slice(0, 160),
      instructions: (b.instructions || "").trim().slice(0, 2000) || null,
      durationMin: b.duration_min && b.duration_min > 0 ? Math.round(b.duration_min) : null,
      dueAt,
      startsAt,
      classId: tt === "class" ? (b.class_ids?.[0] || null) : null,
      className: (b.scope_label || "").slice(0, 120) || null,
      createdBy: staff.id,
      createdByName: staff.fullName || staff.email,
    });
  } catch { return NextResponse.json({ error: "Not every recipient could be saved. Please retry the assignment." }, { status: 503 }); }
  const failed = new Set(fan.failed);
  const failedStudents = uids.filter((u) => failed.has(u));
  const savedStudents = uids.filter((u) => !failed.has(u));
  if (!savedStudents.length) {
    return NextResponse.json({ error: "Not every recipient could be saved. Please retry the assignment." }, { status: 503 });
  }
  // Notify each student once: only those who received the allocation in THIS
  // call (a retry skips — and does not re-notify — those who already had it).
  const created = new Set(fan.created);
  const notifyUids = uids.filter((u) => created.has(u));

  if (b.notify && notifyUids.length) {
    try {
      const kindLabel = mode === "test" ? "test" : "assignment";
      const dueTxt = dueAt
        ? `, due ${formatPk(dueAt, { weekday: "short", day: "numeric", month: "short" })}`
        : "";
      await notify({ uids: notifyUids }, {
        type: kindLabel,
        title: `New ${kindLabel}: ${b.title!.trim()}${dueTxt}`,
        body: mode === "test" ? "A proctored test has been set in Exam Lab." : "A new Exam Lab assignment has been set.",
        href: `/portal/exam-lab?allocation=${id}`,
      });
    } catch { /* best-effort */ }
  }


  await audit(staff.id, "exam.allocate", "exam_allocation", id, { target: tt, mode, students: savedStudents.length, failed: failedStudents.length, title: b.title.trim(), drillId: savedDrillId, drillRef, retry: !!existing });
  return NextResponse.json({
    ok: true, id, drillId: savedDrillId, drillRef, frozen: frozen.type === "drillref", students: savedStudents.length, mode, target: tt,
    ...(failedStudents.length ? {
      partial: true,
      failedCount: failedStudents.length,
      warning: `${failedStudents.length} of ${uids.length} students could not be saved. Retry the same assignment${idemKey ? "" : " (with an idempotency key)"} to reach them.`,
    } : {}),
  }, { status: 200 });
}
