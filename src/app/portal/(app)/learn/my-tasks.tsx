"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Target, Trophy, Link2, CheckCircle2, Clock, CircleDashed, Loader2, ArrowRight } from "lucide-react";

type Task = {
  id: string; title: string; details: string; kind: "task" | "challenge";
  dueAt: string | null; points: number | null; resourceUrl: string | null;
  status: "assigned" | "in_progress" | "done"; createdByName: string;
  createdAt: number; completedAt: number | null; studentNote: string | null;
  mandatory?: boolean; topic?: string | null; activityType?: string; expectedMinutes?: number | null;
  sourceId?: string | null;
};

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const STATUS_META: Record<Task["status"], { label: string; cls: string; icon: React.ReactNode }> = {
  assigned: { label: "To do", cls: "border-white/20 text-dust", icon: <CircleDashed size={11} /> },
  in_progress: { label: "In progress", cls: "border-amber-300/40 text-amber-300", icon: <Clock size={11} /> },
  done: { label: "Done", cls: "border-emerald2/40 text-emerald2", icon: <CheckCircle2 size={11} /> },
};

export function MyTasks() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState("");

  const load = async () => { try { const j = await api("/api/portal/tasks"); setTasks(j.tasks); } catch { setTasks([]); } };
  useEffect(() => { load(); }, []);

  async function openTask(t: Task) {
    setBusy(t.id);
    try {
      if (t.status === "assigned") {
        await api("/api/portal/tasks", { method: "POST", body: JSON.stringify({ task_id: t.id, status: "in_progress" }) });
      }
      router.push(`/portal/tasks/${encodeURIComponent(t.id)}`);
    } finally {
      setBusy("");
    }
  }

  if (!tasks || tasks.length === 0) return null; // hide entirely when the student has no personal work

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const ordered = [...open, ...done];

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust">
        <Target size={14} className="text-cyan" /> My tasks &amp; challenges
        <span className="ml-1 rounded-full border border-cyan/30 px-2 py-0.5 text-[10px] normal-case tracking-normal text-cyan">{open.length} to do</span>
      </h2>
      <ul className="space-y-2">
        {ordered.map((t) => {
          const sm = STATUS_META[t.status];
          const overdue = t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "done";
          return (
            <li key={t.id} className={"rounded-xl border bg-space/60 p-4 " + (t.kind === "challenge" ? "border-amber-300/25" : "border-white/10")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ice">
                    {t.kind === "challenge" ? <Trophy size={14} className="shrink-0 text-amber-300" /> : <Target size={14} className="shrink-0 text-cyan" />}
                    <Link href={`/portal/tasks/${encodeURIComponent(t.id)}`} className="hover:text-cyan hover:underline">{t.title}</Link>
                    <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] " + sm.cls}>{sm.icon} {sm.label}</span>
                    {t.points ? <span className="rounded-full border border-amber-300/30 px-2 py-0.5 text-[10px] text-amber-300">+{t.points} pts</span> : null}
                    {t.mandatory ? <span className="rounded-full border border-signal/35 px-2 py-0.5 text-[10px] uppercase tracking-wider text-signal">mandatory</span> : null}
                  </p>
                  {t.details ? <p className="mt-1 whitespace-pre-wrap text-xs text-fog">{t.details}</p> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-dust">
                    <span>set by {t.createdByName}</span>
                    {t.dueAt ? <span className={overdue ? "text-signal" : ""}>· due {new Date(t.dueAt).toLocaleString()}</span> : null}
                    {t.resourceUrl ? <a href={t.resourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline"><Link2 size={10} /> open resource</a> : null}
                    {t.expectedMinutes ? <span>· {t.expectedMinutes} min</span> : null}
                  </p>
                </div>
                <button onClick={() => openTask(t)} disabled={busy === t.id}
                  className={"shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs " + (t.status === "done" ? "border-white/10 text-dust hover:text-ice" : "border-cyan/50 text-cyan hover:bg-cyan/10")}>
                  {busy === t.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} {t.status === "done" ? "Review" : "Open task"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
