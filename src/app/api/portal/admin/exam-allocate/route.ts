import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, isSuperAdmin, audit } from "@/lib/portal/admin";
import { allocateToStudents, newAllocId, type AllocMode, type AllocContent } from "@/lib/exam-lab/allocations";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST — allocate an Exam Lab drill to a class.
 * body: { class_id, mode, content, title, instructions?, duration_min?, due_at?, starts_at?, notify? }
 *   mode: assignment_help | assignment_nohelp | test  (test = super-admin only)
 */
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });

  const b = (await req.json().catch(() => null)) as {
    class_id?: string; mode?: string; content?: AllocContent; title?: string;
    instructions?: string; duration_min?: number; due_at?: string; starts_at?: string; notify?: boolean;
  } | null;
  if (!b?.class_id || !b.title?.trim() || !b.mode || !b.content) {
    return NextResponse.json({ error: "class_id, title, mode and content are required." }, { status: 400 });
  }
  const mode = b.mode as AllocMode;
  if (!["assignment_help", "assignment_nohelp", "test"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }
  if (mode === "test" && !isSuperAdmin(staff)) {
    return NextResponse.json({ error: "Only a super-admin can allocate a proctored test." }, { status: 403 });
  }

  // Validate content shape.
  const c = b.content;
  if (c.type === "paper") { if (!c.code) return NextResponse.json({ error: "Choose a past paper." }, { status: 400 }); }
  else if (c.type === "drill") { if (!c.paperType || !Array.isArray(c.topics) || !c.count) return NextResponse.json({ error: "Incomplete drill spec." }, { status: 400 }); }
  else if (c.type !== "daily") return NextResponse.json({ error: "Invalid content type." }, { status: 400 });

  const sb = createAdminClient();
  const [{ data: enr }, { data: cls }] = await Promise.all([
    sb.from("edu_enrolments").select("student_id, edu_students(profile_id)").eq("class_id", b.class_id).eq("status", "active"),
    sb.from("edu_classes").select("name").eq("id", b.class_id).maybeSingle(),
  ]);
  const rows = (enr || []) as unknown as { edu_students?: { profile_id?: string } }[];
  const uids = rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x);
  if (!uids.length) return NextResponse.json({ error: "No active students in that class." }, { status: 400 });

  const id = newAllocId();
  await allocateToStudents(uids, {
    id,
    mode,
    content: c,
    title: b.title.trim().slice(0, 160),
    instructions: (b.instructions || "").trim().slice(0, 2000) || null,
    durationMin: b.duration_min && b.duration_min > 0 ? Math.round(b.duration_min) : null,
    dueAt: b.due_at ? new Date(b.due_at).toISOString() : null,
    startsAt: b.starts_at ? new Date(b.starts_at).toISOString() : null,
    classId: b.class_id,
    className: (cls as { name?: string } | null)?.name || null,
    createdBy: staff.id,
    createdByName: staff.fullName || staff.email,
  });

  if (b.notify) {
    try {
      const kindLabel = mode === "test" ? "test" : "assignment";
      await sb.from("edu_notifications").insert(uids.map((u) => ({
        user_id: u, kind: kindLabel, title: b.title!.trim(),
        body: mode === "test" ? "A proctored test has been set in Exam Lab." : "A new Exam Lab assignment has been set.",
        link: "/portal/exam-lab",
      })));
    } catch { /* best-effort */ }
  }

  await audit(staff.id, "exam.allocate", "exam_allocation", id, { class_id: b.class_id, mode, students: uids.length, title: b.title.trim() });
  return NextResponse.json({ ok: true, id, students: uids.length, mode }, { status: 200 });
}
