import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ClipboardList, Paperclip, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getMyStudent } from "@/lib/edu/student";
import { signedAttachments } from "@/lib/portal/attachments";
import { mirrorUserUpload } from "@/lib/google/drive-write";
import { formatPk } from "@/lib/portal/pk-time";

export const metadata = { title: "Assignment" };

const DATE_TIME: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

// Vercel rejects request bodies over 4.5 MB before the action even runs, so
// cap uploads safely below that and say so on the form.
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_EXT = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "png", "jpg", "jpeg", "webp", "txt"];

// Outcome codes the action redirects back with (?notice=…), rendered above the form.
const NOTICES: Record<string, { tone: "error" | "ok"; text: string }> = {
  "saved": { tone: "ok", text: "Your work has been submitted." },
  "too-large": { tone: "error", text: "That file is larger than 4 MB, so it was not attached. Please compress it or split it into smaller files and try again." },
  "bad-type": { tone: "error", text: "That file type isn’t accepted. Attach a PDF, Word, PowerPoint, Excel, image (PNG/JPG/WEBP) or text file." },
  "upload-failed": { tone: "error", text: "Your file couldn’t be uploaded. Please try again in a moment." },
  "closed": { tone: "error", text: "This assignment no longer accepts changes to your submission." },
  "save-failed": { tone: "error", text: "Your submission couldn’t be saved. Please try again in a moment." },
};
// When only the FILE fails, the typed answer is still kept (see submitWork).
const KEPT_NOTE: Record<string, string> = {
  draft: " Your typed answer has been kept as a draft — nothing was submitted yet.",
  edit: " Your typed answer was saved with your submission.",
};

async function submitWork(formData: FormData) {
  "use server";
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const answerText = String(formData.get("answer_text") ?? "").trim();
  const file = formData.get("file") as File | null;
  if (!assignmentId) return;
  const back = (notice: string, kept?: "draft" | "edit"): never =>
    redirect(`/portal/learn/assignments/${encodeURIComponent(assignmentId)}?notice=${notice}${kept ? `&kept=${kept}` : ""}`);

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

  const [{ data: assignment }, { data: existing }] = await Promise.all([
    supabase.from("edu_assignments").select("due_at, allow_resubmission").eq("id", assignmentId).maybeSingle(),
    supabase
      .from("edu_submissions")
      .select("id, status, submitted_at, files")
      .eq("assignment_id", assignmentId)
      .eq("student_id", student.id)
      .maybeSingle(),
  ]);
  if (!assignment) return;
  // Work already handed in (submitted/late) may only be edited when the
  // teacher allows resubmission; marked work is closed; "assigned"/"resubmit"
  // is an open round.
  const handedIn = existing?.status === "submitted" || existing?.status === "late";
  if (existing?.status === "marked" || existing?.status === "returned" || (handedIn && !assignment.allow_resubmission)) back("closed");

  const files: { path: string; name: string; size: number }[] = [];
  let fileError: string | null = null;
  if (file && file.size > 0) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (file.size > MAX_FILE_BYTES) fileError = "too-large";
    else if (!ALLOWED_EXT.includes(ext)) fileError = "bad-type";
    else {
      const path = `${user.id}/${assignmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("edu-submissions")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) fileError = "upload-failed";
      else {
        files.push({ path, name: file.name, size: file.size });
        // Best-effort mirror into Google Drive → sjabrankamran.com/Assignments/<student>
        try {
          const pu = await getPortalUser();
          const label = pu?.fullName ? `${pu.fullName} (${pu.email})` : (pu?.email || user.id);
          await mirrorUserUpload("assignments", user.id, label, `${assignmentId}-${Date.now()}-${file.name}`, file.type || "application/octet-stream", file);
        } catch { /* optional */ }
      }
    }
  }

  let error: { message: string } | null = null;
  if (fileError && !handedIn) {
    // The file failed on a first hand-in: keep the typed answer as a draft
    // (status unchanged, nothing submitted) so the student can re-attach.
    if (answerText) {
      ({ error } = existing
        ? await supabase.from("edu_submissions").update({ answer_text: answerText }).eq("id", existing.id)
        : await supabase.from("edu_submissions").insert({ assignment_id: assignmentId, student_id: student.id, status: "assigned", answer_text: answerText, files: [] }));
      revalidatePath(`/portal/learn/assignments/${assignmentId}`);
    }
    back(fileError, answerText && !error ? "draft" : undefined);
  }

  const nowIso = new Date().toISOString();
  const pastDue = assignment.due_at ? new Date(assignment.due_at) < new Date() : false;
  // Editing work already handed in keeps its original status: an on-time
  // submission edited after the deadline stays on time, and keeps the original
  // submitted_at the KPI on-time check reads. A new round is judged now.
  const status = handedIn && existing ? existing.status : pastDue ? "late" : "submitted";
  const submittedAt = handedIn && pastDue ? (existing?.submitted_at ?? nowIso) : nowIso;

  if (existing) {
    const merged = [...(((existing.files as unknown) ?? []) as typeof files), ...files];
    ({ error } = await supabase
      .from("edu_submissions")
      .update({
        status,
        submitted_at: submittedAt,
        answer_text: answerText || null,
        files: merged,
      })
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("edu_submissions").insert({
      assignment_id: assignmentId,
      student_id: student.id,
      status,
      submitted_at: submittedAt,
      answer_text: answerText || null,
      files,
    }));
  }
  revalidatePath(`/portal/learn/assignments/${assignmentId}`);
  if (error) back("save-failed");
  if (fileError) back(fileError, "edit");
  back("saved");
}

export default async function AssignmentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const notice = NOTICES[typeof sp.notice === "string" ? sp.notice : ""] ?? null;
  const keptNote = notice?.tone === "error" && typeof sp.kept === "string" ? KEPT_NOTE[sp.kept] ?? "" : "";
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
  // Work already handed in can only be edited when the teacher allows resubmission.
  const handedIn = submission?.status === "submitted" || submission?.status === "late";
  const canSubmit = !marked && (!handedIn || !!assignment.allow_resubmission);
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
          {assignment.due_at ? ` · due ${formatPk(assignment.due_at, DATE_TIME)}` : ""}
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

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-signal/40 bg-signal/5 text-signal" : "border-emerald2/30 bg-emerald2/5 text-emerald2"}`}
        >
          {notice.text}{keptNote}
        </p>
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
            Submitted {formatPk(submission.submitted_at, DATE_TIME)} · status {submission.status}
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
              Attach a file (PDF, Word, images — max 4&nbsp;MB)
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
