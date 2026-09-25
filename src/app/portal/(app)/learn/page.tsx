import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, CheckSquare, ClipboardList, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/edu/auth";
import { effectiveRoles } from "@/lib/portal/view-as";
import { getMyStudent } from "@/lib/edu/student";
import { attendancePercent } from "@/lib/edu/attendance";
import { formatPk, pkToday } from "@/lib/portal/pk-time";
import { MyTasks } from "./my-tasks";

export const metadata = { title: "My Learning" };

export default async function LearnHome() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const { roles: effRoles } = await effectiveRoles(user);
  if (!effRoles.includes("student")) redirect("/portal");

  const student = await getMyStudent();
  if (!student) {
    return (
      <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
        <h1 className="text-xl font-semibold text-ice">Student profile pending</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fog">
          Your account has the student role, but it isn&apos;t linked to a student record yet. An
          administrator completes this during admission.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  // Lesson dates are Pakistan calendar dates.
  const today = pkToday();
  const weekAhead = pkToday(Date.now() + 7 * 864e5);
  const nowIso = new Date().toISOString();

  const [{ data: enrolments }, { data: results }, { data: attendance }] = await Promise.all([
    supabase
      .from("edu_enrolments")
      .select("class_id, edu_classes(id, name, room, meeting_url, edu_courses(name))")
      .eq("student_id", student.id)
      .eq("status", "active"),
    supabase
      .from("edu_results")
      .select("id, score, grade, feedback, edu_assessments(title, total_marks)")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("edu_attendance").select("status").eq("student_id", student.id),
  ]);

  const classIds = (enrolments ?? []).map((e) => e.class_id);

  const assignmentSelect = "id, title, due_at, max_marks, edu_classes(name), edu_submissions(id, status, marks, student_id)";
  // Two windows so open work is never cut off by the row limit: everything
  // due from now on (plus undated), soonest first, then recent past work.
  const [{ data: lessons }, { data: upcoming }, { data: past }] = await Promise.all([
    classIds.length
      ? supabase
          .from("edu_lessons")
          .select("id, lesson_date, starts_at, title, class_id, edu_classes(name)")
          .in("class_id", classIds)
          .gte("lesson_date", today)
          .lte("lesson_date", weekAhead)
          .order("lesson_date")
      : Promise.resolve({ data: [] as never[] }),
    classIds.length
      ? supabase
          .from("edu_assignments")
          .select(assignmentSelect)
          .in("class_id", classIds)
          .or(`due_at.gte."${nowIso}",due_at.is.null`)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(200)
      : Promise.resolve({ data: [] as never[] }),
    classIds.length
      ? supabase
          .from("edu_assignments")
          .select(assignmentSelect)
          .in("class_id", classIds)
          .lt("due_at", nowIso)
          .order("due_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const assignments = [...(upcoming ?? []), ...(past ?? [])];

  // Same rule as the Saturday email: online counts, excused/leave/exempt are excluded.
  const attPct = attendancePercent((attendance ?? []).map((a) => a.status as string));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-ice">My learning</h1>
        <p className="mt-1 text-sm text-dust">
          Student no. <span className="font-mono">{student.student_no ?? "—"}</span>
          {attPct !== null ? ` · Attendance ${attPct}%` : ""}
        </p>
      </div>

      {/* Individualised tasks & challenges (hidden when none assigned). */}
      <MyTasks />

      {/* Classes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
          <BookOpen size={14} className="text-cyan" /> My classes
        </h2>
        {!enrolments?.length ? (
          <p className="text-sm text-fog">You aren&apos;t enrolled in any classes yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {enrolments.map((e) => {
              const c = e.edu_classes as unknown as {
                id: string;
                name: string;
                room: string | null;
                meeting_url: string | null;
                edu_courses: { name: string } | null;
              } | null;
              return (
                <li key={e.class_id} className="rounded-xl border border-white/10 bg-space/60 px-4 py-3 text-sm">
                  <p className="font-semibold text-ice">{c?.name}</p>
                  <p className="mt-0.5 text-xs text-dust">
                    {c?.edu_courses?.name ?? ""}
                    {c?.room ? ` · Room ${c.room}` : ""}
                  </p>
                  {c?.meeting_url ? (
                    <a href={c.meeting_url} className="mt-1 inline-block text-xs text-cyan hover:underline" target="_blank" rel="noreferrer">
                      Join online lesson →
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Upcoming lessons */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
          <CalendarDays size={14} className="text-cyan" /> Next 7 days
        </h2>
        {!lessons?.length ? (
          <p className="text-sm text-fog">No lessons scheduled in the coming week.</p>
        ) : (
          <ul className="space-y-2">
            {lessons.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm text-fog">
                <span>
                  {l.lesson_date}
                  {l.starts_at ? ` · ${String(l.starts_at).slice(0, 5)}` : ""} —{" "}
                  {(l.edu_classes as unknown as { name: string } | null)?.name}
                </span>
                <span className="text-xs text-dust">{l.title ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assignments */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
          <ClipboardList size={14} className="text-cyan" /> Assignments
        </h2>
        {!assignments?.length ? (
          <p className="text-sm text-fog">No assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const mine = ((a.edu_submissions as unknown as { id: string; status: string; marks: number | null; student_id: string }[]) ?? []).find(
                (s) => s.student_id === student.id
              );
              const overdue = a.due_at && new Date(a.due_at) < new Date() && (!mine || mine.status === "assigned");
              return (
                <li key={a.id}>
                  <Link
                    href={`/portal/learn/assignments/${a.id}`}
                    className="card-hover flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-space/60 px-4 py-3 text-sm"
                  >
                    <span className="text-ice">{a.title}</span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-dust">{(a.edu_classes as unknown as { name: string } | null)?.name}</span>
                      {a.due_at ? (
                        <span className={overdue ? "text-signal" : "text-dust"}>
                          due {formatPk(a.due_at, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
                        {mine?.status === "marked" || mine?.status === "returned"
                          ? `marked${mine.marks != null ? ` ${mine.marks}${a.max_marks ? `/${Number(a.max_marks)}` : ""}` : ""}`
                          : mine?.status ?? "to do"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Results */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
          <Trophy size={14} className="text-cyan" /> Recent results
        </h2>
        {!results?.length ? (
          <p className="text-sm text-fog">No test results yet.</p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => {
              const a = r.edu_assessments as unknown as { title: string; total_marks: number | null } | null;
              return (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm text-fog">
                  <span>{a?.title}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-ice">
                      {r.score != null ? Number(r.score) : "—"}
                      {a?.total_marks ? `/${Number(a.total_marks)}` : ""}
                    </span>
                    {r.grade ? <span className="font-mono text-xs text-cyan">{r.grade}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* AI tutor */}
      <section className="rounded-2xl border border-cyan/20 bg-space/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice">
          <CheckSquare size={14} className="text-cyan" /> Physics Studio AI
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fog">
          Stuck on a concept or a numerical? The AI tutor explains step by step with proper
          mathematical notation — available any time.
        </p>
        <Link href="/physics-studio" className="btn-ghost mt-3 text-xs">
          Open Physics Studio →
        </Link>
      </section>
    </div>
  );
}
