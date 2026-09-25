import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CalendarDays, ClipboardList, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { formatPk, pkDateTimeToIso, pkToday } from "@/lib/portal/pk-time";

export const metadata = { title: "Class" };

async function createLesson(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "");
  const lessonDate = String(formData.get("lesson_date") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!classId || !lessonDate) return;
  const supabase = await createClient();
  await supabase.from("edu_lessons").insert({
    class_id: classId,
    lesson_date: lessonDate,
    title: title || null,
  });
  await supabase.from("edu_audit_logs").insert({
    action: "lesson.create",
    entity: "edu_lessons",
    details: { class_id: classId, lesson_date: lessonDate, title },
  });
  revalidatePath(`/portal/teach/${classId}`);
}

async function createAssignment(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const dueAt = String(formData.get("due_at") ?? "");
  const maxMarks = String(formData.get("max_marks") ?? "");
  if (!classId || !title) return;
  const supabase = await createClient();
  await supabase.from("edu_assignments").insert({
    class_id: classId,
    title,
    instructions: instructions || null,
    // datetime-local has no zone: read it as Pakistan time, not server UTC.
    due_at: pkDateTimeToIso(dueAt),
    max_marks: maxMarks ? Number(maxMarks) : null,
  });
  await supabase.from("edu_audit_logs").insert({
    action: "assignment.create",
    entity: "edu_assignments",
    details: { class_id: classId, title },
  });
  revalidatePath(`/portal/teach/${classId}`);
}

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const allowed = user.roles.includes("teacher") || user.roles.includes("teaching_assistant") || isAdmin(user.roles);
  if (!allowed) redirect("/portal");

  const supabase = await createClient();
  const { data: cls } = await supabase
    .from("edu_classes")
    .select("id, name, room, meeting_url, edu_courses(name)")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) notFound();

  const [{ data: enrolments }, { data: lessons }, { data: assignments }] = await Promise.all([
    supabase
      .from("edu_enrolments")
      .select("id, status, edu_students(id, student_no, edu_profiles:profile_id(full_name))")
      .eq("class_id", classId)
      .eq("status", "active"),
    supabase
      .from("edu_lessons")
      .select("id, lesson_date, title, status")
      .eq("class_id", classId)
      .order("lesson_date", { ascending: false })
      .limit(20),
    supabase
      .from("edu_assignments")
      .select("id, title, due_at, max_marks, edu_submissions(id, status)")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const today = pkToday();

  return (
    <div className="space-y-10">
      <Link href={`/portal/exam-lab?class=${encodeURIComponent(classId)}`} className="btn-primary mb-4 inline-flex">Conduct class drill</Link>
      <div>
        <p className="eyebrow mb-2">
          {(cls.edu_courses as unknown as { name: string } | null)?.name ?? "Class"}
        </p>
        <h1 className="text-2xl font-semibold text-ice">{cls.name}</h1>
        {cls.room ? <p className="mt-1 text-sm text-dust">Room: {cls.room}</p> : null}
      </div>

      {/* Students */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
          <Users size={14} className="text-cyan" /> Students ({enrolments?.length ?? 0})
        </h2>
        {!enrolments?.length ? (
          <p className="text-sm text-fog">No active students enrolled yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {enrolments.map((e) => {
              const s = e.edu_students as unknown as {
                id: string;
                student_no: string | null;
                edu_profiles: { full_name: string } | null;
              } | null;
              return (
                <li key={e.id} className="rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm text-fog">
                  {s?.edu_profiles?.full_name || "(unnamed)"}{" "}
                  <span className="font-mono text-[10px] text-dust">{s?.student_no ?? ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Lessons & attendance */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
          <CalendarDays size={14} className="text-cyan" /> Lessons &amp; attendance
        </h2>
        <form action={createLesson} className="mb-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="class_id" value={classId} />
          <input
            type="date"
            name="lesson_date"
            defaultValue={today}
            required
            className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice focus:border-cyan focus:outline-none"
          />
          <input
            name="title"
            placeholder="Lesson topic (optional)"
            className="w-56 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <button type="submit" className="btn-ghost !px-3 !py-2 text-xs">Add lesson</button>
        </form>
        {!lessons?.length ? (
          <p className="text-sm text-fog">No lessons recorded yet — add today&apos;s lesson above to mark attendance.</p>
        ) : (
          <ul className="space-y-2">
            {lessons.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm">
                <span className="text-fog">
                  {l.lesson_date} {l.title ? `— ${l.title}` : ""}
                </span>
                <Link
                  href={`/portal/teach/${classId}/attendance/${l.id}`}
                  className="text-xs text-cyan hover:underline"
                >
                  Mark attendance →
                </Link>
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
        <form action={createAssignment} className="mb-4 space-y-2 rounded-2xl border border-white/10 bg-space/60 p-4">
          <input type="hidden" name="class_id" value={classId} />
          <div className="flex flex-wrap gap-2">
            <input
              name="title"
              required
              placeholder="Assignment title"
              className="w-64 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
            />
            <input
              type="datetime-local"
              name="due_at"
              aria-label="Due date"
              className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice focus:border-cyan focus:outline-none"
            />
            <input
              type="number"
              name="max_marks"
              min="1"
              step="0.5"
              placeholder="Max marks"
              className="w-28 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
            />
          </div>
          <textarea
            name="instructions"
            rows={2}
            placeholder="Instructions (optional, supports LaTeX in a later stage)"
            className="w-full resize-none rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <button type="submit" className="btn-ghost !px-3 !py-2 text-xs">Create assignment</button>
        </form>
        {!assignments?.length ? (
          <p className="text-sm text-fog">No assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const subs = (a.edu_submissions as unknown as { id: string; status: string }[]) ?? [];
              const submitted = subs.filter((s) => ["submitted", "late", "marked", "returned"].includes(s.status)).length;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm">
                  <span className="text-fog">{a.title}</span>
                  <span className="flex items-center gap-3 text-xs text-dust">
                    {a.due_at ? <span>due {formatPk(a.due_at, { day: "numeric", month: "short", year: "numeric" })}</span> : null}
                    {a.max_marks ? <span>/{Number(a.max_marks)}</span> : null}
                    <span className="text-cyan">{submitted} submitted</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
