import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit } from "@/lib/portal/admin";
import { questionSeconds, totalSeconds, minutesFromSeconds } from "@/lib/portal/timing";
import { notify as notifyUsers, type NotifKind } from "@/lib/portal/notifications";

export const runtime = "nodejs";

type Question = { prompt: string; marks?: number; kind?: string; options?: string[]; correct?: string; paper?: string; difficulty?: string; seconds?: number };

/**
 * POST — post an assignment OR a test to any class (admin authoring).
 * body: { type:"assignment"|"test", class_id, title, ... , notify?:bool }
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as {
    type?: string; class_id?: string; title?: string; instructions?: string;
    due_at?: string; max_marks?: number; kind?: string; starts_at?: string;
    duration_minutes?: number; total_marks?: number; questions?: Question[]; notify?: boolean;
  } | null;
  if (!b?.class_id || !(b.title || "").trim()) {
    return NextResponse.json({ error: "class_id and title are required." }, { status: 400 });
  }
  const sb = createAdminClient();
  const title = b.title!.trim();

  // Active students in the class (for submission rows + notifications).
  const { data: enr } = await sb.from("edu_enrolments").select("student_id, edu_students(profile_id)").eq("class_id", b.class_id).eq("status", "active");
  const rows = (enr || []) as unknown as { student_id: string; edu_students?: { profile_id?: string } }[];
  const studentIds = rows.map((r) => r.student_id).filter(Boolean);
  const uids = rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x);

  const fmtDue = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null;
  async function notify(kind: NotifKind, bodyText: string, link: string) {
    if (!b?.notify || uids.length === 0) return;
    await notifyUsers({ uids }, { type: kind, title, body: bodyText, href: link });
  }

  if (b.type === "test") {
    const qs = (b.questions || []).filter((q) => (q.prompt || "").trim());
    // Per-question timing from difficulty + paper (+ marks). Explicit seconds win.
    const timing = qs.map((q, i) => ({
      index: i,
      seconds: q.seconds && q.seconds > 0 ? Math.round(q.seconds) : questionSeconds({ paper: q.paper, difficulty: q.difficulty, marks: q.marks, kind: q.kind }),
      paper: q.paper || null, difficulty: q.difficulty || null, marks: q.marks ?? 1,
    }));
    const computedSecs = timing.reduce((s, t) => s + t.seconds, 0) || totalSeconds(qs);
    const durationMinutes = b.duration_minutes || (timing.length ? minutesFromSeconds(computedSecs) : null);

    const { data: a, error } = await sb.from("edu_assessments").insert({
      class_id: b.class_id, title, kind: b.kind || "test",
      starts_at: b.starts_at ? new Date(b.starts_at).toISOString() : null,
      duration_minutes: durationMinutes,
      total_marks: b.total_marks ?? null, status: "published", created_by: admin.id,
    }).select("id").maybeSingle();
    if (error || !a?.id) return NextResponse.json({ error: error?.message || "Could not create the test." }, { status: 400 });

    if (qs.length) {
      await sb.from("edu_questions").insert(qs.map((q, i) => ({
        assessment_id: a.id, kind: q.kind || "mcq", prompt: q.prompt.trim(),
        options: q.options && q.options.length ? q.options : null,
        correct: q.correct ? { value: q.correct } : null,
        marks: q.marks ?? 1, sort_order: i,
      })));
      // Store the per-question timing map (Storage-as-DB; edu_questions has no time column).
      try {
        const body = new Blob([JSON.stringify({ total_seconds: computedSecs, duration_minutes: durationMinutes, questions: timing })], { type: "application/json" });
        await sb.storage.from("portal-data").upload(`test-timing/${a.id}.json`, body, { upsert: true, contentType: "application/json" });
      } catch { /* non-fatal */ }
    }
    await audit(admin.id, "assessment.create", "edu_assessments", a.id as string, { class_id: b.class_id, questions: qs.length, duration_minutes: durationMinutes, title });
    const startsTxt = b.starts_at ? ` It starts ${fmtDue(b.starts_at)}.` : "";
    await notify("test", `New test: ${title}.${startsTxt}`, "/portal/exam-lab");
    return NextResponse.json({ ok: true, id: a.id, type: "test", questions: qs.length, students: studentIds.length, durationMinutes, totalSeconds: computedSecs }, { status: 200 });
  }

  // Default: assignment.
  const { data: a, error } = await sb.from("edu_assignments").insert({
    class_id: b.class_id, title, instructions: (b.instructions || "").trim() || null,
    due_at: b.due_at ? new Date(b.due_at).toISOString() : null,
    max_marks: b.max_marks ?? null, created_by: admin.id,
  }).select("id").maybeSingle();
  if (error || !a?.id) return NextResponse.json({ error: error?.message || "Could not create the assignment." }, { status: 400 });

  // "Post" it: create an assigned submission row for every active student.
  if (studentIds.length) {
    await sb.from("edu_submissions").upsert(
      studentIds.map((sid) => ({ assignment_id: a.id, student_id: sid, status: "assigned" })),
      { onConflict: "assignment_id,student_id" }
    );
  }
  await audit(admin.id, "assignment.create", "edu_assignments", a.id as string, { class_id: b.class_id, students: studentIds.length, title });
  const dueTxt = b.due_at ? `, due ${fmtDue(b.due_at)}` : "";
  await notify("assignment", `New assignment: ${title}${dueTxt}.`, `/portal/learn/assignments/${a.id}`);
  return NextResponse.json({ ok: true, id: a.id, type: "assignment", students: studentIds.length }, { status: 200 });
}
