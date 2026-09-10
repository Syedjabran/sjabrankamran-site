"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

type Props = {
  id: string;
  status: "assigned" | "in_progress" | "done";
  mandatory: boolean;
  activityType?: string;
  launchHref: string | null;
  existingNote: string | null;
};

async function updateTask(id: string, status: Props["status"], note?: string) {
  const response = await fetch("/api/portal/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task_id: id, status, note }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
}

export function TaskActions({ id, status, mandatory, activityType, launchHref, existingNote }: Props) {
  const router = useRouter();
  const [note, setNote] = useState(existingNote || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const examActivity = activityType === "daily_challenge" || activityType === "short_test";

  async function begin() {
    if (!launchHref) return;
    setBusy(true); setError("");
    try {
      if (status === "assigned") await updateTask(id, "in_progress");
      if (launchHref.startsWith("/")) router.push(launchHref);
      else window.location.assign(launchHref);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this task.");
      setBusy(false);
    }
  }

  async function complete() {
    const clean = note.trim();
    if (mandatory && !clean) {
      setError("Add a brief completion or submission note before marking this task done.");
      return;
    }
    setBusy(true); setError("");
    try {
      await updateTask(id, "done", clean || undefined);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {launchHref && status !== "done" ? (
        <button onClick={begin} disabled={busy} className="btn-primary text-sm">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          {examActivity ? "Begin in Exam Lab" : "Open activity"}
        </button>
      ) : null}

      {!examActivity && status !== "done" ? (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-space/60 p-4">
          <label htmlFor="task-note" className="text-xs font-semibold uppercase tracking-widest text-dust">
            Completion / submission note {mandatory ? "(required)" : "(optional)"}
          </label>
          <textarea id="task-note" rows={5} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Write what you completed, learned, or submit your written response here…"
            className="w-full resize-y rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
          <button onClick={complete} disabled={busy} className="btn-primary text-sm">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Submit and mark done
          </button>
        </div>
      ) : null}

      {examActivity && status !== "done" ? <p className="text-xs text-dust">This task is marked complete automatically when the linked Exam Lab activity is submitted.</p> : null}
      {status === "done" ? <p className="flex items-center gap-2 text-sm text-emerald2"><CheckCircle2 size={15} /> Completed and recorded.</p> : null}
      {error ? <p className="rounded-xl border border-signal/30 bg-signal/[0.06] px-3 py-2 text-sm text-signal">{error}</p> : null}
    </div>
  );
}
