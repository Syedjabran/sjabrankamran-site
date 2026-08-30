"use client";

import { useCallback, useEffect, useState } from "react";
import { Target, Trophy, Plus, Trash2, Link2, Loader2, CheckCircle2, Clock, CircleDashed } from "lucide-react";

type Task = {
  id: string; title: string; details: string; kind: "task" | "challenge";
  dueAt: string | null; points: number | null; resourceUrl: string | null;
  status: "assigned" | "in_progress" | "done"; createdByName: string;
  createdAt: number; completedAt: number | null; studentNote: string | null;
};

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const STATUS_META: Record<Task["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  assigned: { label: "Assigned", cls: "border-white/20 text-dust", icon: <CircleDashed size={11} /> },
  in_progress: { label: "In progress", cls: "border-amber-300/40 text-amber-300", icon: <Clock size={11} /> },
  done: { label: "Done", cls: "border-emerald2/40 text-emerald2", icon: <CheckCircle2 size={11} /> },
};

export function IndividualTasks({ id, studentName }: { id: string; studentName: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [show, setShow] = useState(false);
  const [kind, setKind] = useState<"task" | "challenge">("task");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [points, setPoints] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { const j = await api(`/api/portal/admin/users/${id}/tasks`); setTasks(j.tasks); } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setErr("");
    try {
      await api(`/api/portal/admin/users/${id}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title, details, kind,
          due_at: dueAt || null,
          points: points ? Number(points) : null,
          resource_url: resourceUrl || null,
          notify: true,
        }),
      });
      setTitle(""); setDetails(""); setDueAt(""); setPoints(""); setResourceUrl(""); setShow(false);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function del(taskId: string) {
    if (!confirm("Remove this personal task?")) return;
    try { await api(`/api/portal/admin/users/${id}/tasks?task_id=${taskId}`, { method: "DELETE" }); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  const input = "w-full rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";
  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <section className="rounded-2xl border border-cyan/20 bg-space/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust">
          <Target size={13} className="text-cyan" /> Individualised tasks &amp; challenges
          <span className="ml-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-fog">{open} open · {tasks.length} total</span>
        </h2>
        <button onClick={() => setShow((s) => !s)} className="btn-ghost !px-3 !py-1.5 text-xs"><Plus size={13} /> Assign to {studentName.split(" ")[0] || "student"}</button>
      </div>

      <p className="mt-1.5 text-[11px] text-dust">Set one-to-one work for this student only — separate from class assignments and platform-wide challenges. They see it in <b className="text-fog">My Learning</b> and get a notification.</p>

      {show ? (
        <div className="mt-3 space-y-2.5 rounded-xl border border-white/10 bg-abyss/40 p-4">
          <div className="flex gap-2">
            {(["task", "challenge"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={"inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs " + (kind === k ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
                {k === "task" ? <Target size={13} /> : <Trophy size={13} />} {k === "task" ? "Task" : "Challenge"}
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "challenge" ? "Challenge title (e.g. Master projectile motion)" : "Task title (e.g. Redo Q4 P2 May 2023)"} className={input} />
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Instructions / details (optional)" className={input + " resize-none"} />
          <div className="flex flex-wrap gap-2">
            <div><label className="mb-1 block text-[11px] text-dust">Due</label><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={input} /></div>
            {kind === "challenge" ? <div className="w-28"><label className="mb-1 block text-[11px] text-dust">Reward points</label><input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="e.g. 20" className={input} /></div> : null}
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] text-dust"><Link2 size={11} /> Link a resource (optional)</label>
            <input value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="https://… (paper, video, Drive file)" className={input} />
          </div>
          {err ? <p className="text-xs text-signal">{err}</p> : null}
          <button onClick={submit} disabled={busy || !title.trim()} className="btn-primary !px-4 !py-2 text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Assign {kind}</button>
        </div>
      ) : null}

      {tasks.length ? (
        <ul className="mt-3 space-y-2">
          {tasks.map((t) => {
            const sm = STATUS_META[t.status];
            const overdue = t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "done";
            return (
              <li key={t.id} className="rounded-xl border border-white/10 bg-abyss/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ice">
                      {t.kind === "challenge" ? <Trophy size={13} className="shrink-0 text-amber-300" /> : <Target size={13} className="shrink-0 text-cyan" />}
                      <span className="truncate">{t.title}</span>
                      <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] " + sm.cls}>{sm.icon} {sm.label}</span>
                      {t.points ? <span className="rounded-full border border-amber-300/30 px-2 py-0.5 text-[10px] text-amber-300">+{t.points} pts</span> : null}
                    </p>
                    {t.details ? <p className="mt-1 whitespace-pre-wrap text-xs text-fog">{t.details}</p> : null}
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-dust">
                      <span>by {t.createdByName}</span>
                      {t.dueAt ? <span className={overdue ? "text-signal" : ""}>· due {new Date(t.dueAt).toLocaleString()}</span> : null}
                      {t.resourceUrl ? <a href={t.resourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline"><Link2 size={10} /> resource</a> : null}
                      {t.completedAt ? <span className="text-emerald2">· completed {new Date(t.completedAt).toLocaleDateString()}</span> : null}
                    </p>
                    {t.studentNote ? <p className="mt-1 rounded-lg border border-white/10 bg-space/60 px-2 py-1 text-[11px] text-fog"><span className="text-dust">Student note:</span> {t.studentNote}</p> : null}
                  </div>
                  <button onClick={() => del(t.id)} className="shrink-0 text-signal hover:text-signal/70" title="Remove"><Trash2 size={14} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 text-xs text-dust">No individual tasks assigned yet.</p>}
    </section>
  );
}
