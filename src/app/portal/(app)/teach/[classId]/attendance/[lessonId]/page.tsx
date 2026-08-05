import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";

export const metadata = { title: "Mark Attendance" };

const STATUSES = ["present", "absent", "late", "excused"] as const;

async function saveAttendance(formData: FormData) {
  "use server";
  const lessonId = String(formData.get("lesson_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  if (!lessonId || !classId) return;
  const supabase = await createClient();

  const rows: { lesson_id: string; student_id: string; status: string; note: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("status:")) {
      const studentId = key.slice("status:".length);
      const note = String(formData.get(`note:${studentId}`) ?? "").trim();
      rows.push({
        lesson_id: lessonId,
        student_id: studentId,
        status: String(value),
        note: note || null,
      });
    }
  }
  if (rows.length) {
    await supabase.from("edu_attendance").upsert(rows, { onConflict: "lesson_id,student_id" });
    await supabase.from("edu_audit_logs").insert({
      action: "attendance.save",
      entity: "edu_attendance",
      entity_id: lessonId,
      details: { count: rows.length },
    });
  }
  revalidatePath(`/portal/teach/${classId}/attendance/${lessonId}`);
}

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ classId: string; lessonId: string }>;
}) {
  const { classId, lessonId } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const allowed = user.roles.includes("teacher") || user.roles.includes("teaching_assistant") || isAdmin(user.roles);
  if (!allowed) redirect("/portal");

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("edu_lessons")
    .select("id, lesson_date, title, class_id, edu_classes(name)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson || lesson.class_id !== classId) notFound();

  const [{ data: enrolments }, { data: existing }] = await Promise.all([
    supabase
      .from("edu_enrolments")
      .select("edu_students(id, student_no, edu_profiles:profile_id(full_name))")
      .eq("class_id", classId)
      .eq("status", "active"),
    supabase.from("edu_attendance").select("student_id, status, note").eq("lesson_id", lessonId),
  ]);

  const byStudent = new Map((existing ?? []).map((a) => [a.student_id, a]));
  const students = (enrolments ?? [])
    .map((e) =>
      e.edu_students as unknown as {
        id: string;
        student_no: string | null;
        edu_profiles: { full_name: string } | null;
      } | null
    )
    .filter(Boolean) as { id: string; student_no: string | null; edu_profiles: { full_name: string } | null }[];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/teach/${classId}`} className="text-xs text-cyan hover:underline">
          ← Back to {(lesson.edu_classes as unknown as { name: string } | null)?.name ?? "class"}
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-ice">
          <CheckSquare size={20} className="text-cyan" /> Attendance — {lesson.lesson_date}
        </h1>
        {lesson.title ? <p className="mt-1 text-sm text-dust">{lesson.title}</p> : null}
      </div>

      {!students.length ? (
        <p className="text-sm text-fog">No active students enrolled in this class.</p>
      ) : (
        <form action={saveAttendance} className="space-y-3">
          <input type="hidden" name="lesson_id" value={lessonId} />
          <input type="hidden" name="class_id" value={classId} />
          {students.map((s) => {
            const current = byStudent.get(s.id);
            return (
              <fieldset key={s.id} className="rounded-2xl border border-white/10 bg-space/60 p-4">
                <legend className="px-1 text-sm font-semibold text-ice">
                  {s.edu_profiles?.full_name || "(unnamed)"}{" "}
                  <span className="font-mono text-[10px] text-dust">{s.student_no ?? ""}</span>
                </legend>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {STATUSES.map((st) => (
                    <label key={st} className="flex cursor-pointer items-center gap-1.5 text-xs text-fog">
                      <input
                        type="radio"
                        name={`status:${s.id}`}
                        value={st}
                        defaultChecked={current ? current.status === st : st === "present"}
                        className="accent-cyan"
                      />
                      {st}
                    </label>
                  ))}
                  <input
                    name={`note:${s.id}`}
                    defaultValue={current?.note ?? ""}
                    placeholder="Note (optional)"
                    className="ml-auto w-44 rounded-lg border border-white/10 bg-abyss/60 px-2.5 py-1.5 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
                  />
                </div>
              </fieldset>
            );
          })}
          <button type="submit" className="btn-primary text-sm">Save attendance</button>
        </form>
      )}
    </div>
  );
}
