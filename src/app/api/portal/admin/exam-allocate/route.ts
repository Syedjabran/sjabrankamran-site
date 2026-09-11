import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, audit } from "@/lib/portal/admin";
import { allocateToStudents, newAllocId, type AllocMode, type AllocContent } from "@/lib/exam-lab/allocations";
import { notify } from "@/lib/portal/notifications";

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
 */
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });

  const b = (await req.json().catch(() => null)) as {
    target_type?: string; class_ids?: string[]; student_email?: string; scope_label?: string;
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

  const c = b.content;
  if (c.type === "paper") { if (!c.code) return NextResponse.json({ error: "Choose a past paper." }, { status: 400 }); }
  else if (c.type === "drill") { if (!c.paperType || !Array.isArray(c.topics) || !c.count) return NextResponse.json({ error: "Incomplete drill spec." }, { status: 400 }); }
  else if (c.type === "custom") {
    if (!Array.isArray(c.ids) || c.ids.length < 1) return NextResponse.json({ error: "Pick at least one question." }, { status: 400 });
    c.ids = c.ids.slice(0, 60).map((x) => String(x).slice(0, 80));
  }
  else if (c.type !== "daily") return NextResponse.json({ error: "Invalid content type." }, { status: 400 });

  const sb = createAdminClient();
  const tt = b.target_type || "class";
  let uids: string[] = [];

  if (tt === "individual") {
    const email = (b.student_email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Enter the student's email." }, { status: 400 });
    const { data: prof } = await sb.from("edu_profiles").select("id").ilike("email", email).maybeSingle();
    if (!prof?.id) return NextResponse.json({ error: "No student found with that email." }, { status: 400 });
    uids = [prof.id as string];
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

  const id = newAllocId();
  await allocateToStudents(uids, {
    id, mode, content: c,
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
        href: "/portal/exam-lab",
      });
    } catch { /* best-effort */ }
  }

  await audit(staff.id, "exam.allocate", "exam_allocation", id, { target: tt, mode, students: uids.length, title: b.title.trim() });
  return NextResponse.json({ ok: true, id, students: uids.length, mode, target: tt }, { status: 200 });
}
