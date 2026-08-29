"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FlaskConical, Plus, Trash2, Paperclip, Timer, Upload, X, FileText } from "lucide-react";
import { questionSeconds, formatDuration, minutesFromSeconds } from "@/lib/portal/timing";

type ClassItem = { id: string; name: string; school: string; section: string | null; students: number };
type Q = { prompt: string; marks: number; kind: string; options: string; correct: string; paper: string; difficulty: string; seconds?: number };
type Posted = { type: "assignment" | "assessment"; id: string; title: string };
type Attachment = { path: string; name: string; size: number; url: string | null };

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function AssignForm() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tab, setTab] = useState<"compose" | "attachments">("compose");
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
  const [posted, setPosted] = useState<Posted | null>(null);

  useEffect(() => { api("/api/portal/admin/classes").then((j) => setClasses(j.classes)).catch(() => {}); }, []);

  const addQ = () => setQuestions((s) => [...s, { prompt: "", marks: 1, kind: "mcq", options: "", correct: "", paper: "P1", difficulty: "MOT" }]);
  const setQ = (i: number, patch: Partial<Q>) => setQuestions((s) => s.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const delQ = (i: number) => setQuestions((s) => s.filter((_, j) => j !== i));

  const perQ = useMemo(() => questions.map((q) => q.seconds && q.seconds > 0 ? q.seconds : questionSeconds({ paper: q.paper, difficulty: q.difficulty, marks: q.marks, kind: q.kind })), [questions]);
  const totalSecs = perQ.reduce((s, x) => s + x, 0);

  async function submit() {
    setBusy(true); setMsg("");
    try {
      const payload: Record<string, unknown> = { type: type === "test" ? "test" : "assignment", class_id: classId, title, notify };
      if (type === "assignment") {
        payload.instructions = instructions;
        payload.due_at = dueAt || undefined;
        payload.max_marks = maxMarks ? Number(maxMarks) : undefined;
      } else {
        payload.kind = kind;
        payload.starts_at = startsAt || undefined;
        payload.duration_minutes = duration ? Number(duration) : undefined;
        payload.total_marks = totalMarks ? Number(totalMarks) : undefined;
        payload.questions = questions.filter((q) => q.prompt.trim()).map((q, i) => ({
          prompt: q.prompt, marks: Number(q.marks) || 1, kind: q.kind, paper: q.paper, difficulty: q.difficulty, seconds: perQ[i],
          options: q.options ? q.options.split("|").map((o) => o.trim()).filter(Boolean) : undefined,
          correct: q.correct || undefined,
        }));
      }
      const j = await api("/api/portal/admin/assign", { method: "POST", body: JSON.stringify(payload) });
      const dur = j.durationMinutes ? ` · timed ${j.durationMinutes} min` : "";
      setMsg(`Posted ${j.type} to ${j.students} student${j.students === 1 ? "" : "s"}${j.questions ? ` · ${j.questions} questions` : ""}${dur}.`);
      setPosted({ type: j.type === "test" ? "assessment" : "assignment", id: j.id, title });
      setTab("attachments");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const input = "w-full rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardList size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">Post assignment / test</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {(["compose", "attachments"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} disabled={t === "attachments" && !posted}
            className={"inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm " + (tab === t ? "border-cyan text-cyan" : "border-transparent text-dust hover:text-ice disabled:opacity-40")}>
            {t === "compose" ? <ClipboardList size={14} /> : <Paperclip size={14} />} {t === "compose" ? "Compose" : "Attachments"}
          </button>
        ))}
      </div>

      {tab === "attachments" ? (
        posted ? <Attachments posted={posted} /> : <p className="text-sm text-dust">Post an assignment or test first, then add files here.</p>
      ) : (
      <>
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
              <div className="w-28"><label className="mb-1 block text-[11px] text-dust">Duration (min)</label><input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={totalSecs ? String(minutesFromSeconds(totalSecs)) : "auto"} className={input} /></div>
              <div className="w-24"><label className="mb-1 block text-[11px] text-dust">Total marks</label><input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} className={input} /></div>
            </div>

            {questions.length ? (
              <div className="flex items-center justify-between rounded-lg border border-cyan/20 bg-cyan/[0.04] px-3 py-2 text-xs text-cyan">
                <span className="inline-flex items-center gap-1.5"><Timer size={13} /> Auto-timed by paper &amp; difficulty</span>
                <span className="font-mono">{questions.length} Q · {formatDuration(totalSecs)} total{duration ? "" : ` → ${minutesFromSeconds(totalSecs)} min`}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-white/10 bg-abyss/40 p-3">
                  <div className="flex items-start gap-2">
                    <textarea value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} rows={2} placeholder={`Question ${i + 1} prompt`} className={input + " resize-none"} />
                    <button onClick={() => delQ(i)} className="mt-1 text-signal hover:text-signal/70"><Trash2 size={15} /></button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div><label className="block text-[10px] text-dust">Type</label>
                      <select value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value })} className={input + " w-28"}>
                        {["mcq", "structured", "numerical"].map((k) => <option key={k} value={k}>{k}</option>)}
                      </select></div>
                    <div><label className="block text-[10px] text-dust">Paper</label>
                      <select value={q.paper} onChange={(e) => setQ(i, { paper: e.target.value })} className={input + " w-20"}>
                        {["P1", "P2", "P3", "P4", "P5"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select></div>
                    <div><label className="block text-[10px] text-dust">Difficulty</label>
                      <select value={q.difficulty} onChange={(e) => setQ(i, { difficulty: e.target.value })} className={input + " w-24"}>
                        <option value="LOT">LOT</option><option value="MOT">MOT</option><option value="HOT">HOT</option>
                      </select></div>
                    <div><label className="block text-[10px] text-dust">Marks</label>
                      <input type="number" value={q.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} className={input + " w-20"} /></div>
                    <div className="pb-2"><span className="inline-flex items-center gap-1 rounded-full border border-cyan/30 px-2.5 py-1 font-mono text-[11px] text-cyan"><Timer size={12} /> {formatDuration(perQ[i])}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
        {posted ? <p className="text-[11px] text-dust">Posted. Switch to the <b className="text-cyan">Attachments</b> tab to add files, or start a new one.</p> : null}
      </div>
      </>
      )}
    </div>
  );
}

