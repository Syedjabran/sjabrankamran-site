import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/portal/admin";
import { allocateToStudents, newAllocId, type AllocMode, type AllocContent } from "@/lib/exam-lab/allocations";
import { notify } from "@/lib/portal/notifications";
import { saveDrillRecord, resolveSnapshot, newDrillId, reserveDrillRef, type DrillTargetType } from "@/lib/exam-lab/drill-records";
import { getPortalUser, isAdmin, isExamLabStaff } from "@/lib/edu/auth";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { coveredTopicsForTarget, DEFAULT_COURSE } from "@/lib/exam-lab/syllabus-coverage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST — allocate an Exam Lab drill to a target.
 * body: {
 *   target_type: "class"|"school"|"network"|"individual",
 *   class_ids?: string[],        // for class/school/network (resolved by the client)
 *   student_email?: string,      // for individual
 *   scope_label?: string,        // human label shown to the student
 *   mode, content, title, instructions?, duration_min?, due_at?, starts_at?, notify?
 * }
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
  } | null;
  if (!b?.title?.trim() || !b.mode || !b.content) {
    return NextResponse.json({ error: "title, mode and content are required." }, { status: 400 });
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

  // Freeze every assigned paper once, preserving the on-screen order.
  const drillId = newDrillId();
  const drillRef = await reserveDrillRef();
  const snapshotQs = resolveSnapshot(c, coveredForSnapshot);
  if (!snapshotQs.length || (c.type === "custom" && snapshotQs.length !== c.ids.length)) {
    return NextResponse.json({ error: "The selected paper contains unavailable questions. Reopen the drill and try again." }, { status: 400 });
  }
  const frozen: AllocContent = { type: "drillref", drillId, ref: drillRef, ids: snapshotQs.map((q) => q.id), spec: c };

  const id = newAllocId();
  // Permanent, viewable-after Drill Record with a frozen snapshot of the exact
  // question paper + which class/group it was conducted for.
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
      classIds, studentCount: uids.length,
      createdBy: staff.id, createdByName: staff.fullName || staff.email,
    });
    if (!saved) throw new Error("Drill could not be saved.");
  } catch { return NextResponse.json({ error: "Could not save the drill. Please retry." }, { status: 503 }); }

  try {
  await allocateToStudents([...new Set([...uids, staff.id])], {
    id, mode, content: frozen,
    title: b.title.trim().slice(0, 160),
    instructions: (b.instructions || "").trim().slice(0, 2000) || null,
    durationMin: b.duration_min && b.duration_min > 0 ? Math.round(b.duration_min) : null,
    dueAt: b.due_at ? new Date(b.due_at).toISOString() : null,
    startsAt: b.starts_at ? new Date(b.starts_at).toISOString() : null,
    classId: tt === "class" ? (b.class_ids?.[0] || null) : null,
    className: (b.scope_label || "").slice(0, 120) || null,
    createdBy: staff.id,
    createdByName: staff.fullName || staff.email,
  });

  } catch { return NextResponse.json({ error: "Not every recipient could be saved. Please retry the assignment." }, { status: 503 }); }

  if (b.notify) {
    try {
      const kindLabel = mode === "test" ? "test" : "assignment";
      const dueTxt = b.due_at
        ? `, due ${new Date(b.due_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
        : "";
      await notify({ uids }, {
        type: kindLabel,
        title: `New ${kindLabel}: ${b.title!.trim()}${dueTxt}`,
        body: mode === "test" ? "A proctored test has been set in Exam Lab." : "A new Exam Lab assignment has been set.",
        href: `/portal/exam-lab?allocation=${id}`,
      });
    } catch { /* best-effort */ }
  }


  await audit(staff.id, "exam.allocate", "exam_allocation", id, { target: tt, mode, students: uids.length, title: b.title.trim(), drillId: savedDrillId, drillRef });
  return NextResponse.json({ ok: true, id, drillId: savedDrillId, drillRef, frozen: frozen.type === "drillref", students: uids.length, mode, target: tt }, { status: 200 });
}
