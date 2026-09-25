import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin, type EduRole } from "@/lib/edu/auth";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABEL,
  ATTENDANCE_MIGRATION_FILE,
  isAttendanceStatus,
  needsEnumMigration,
  normaliseReason,
  allowsReason,
  requiresReason,
} from "@/lib/edu/attendance";
import { staffRoleMap, isDemoStudentName } from "@/lib/portal/institutions";

export const metadata = { title: "Mark Attendance" };

const STATUSES = ATTENDANCE_STATUSES;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type RosterStudent = { id: string; student_no: string | null; name: string | null };

function canMark(roles: EduRole[]) {
  return roles.includes("teacher") || roles.includes("teaching_assistant") || isAdmin(roles);
}

/**
 * Active students of a class, filtered exactly like the admin attendance API:
 * no enrolled staff, no placeholder/demo accounts, no orphan rows without a
 * linked profile.
 */
async function loadRoster(supabase: Supabase, classId: string): Promise<RosterStudent[]> {
  const { data } = await supabase
    .from("edu_enrolments")
    .select("edu_students(id, student_no, profile_id, edu_profiles:profile_id(full_name))")
    .eq("class_id", classId)
    .eq("status", "active");
  type Student = { id: string; student_no: string | null; profile_id: string | null; edu_profiles: { full_name: string | null } | null };
  const students = ((data ?? []) as unknown as { edu_students: Student | null }[])
    .map((e) => e.edu_students)
    .filter((s): s is Student => !!s);
  const roleMap = await staffRoleMap(students.map((s) => s.profile_id).filter((x): x is string => !!x));
  return students
    .filter((s) => !!s.profile_id && !roleMap.has(s.profile_id) && !isDemoStudentName(s.edu_profiles?.full_name))
    .map((s) => ({ id: s.id, student_no: s.student_no, name: s.edu_profiles?.full_name ?? null }));
}