function Attachments({ posted }: { posted: Posted }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try { const j = await api(`/api/portal/admin/attachments?type=${posted.type}&id=${posted.id}`); setItems(j.attachments); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [posted.id]);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); setErr("");
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("type", posted.type); fd.append("id", posted.id); fd.append("file", f);
        const r = await fetch("/api/portal/admin/attachments", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Upload failed (${f.name})`);
      }
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(path: string) {
    setBusy(true);
    try { await api(`/api/portal/admin/attachments?type=${posted.type}&id=${posted.id}&path=${encodeURIComponent(path)}`, { method: "DELETE" }); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-space/60 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><Paperclip size={15} className="text-cyan" /> Attachments — {posted.title}</h2>
        <p className="mt-1 text-xs text-dust">Files are stored privately (edu-resources bucket) and shown to students on this {posted.type === "assessment" ? "test" : "assignment"}. Max 15 MB each.</p>
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan/30 bg-abyss/40 px-4 py-6 text-sm text-fog hover:border-cyan/60 hover:text-cyan">
        <Upload size={16} /> {busy ? "Uploading…" : "Click to upload files (PDF, Office, images, zip)"}
        <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>

      {err ? <p className="text-xs text-signal">{err}</p> : null}

      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li key={a.path} className="flex items-center justify-between rounded-lg border border-white/10 bg-abyss/40 px-3 py-2 text-xs">
              <a href={a.url || "#"} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 text-fog hover:text-cyan">
                <FileText size={14} className="shrink-0" /><span className="truncate">{a.name}</span>
                <span className="shrink-0 text-dust">({Math.round(a.size / 1024)} KB)</span>
              </a>
              <button onClick={() => remove(a.path)} disabled={busy} className="text-signal hover:text-signal/70"><X size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-dust">No files attached yet.</p>}
    </div>
  );
}
