import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ClipboardList, Paperclip, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getMyStudent } from "@/lib/edu/student";
import { signedAttachments } from "@/lib/portal/attachments";

export const metadata = { title: "Assignment" };

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED_EXT = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "png", "jpg", "jpeg", "webp", "txt"];

async function submitWork(formData: FormData) {
  "use server";
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const answerText = String(formData.get("answer_text") ?? "").trim();
  const file = formData.get("file") as File | null;
  if (!assignmentId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: student } = await supabase
    .from("edu_students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) return;

  const files: { path: string; name: string; size: number }[] = [];
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return;
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return;
    const path = `${user.id}/${assignmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from("edu-submissions")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (!upErr) files.push({ path, name: file.name, size: file.size });
  }

  const { data: assignment } = await supabase
    .from("edu_assignments")
    .select("due_at")
    .eq("id", assignmentId)
    .maybeSingle();
  const late = assignment?.due_at ? new Date(assignment.due_at) < new Date() : false;

  const { data: existing } = await supabase
    .from("edu_submissions")
    .select("id, files")
    .eq("assignment_id", assignmentId)
    .eq("student_id", student.id)
    .maybeSingle();

  if (existing) {
    const merged = [...(((existing.files as unknown) ?? []) as typeof files), ...files];
    await supabase
      .from("edu_submissions")
      .update({
        status: late ? "late" : "submitted",
        submitted_at: new Date().toISOString(),
        answer_text: answerText || null,
        files: merged,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("edu_submissions").insert({
      assignment_id: assignmentId,
      student_id: student.id,
      status: late ? "late" : "submitted",
      submitted_at: new Date().toISOString(),
      answer_text: answerText || null,
      files,
    });
  }
  revalidatePath(`/portal/learn/assignments/${assignmentId}`);
}

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("student")) redirect("/portal");
  const student = await getMyStudent();
  if (!student) redirect("/portal/learn");

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("edu_assignments")
    .select("id, title, instructions, due_at, max_marks, allow_resubmission, edu_classes(name)")
    .eq("id", id)
    .maybeSingle();
  if (!assignment) notFound();

  const { data: submission } = await supabase
    .from("edu_submissions")
    .select("id, status, submitted_at, answer_text, files, marks, feedback")
    .eq("assignment_id", id)
    .eq("student_id", student.id)
    .maybeSingle();

  const marked = submission?.status === "marked" || submission?.status === "returned";
  const canSubmit = !submission || submission.status === "assigned" || submission.status === "resubmit" || (!marked && true);
  const files = ((submission?.files as unknown) ?? []) as { path: string; name: string; size: number }[];
  // Teacher-attached resources for this assignment (private bucket, signed 1h).
  const attachments = await signedAttachments("assignment", id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/learn" className="text-xs text-cyan hover:underline">← Back to my learning</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-ice">
          <ClipboardList size={20} className="text-cyan" /> {assignment.title}
        </h1>
        <p className="mt-1 text-sm text-dust">
          {(assignment.edu_classes as unknown as { name: string } | null)?.name}
          {assignment.due_at ? ` · due ${new Date(assignment.due_at).toLocaleString()}` : ""}
          {assignment.max_marks ? ` · ${Number(assignment.max_marks)} marks` : ""}
        </p>
      </div>

      {attachments.length ? (
        <div className="rounded-2xl border border-cyan/20 bg-space/60 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust"><Paperclip size={13} className="text-cyan" /> Attached materials</h2>
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.path}>
                <a href={a.url || "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-fog hover:text-cyan">
                  <Download size={14} className="shrink-0" /> <span className="truncate">{a.name}</span>
                  <span className="text-xs text-dust">({Math.round(a.size / 1024)} KB)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {assignment.instructions ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-5 text-sm leading-relaxed text-fog">
          {assignment.instructions}
        </div>
      ) : null}

      {marked ? (
        <div className="rounded-2xl border border-emerald2/30 bg-space/60 p-5">
          <p className="text-sm font-semibold text-ice">
            Marked{submission?.marks != null ? ` — ${Number(submission.marks)}${assignment.max_marks ? `/${Number(assignment.max_marks)}` : ""}` : ""}
          </p>
          {submission?.feedback ? (
            <p className="mt-2 text-sm leading-relaxed text-fog">{submission.feedback}</p>
          ) : null}
        </div>
      ) : null}

      {submission?.submitted_at ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
          <p className="text-xs uppercase tracking-widest text-dust">
            Submitted {new Date(submission.submitted_at).toLocaleString()} · status {submission.status}
          </p>
          {submission.answer_text ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fog">{submission.answer_text}</p>
          ) : null}
          {files.length ? (
            <ul className="mt-2 space-y-1">
              {files.map((f) => (
                <li key={f.path} className="flex items-center gap-1.5 text-xs text-cyan">
                  <Paperclip size={11} /> {f.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!marked && canSubmit ? (
        <form action={submitWork} className="space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
          <input type="hidden" name="assignment_id" value={assignment.id} />
          <p className="text-sm font-semibold text-ice">
            {submission?.submitted_at ? "Update your submission" : "Submit your work"}
          </p>
          <textarea
            name="answer_text"
            rows={5}
            defaultValue={submission?.answer_text ?? ""}
            placeholder="Type your answer or notes here…"
            className="w-full resize-y rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <div>
            <label htmlFor="submission-file" className="mb-1 block text-xs text-fog">
              Attach a file (PDF, Word, images — max 6&nbsp;MB)
            </label>
            <input
              id="submission-file"
              type="file"
              name="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt"
              className="block w-full text-xs text-fog file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-abyss/60 file:px-3 file:py-1.5 file:text-xs file:text-ice"
            />
          </div>
          <button type="submit" className="btn-primary text-sm">
            {submission?.submitted_at ? "Resubmit" : "Submit"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