async function saveAttendance(formData: FormData) {
  "use server";
  const lessonId = String(formData.get("lesson_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  if (!lessonId || !classId) return;
  const user = await getPortalUser();
  if (!user || !canMark(user.roles)) return;
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("edu_lessons").select("class_id").eq("id", lessonId).maybeSingle();
  if (!lesson || lesson.class_id !== classId) return;

  // The server-side roster (not whichever fields were posted) decides who is
  // on the register, so staff/demo accounts can never be marked.
  const roster = await loadRoster(supabase, classId);
  const rows: { lesson_id: string; student_id: string; status: string; note: string | null }[] = [];
  const noReason: string[] = [];
  for (const s of roster) {
    const picked = String(formData.get(`status:${s.id}`) ?? "");
    // Every row is pre-set on the form, so a missing value is a malformed post; don't count it as present.
    const status = isAttendanceStatus(picked) ? picked : "absent";
    // A reason is only kept for the statuses that carry one, so switching a
    // student back to Present cannot leave a stale exemption reason behind.
    const note = allowsReason(status) ? normaliseReason(formData.get(`note:${s.id}`)) : "";
    // A lesson exemption is an official act — never store one without a
    // reason. It is reported back to the teacher, not silently dropped.
    if (requiresReason(status) && !note) { noReason.push(s.id); continue; }
    rows.push({ lesson_id: lessonId, student_id: s.id, status, note: note || null });
  }

  let saved = 0;
  let failed = false;
  let blocked: string[] = [];
  if (rows.length) {
    const { error } = await supabase.from("edu_attendance").upsert(rows, { onConflict: "lesson_id,student_id" });
    if (!error) saved = rows.length;
    else {
      // Until edu-002 runs, some statuses are not in the DB enum. Save every
      // mark the DB accepts and say what must be run (as the admin API does).
      blocked = [...new Set(rows.filter((r) => needsEnumMigration(r.status)).map((r) => r.status))];
      const safe = rows.filter((r) => !needsEnumMigration(r.status));
      const retry = blocked.length && safe.length ? await supabase.from("edu_attendance").upsert(safe, { onConflict: "lesson_id,student_id" }) : null;
      if (retry && !retry.error) saved = safe.length;
      else failed = true;
    }
    if (saved) {
      await supabase.from("edu_audit_logs").insert({
        action: "attendance.save",
        entity: "edu_attendance",
        entity_id: lessonId,
        details: { count: saved, ...(blocked.length ? { blocked } : {}), ...(noReason.length ? { missingReason: noReason.length } : {}) },
      });
    }
  }
  const back = `/portal/teach/${classId}/attendance/${lessonId}`;
  revalidatePath(back);
  const q = new URLSearchParams({ saved: String(saved) });
  if (failed) q.set("failed", "1");
  if (blocked.length) q.set("blocked", blocked.join(","));
  if (noReason.length) q.set("noreason", noReason.slice(0, 40).join(","));
  redirect(`${back}?${q.toString()}`);
}

type SaveQuery = { saved?: string; failed?: string; blocked?: string; noreason?: string };

/** Outcome of the last save, rebuilt from the redirect's query (ids/statuses are validated). */
function saveOutcome(sp: SaveQuery, roster: RosterStudent[]) {
  if (sp.saved === undefined) return null;
  const saved = Number.parseInt(sp.saved, 10) || 0;
  const blocked = (sp.blocked || "").split(",").filter(isAttendanceStatus).map((s) => `‘${ATTENDANCE_LABEL[s]}’`).join(", ");
  const byId = new Map(roster.map((s) => [s.id, s.name || "(unnamed)"]));
  const flagged = (sp.noreason || "").split(",").filter((id) => byId.has(id));
  const lines: { ok: boolean; text: string }[] = [];
  if (sp.failed) {
    lines.push({ ok: false, text: blocked
      ? `Attendance was NOT saved: ${blocked} marks need a one-time DB migration — ask an admin to run ${ATTENDANCE_MIGRATION_FILE}.`
      : "Attendance was NOT saved — the database rejected the register. Please try again, or contact an admin if this keeps happening." });
  } else {
    lines.push({ ok: true, text: `Saved attendance for ${saved} student${saved === 1 ? "" : "s"}.` });
    if (blocked) lines.push({ ok: false, text: `${blocked} marks could not be saved yet — ask an admin to run ${ATTENDANCE_MIGRATION_FILE}. All other marks were saved.` });
  }
  if (flagged.length) {
    lines.push({ ok: false, text: `Not saved — Exempt needs an official reason: ${flagged.map((id) => byId.get(id)).join(", ")}. Choose Exempt again and type the reason, then save.` });
  }
  return { lines, flagged: new Set(flagged) };
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; lessonId: string }>;
  searchParams: Promise<SaveQuery>;
}) {
  const { classId, lessonId } = await params;
  const sp = await searchParams;
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canMark(user.roles)) redirect("/portal");

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("edu_lessons")
    .select("id, lesson_date, title, class_id, edu_classes(name)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson || lesson.class_id !== classId) notFound();

  const [students, { data: existing }] = await Promise.all([
    loadRoster(supabase, classId),
    supabase.from("edu_attendance").select("student_id, status, note").eq("lesson_id", lessonId),
  ]);

  const byStudent = new Map((existing ?? []).map((a) => [a.student_id, a]));
  const outcome = saveOutcome(sp, students);

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

      {outcome ? (
        <div role="status" className="space-y-1 rounded-xl border border-white/10 bg-space/60 px-4 py-3 text-xs">
          {outcome.lines.map((l) => <p key={l.text} className={l.ok ? "text-emerald2" : "text-magenta"}>{l.text}</p>)}
        </div>
      ) : null}

      {!students.length ? (
        <p className="text-sm text-fog">No active students enrolled in this class.</p>
      ) : (
        <form action={saveAttendance} className="space-y-3">
          <input type="hidden" name="lesson_id" value={lessonId} />
          <input type="hidden" name="class_id" value={classId} />
          <p className="text-xs text-dust">Everyone starts as Present — change only the students who are not.</p>
          {students.map((s) => {
            const current = byStudent.get(s.id);
            const flagged = outcome?.flagged.has(s.id);
            return (
              <fieldset key={s.id} className={`rounded-2xl border bg-space/60 p-4 ${flagged ? "border-magenta/50" : "border-white/10"}`}>
                <legend className="px-1 text-sm font-semibold text-ice">
                  {s.name || "(unnamed)"}{" "}
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
                      {ATTENDANCE_LABEL[st]}
                    </label>
                  ))}
                  <input
                    name={`note:${s.id}`}
                    defaultValue={current?.note ?? ""}
                    aria-label={`Reason or note for ${s.name || "student"} — required when Exempt is selected`}
                    placeholder="Reason (required for Exempt)"
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
