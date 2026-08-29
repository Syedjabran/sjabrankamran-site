import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/portal/admin";
import { getAttempts } from "@/lib/exam-lab/attempts";

export const runtime = "nodejs";

type Item = { when: string | null; ts: number | null; kind: string; title: string; detail: string; status?: string };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** GET — a user's past / present / future activity across all their classes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const sb = createAdminClient();
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: student } = await sb.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
  const past: Item[] = [];
  const present: Item[] = [];
  const future: Item[] = [];

  // Exam Lab attempts → always "past" activity (self-serve practice).
  const attempts = await getAttempts(uid);
  for (const a of attempts.slice(-40).reverse()) {
    past.push({
      when: new Date(a.ts).toISOString(), ts: a.ts, kind: "practice",
      title: a.mode === "paper" ? `Sat a paper${a.ref ? ` · ${a.ref}` : ""}` : "Topic drill",
      detail: `${a.qCount} questions · scored ${a.score}/${a.total}`,
    });
  }

  if (!student?.id) {
    return NextResponse.json({ hasStudent: false, past: past.sort(byTsDesc), present, future }, { status: 200 });
  }
  const sid = student.id as string;

  const { data: enr } = await sb.from("edu_enrolments").select("class_id, edu_classes(name)").eq("student_id", sid);
  const classIds = (enr || []).map((e) => e.class_id as string);
  const className = new Map((enr || []).map((e) => [e.class_id as string, (e.edu_classes as unknown as { name?: string } | null)?.name || "Class"]));

  const [{ data: att }, { data: results }, { data: subs }] = await Promise.all([
    sb.from("edu_attendance").select("status, recorded_at, edu_lessons(lesson_date, title, class_id)").eq("student_id", sid).order("recorded_at", { ascending: false }).limit(40),
    sb.from("edu_results").select("score, grade, created_at, edu_assessments(title, total_marks)").eq("student_id", sid).order("created_at", { ascending: false }).limit(30),
    sb.from("edu_submissions").select("status, marks, submitted_at, edu_assignments(id, title, due_at, class_id)").eq("student_id", sid).limit(60),
  ]);

  // Past: attendance
  for (const r of att || []) {
    const l = (r as { edu_lessons?: { lesson_date?: string; title?: string } }).edu_lessons || {};
    past.push({ when: l.lesson_date || r.recorded_at, ts: new Date(l.lesson_date || r.recorded_at).getTime(), kind: "attendance", title: `Lesson${l.title ? ` · ${l.title}` : ""}`, detail: `Marked ${r.status}`, status: r.status });
  }
  // Past: marked results
  for (const r of results || []) {
    const a = (r as { edu_assessments?: { title?: string; total_marks?: number } }).edu_assessments || {};
    past.push({ when: r.created_at, ts: new Date(r.created_at).getTime(), kind: "result", title: `Result · ${a.title || "Assessment"}`, detail: `${r.score ?? "—"}${a.total_marks ? `/${a.total_marks}` : ""}${r.grade ? ` · ${r.grade}` : ""}` });
  }

  // Submissions → present (assigned/pending) or past (submitted/marked)
  for (const s of subs || []) {
    const a = (s as { edu_assignments?: { title?: string; due_at?: string } }).edu_assignments || {};
    const done = ["submitted", "late", "marked", "returned"].includes(s.status);
    if (done) {
      past.push({ when: s.submitted_at, ts: s.submitted_at ? new Date(s.submitted_at).getTime() : null, kind: "submission", title: `Submitted · ${a.title || "Assignment"}`, detail: s.marks != null ? `Marked ${s.marks}` : s.status, status: s.status });
    } else {
      // Pending work is always "present" (to do), whether or not it has a due date.
      present.push({ when: a.due_at || null, ts: a.due_at ? new Date(a.due_at).getTime() : null, kind: "assignment", title: `To do · ${a.title || "Assignment"}`, detail: a.due_at ? `Due ${new Date(a.due_at).toLocaleString()}` : "No due date", status: s.status });
    }
  }

  if (classIds.length) {
    const [{ data: lessons }, { data: assigns }, { data: assessments }, { data: schedules }] = await Promise.all([
      sb.from("edu_lessons").select("lesson_date, title, class_id, status").in("class_id", classIds).order("lesson_date", { ascending: true }).limit(120),
      sb.from("edu_assignments").select("id, title, due_at, class_id").in("class_id", classIds).order("due_at", { ascending: true, nullsFirst: false }).limit(60),
      sb.from("edu_assessments").select("id, title, starts_at, duration_minutes, status, class_id").in("class_id", classIds).order("starts_at", { ascending: true, nullsFirst: false }).limit(60),
      sb.from("edu_schedules").select("weekday, starts_at, ends_at, class_id").in("class_id", classIds),
    ]);

    // Lessons: today = present, future = future, past handled by attendance
    for (const l of lessons || []) {
      const d = l.lesson_date as string;
      if (d === todayStr) present.push({ when: d, ts: new Date(d).getTime(), kind: "lesson", title: `Today · ${className.get(l.class_id as string)}`, detail: (l.title as string) || "Lesson", status: l.status as string });
      else if (d > todayStr) future.push({ when: d, ts: new Date(d).getTime(), kind: "lesson", title: `${className.get(l.class_id as string)}`, detail: (l.title as string) || "Lesson" });
    }
    // Assessments: future (upcoming) or present (open now)
    for (const a of assessments || []) {
      const st = a.starts_at ? new Date(a.starts_at as string).getTime() : null;
      if (a.status === "draft") continue;
      if (st && st > now) future.push({ when: a.starts_at as string, ts: st, kind: "test", title: `Test · ${a.title}`, detail: `Starts ${new Date(st).toLocaleString()}${a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}` });
      else if (a.status === "published") present.push({ when: a.starts_at as string | null, ts: st, kind: "test", title: `Open test · ${a.title}`, detail: a.duration_minutes ? `${a.duration_minutes} min` : "Available now" });
    }
    // Assignments not tied to a submission row yet → upcoming due (dedupe by id)
    const subIds = new Set((subs || []).map((s) => (s as { edu_assignments?: { id?: string } }).edu_assignments?.id).filter(Boolean));
    for (const a of assigns || []) {
      if (subIds.has(a.id as string)) continue;
      const due = a.due_at ? new Date(a.due_at as string).getTime() : null;
      if (due && due > now) future.push({ when: a.due_at as string, ts: due, kind: "assignment", title: `Assignment · ${a.title}`, detail: `Due ${new Date(due).toLocaleString()}` });
    }
    // Weekly recurring classes → next occurrence
    const today = new Date();
    for (const s of schedules || []) {
      const wd = Number(s.weekday);
      let delta = (wd - today.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // next week's occurrence (today handled by lessons)
      const next = new Date(today.getTime() + delta * 864e5);
      future.push({ when: next.toISOString().slice(0, 10), ts: next.getTime(), kind: "schedule", title: `${className.get(s.class_id as string)} (weekly)`, detail: `${WEEKDAY[wd]} ${String(s.starts_at).slice(0, 5)}–${String(s.ends_at).slice(0, 5)}` });
    }
  }

  past.sort(byTsDesc);
  future.sort(byTsAsc);
  present.sort(byTsAsc);
  return NextResponse.json({ hasStudent: true, past: past.slice(0, 60), present: present.slice(0, 40), future: future.slice(0, 40) }, { status: 200 });
}

function byTsDesc(a: Item, b: Item) { return (b.ts ?? 0) - (a.ts ?? 0); }
function byTsAsc(a: Item, b: Item) { return (a.ts ?? Infinity) - (b.ts ?? Infinity); }
