"use client";

import { useEffect, useState } from "react";
import { ClipboardList, FlaskConical, Plus, Trash2 } from "lucide-react";

type ClassItem = { id: string; name: string; school: string; section: string | null; students: number };
type Q = { prompt: string; marks: number; kind: string; options: string; correct: string };

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function AssignForm() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [type, setType] = useState<"assignment" | "test">("assignment");
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [kind, setKind] = useState("test");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api("/api/portal/admin/classes").then((j) => setClasses(j.classes)).catch(() => {}); }, []);

  const addQ = () => setQuestions((s) => [...s, { prompt: "", marks: 1, kind: "mcq", options: "", correct: "" }]);
  const setQ = (i: number, patch: Partial<Q>) => setQuestions((s) => s.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const delQ = (i: number) => setQuestions((s) => s.filter((_, j) => j !== i));

  async function submit() {
    setBusy(true); setMsg("");
    try {
      const payload: Record<string, unknown> = { type, class_id: classId, title, notify };
      if (type === "assignment") {
        payload.instructions = instructions;
        payload.due_at = dueAt || undefined;
        payload.max_marks = maxMarks ? Number(maxMarks) : undefined;
      } else {
        payload.kind = kind;
        payload.starts_at = startsAt || undefined;
        payload.duration_minutes = duration ? Number(duration) : undefined;
        payload.total_marks = totalMarks ? Number(totalMarks) : undefined;
        payload.questions = questions.filter((q) => q.prompt.trim()).map((q) => ({
          prompt: q.prompt, marks: Number(q.marks) || 1, kind: q.kind,
          options: q.options ? q.options.split("|").map((o) => o.trim()).filter(Boolean) : undefined,
          correct: q.correct || undefined,
        }));
      }
      const j = await api("/api/portal/admin/assign", { method: "POST", body: JSON.stringify(payload) });
      setMsg(`Posted ${j.type} to ${j.students} student${j.students === 1 ? "" : "s"}${j.questions ? ` · ${j.questions} questions` : ""}.`);
      setTitle(""); setInstructions(""); setQuestions([]);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const input = "w-full rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardList size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">Post assignment / test</h1>
      </div>

      <div className="flex gap-2">
        {(["assignment", "test"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={"inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm " + (type === t ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
            {t === "assignment" ? <ClipboardList size={14} /> : <FlaskConical size={14} />} {t === "assignment" ? "Assignment" : "Test"}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={input}>
            <option value="">Choose a class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.school} — {c.name}{c.section ? ` (${c.section})` : ""} · {c.students} students</option>)}
          </select>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={input} />

        {type === "assignment" ? (
          <>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Instructions (optional)" className={input + " resize-none"} />
            <div className="flex flex-wrap gap-2">
              <div><label className="mb-1 block text-[11px] text-dust">Due</label><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={input} /></div>
              <div><label className="mb-1 block text-[11px] text-dust">Max marks</label><input type="number" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} className={input} /></div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[8rem]"><label className="mb-1 block text-[11px] text-dust">Kind</label>
                <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
                  {["quiz", "test", "mock_exam", "practical"].map((k) => <option key={k} value={k}>{k}</option>)}
                </select></div>
              <div><label className="mb-1 block text-[11px] text-dust">Starts</label><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={input} /></div>
              <div className="w-24"><label className="mb-1 block text-[11px] text-dust">Minutes</label><input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className={input} /></div>
              <div className="w-24"><label className="mb-1 block text-[11px] text-dust">Total marks</label><input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} className={input} /></div>
            </div>

            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-white/10 bg-abyss/40 p-3">
                  <div className="flex items-start gap-2">
                    <textarea value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} rows={2} placeholder={`Question ${i + 1} prompt`} className={input + " resize-none"} />
                    <button onClick={() => delQ(i)} className="mt-1 text-signal hover:text-signal/70"><Trash2 size={15} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value })} className={input + " w-32"}>
                      {["mcq", "structured", "numerical"].map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <input type="number" value={q.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} placeholder="Marks" className={input + " w-24"} />
                    {q.kind === "mcq" ? <input value={q.options} onChange={(e) => setQ(i, { options: e.target.value })} placeholder="Options A|B|C|D" className={input + " flex-1"} /> : null}
                    <input value={q.correct} onChange={(e) => setQ(i, { correct: e.target.value })} placeholder="Correct answer (optional)" className={input + " flex-1"} />
                  </div>
                </div>
              ))}
              <button onClick={addQ} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan"><Plus size={13} /> Add question</button>
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-fog"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify students in-portal</label>
        {msg ? <p className="rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-ice">{msg}</p> : null}
        <button onClick={submit} disabled={busy || !classId || !title.trim()} className="btn-ghost !px-4 !py-2 text-sm">{busy ? "Posting…" : `Post ${type}`}</button>
      </div>
    </div>
  );
}
