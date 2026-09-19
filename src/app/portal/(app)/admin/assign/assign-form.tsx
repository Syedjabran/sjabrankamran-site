"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FlaskConical, Plus, Trash2, Paperclip, Timer, Upload, X, FileText, Video, Layers, Sparkles, Loader2, Wand2 } from "lucide-react";
import { questionSeconds, formatDuration, minutesFromSeconds } from "@/lib/portal/timing";
import { IMAGE_PAPERS, IMAGE_BANK } from "@/lib/exam-lab/image-bank";

const EX_TOPICS_AS = ["Physical quantities & units", "Kinematics", "Dynamics", "Forces, density & pressure", "Work, energy & power", "Deformation of solids", "Waves", "Superposition", "Electricity", "D.C. circuits", "Particle physics"];
const EX_TOPICS_A2 = ["Circular motion", "Gravitational fields", "Thermal physics", "Ideal gases", "Oscillations", "Electric fields", "Capacitance", "Magnetic fields", "Alternating currents", "Quantum physics", "Nuclear physics", "Astronomy & cosmology"];
const EX_PAPER_LABEL: Record<string, string> = { P1: "Paper 1", P2: "Paper 2", P4: "Paper 4" };
function exPaperName(code: string) {
  const m = code.match(/9702_([smw])(\d\d)_(\d\d)/);
  const S: Record<string, string> = { s: "May/Jun", w: "Oct/Nov", m: "Feb/Mar" };
  return m ? `${S[m[1]] || m[1]} 20${m[2]} · v${m[3][1]}` : code;
}

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

export function AssignForm({ canTest = false }: { canTest?: boolean }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tab, setTab] = useState<"compose" | "attachments">("compose");
  const [type, setType] = useState<"assignment" | "test" | "examlab">("assignment");
  // Exam Lab allocation state
  const [exMode, setExMode] = useState<"assignment_help" | "assignment_nohelp" | "test">("assignment_help");
  const [exContentType, setExContentType] = useState<"paper" | "drill" | "custom" | "daily">("paper");
  const [pickIds, setPickIds] = useState<Set<string>>(new Set());
  const [pickPaper, setPickPaper] = useState<"P1" | "P2" | "P4">("P1");
  const [pickTopic, setPickTopic] = useState("");
  const [pickYear, setPickYear] = useState("");
  // AI designer
  const [aiBrief, setAiBrief] = useState("");
  const [aiCount, setAiCount] = useState(10);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [aiDraft, setAiDraft] = useState<{ title: string; instructions: string; rationale: string; summary: { count: number; marks: number; topics: string[]; questions: { id: string; ref: string; topic: string | null; level: string; marks: number | null }[] } } | null>(null);

  async function aiDesign() {
    if (!aiBrief.trim()) { setAiMsg("Describe what to set — e.g. “12 HOT-leaning P1 questions on Waves & Superposition for a weak class”."); return; }
    setAiBusy(true); setAiMsg(""); setAiDraft(null);
    try {
      const j = await api("/api/portal/admin/ai-designer", { method: "POST", body: JSON.stringify({ brief: aiBrief, count: aiCount }) });
      setAiDraft(j);
      // Feed the draft straight into the allocation flow.
      setExContentType("custom");
      setPickIds(new Set<string>(j.summary.questions.map((q: { id: string }) => q.id)));
      if (!title.trim()) setTitle(j.title);
      if (!exInstructions.trim()) setExInstructions(j.instructions);
      setAiMsg(`Designed ${j.summary.count} questions · ${j.summary.marks} marks. Review below, adjust if needed, then Allocate.`);
    } catch (e) { setAiMsg((e as Error).message); } finally { setAiBusy(false); }
  }
  const [exPaperCode, setExPaperCode] = useState("");
  const [exDPaper, setExDPaper] = useState<"P1" | "P2" | "P4">("P1");
  const [exTopics, setExTopics] = useState<Set<string>>(new Set());
  const [exLevels, setExLevels] = useState<Set<string>>(new Set(["LOT", "HOT"]));
  const [exCount, setExCount] = useState(10);
  const [exDuration, setExDuration] = useState("");
  const [exDue, setExDue] = useState("");
  const [exStarts, setExStarts] = useState("");
  const [exInstructions, setExInstructions] = useState("");
  const [exTarget, setExTarget] = useState<"class" | "school" | "network" | "individual" | "group">("class");
  const [exClassId, setExClassId] = useState("");
  const [exSchool, setExSchool] = useState("");
  const [exStudentEmail, setExStudentEmail] = useState("");
  const [exGroupClasses, setExGroupClasses] = useState<Set<string>>(new Set());
  const [exGroupName, setExGroupName] = useState("");
  const toggleGroupClass = (id: string) => setExGroupClasses((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
      if (type === "examlab") {
        let class_ids: string[] = []; let student_email: string | undefined; let scope_label = "";
        if (exTarget === "class") { class_ids = exClassId ? [exClassId] : []; scope_label = classes.find((c) => c.id === exClassId)?.name || "Class"; }
        else if (exTarget === "school") { class_ids = classes.filter((c) => c.school === exSchool).map((c) => c.id); scope_label = exSchool; }
        else if (exTarget === "network") { class_ids = classes.map((c) => c.id); scope_label = "Whole network"; }
        else if (exTarget === "group") { class_ids = [...exGroupClasses]; scope_label = exGroupName.trim() || "Group"; }
        else { student_email = exStudentEmail.trim(); scope_label = exStudentEmail.trim(); }
        const content = exContentType === "paper" ? { type: "paper", code: exPaperCode }
          : exContentType === "drill" ? { type: "drill", paperType: exDPaper, topics: [...exTopics], levels: [...exLevels], count: exCount }
          : exContentType === "custom" ? { type: "custom", ids: [...pickIds] }
          : { type: "daily" };
        const j = await api("/api/portal/admin/exam-allocate", { method: "POST", body: JSON.stringify({ target_type: exTarget, class_ids, student_email, scope_label, mode: exMode, content, title, instructions: exInstructions || undefined, duration_min: exDuration ? Number(exDuration) : undefined, due_at: exDue || undefined, starts_at: exStarts || undefined, notify }) });
        // The drill reference is the handle staff quote to find, re-view or
        // re-open this exact paper later (Drill Records).
        setMsg(`Allocated to ${j.students} student${j.students === 1 ? "" : "s"} · ${exMode.replace(/_/g, " ")} · ${scope_label}.${j.drillRef ? ` Ref ${j.drillRef}${j.frozen ? " — same paper for every student." : ""}` : ""}`);
        return;
      }
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
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setType("assignment")} className={"inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm " + (type === "assignment" ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}><ClipboardList size={14} /> Assignment</button>
        <button onClick={() => setType("examlab")} className={"inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm " + (type === "examlab" ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}><Layers size={14} /> Exam Lab</button>
        <button onClick={() => setType("test")} className={"inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm " + (type === "test" ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}><FlaskConical size={14} /> Test (authored)</button>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
        {type !== "examlab" ? (
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={input}>
              <option value="">Choose a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.school} — {c.name}{c.section ? ` (${c.section})` : ""} · {c.students} students</option>)}
            </select>
          </div>
        ) : null}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={input} />

        {type === "examlab" ? (
          <>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Assign to</label>
              <div className="flex flex-wrap gap-2">
                {(["class", "group", "school", "network", "individual"] as const).map((tt) => (
                  <button key={tt} onClick={() => setExTarget(tt)} className={"rounded-full border px-3 py-1.5 text-xs " + (exTarget === tt ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>{tt === "class" ? "A class" : tt === "group" ? "A group" : tt === "school" ? "Whole school" : tt === "network" ? "Whole network" : "Individual"}</button>
                ))}
              </div>
              <div className="mt-2">
                {exTarget === "class" ? (
                  <select value={exClassId} onChange={(e) => setExClassId(e.target.value)} className={input}>
                    <option value="">Choose a class…</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.school} — {c.name}{c.section ? ` (${c.section})` : ""} · {c.students}</option>)}
                  </select>
                ) : exTarget === "school" ? (
                  <select value={exSchool} onChange={(e) => setExSchool(e.target.value)} className={input}>
                    <option value="">Choose a school…</option>
                    {[...new Set(classes.map((c) => c.school))].filter((s) => s && s !== "—").map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : exTarget === "group" ? (
                  <div className="space-y-2">
                    <input value={exGroupName} onChange={(e) => setExGroupName(e.target.value)} placeholder="Group name (e.g. Board revision group)" className={input} />
                    <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-white/10 bg-abyss/40 p-2">
                      {classes.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-fog hover:bg-white/[0.03]">
                          <input type="checkbox" checked={exGroupClasses.has(c.id)} onChange={() => toggleGroupClass(c.id)} className="accent-cyan" />
                          {c.school} — {c.name}{c.section ? ` (${c.section})` : ""} · {c.students}
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-dust">{exGroupClasses.size} class{exGroupClasses.size === 1 ? "" : "es"} selected for this group.</p>
                  </div>
                ) : exTarget === "individual" ? (
                  <input value={exStudentEmail} onChange={(e) => setExStudentEmail(e.target.value)} placeholder="student@email.com" className={input} />
                ) : (
                  <p className="rounded-lg border border-white/10 bg-abyss/40 px-3 py-2 text-xs text-dust">Every active student across all classes.</p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Mode</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "assignment_help", label: "Assignment · help allowed", hint: "relaxed, no cancellation" },
                  { id: "assignment_nohelp", label: "Assignment · no help", hint: "cancels on tab/split/screenshot" },
                  ...(canTest ? [{ id: "test", label: "Proctored test", hint: "camera + AI proctor + lock" }] : []),
                ] as const).map((m) => (
                  <button key={m.id} onClick={() => setExMode(m.id as typeof exMode)} className={"rounded-xl border px-3 py-1.5 text-xs " + (exMode === m.id ? (m.id === "test" ? "border-red-400/60 bg-red-400/10 text-red-200" : m.id === "assignment_nohelp" ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-emerald2/60 bg-emerald2/10 text-emerald2") : "border-white/10 text-dust hover:text-ice")}>{m.label}</button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-dust">{exMode === "test" ? "Strict: student must switch on camera; violations lock the test (super-admin unlock)." : exMode === "assignment_nohelp" ? "Guarded like a mini-exam; mark-scheme reveals are logged." : "Open practice; students may use the mark scheme freely (logged)."}</p>
            </div>

            {/* AI designer */}
            <div className="space-y-2 rounded-xl border border-violet2/25 bg-violet2/[0.05] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ice"><Wand2 size={13} className="text-violet2" /> AI designer <span className="font-normal text-dust">— describe it; the agent picks real CAIE questions for you</span></p>
              <textarea value={aiBrief} onChange={(e) => setAiBrief(e.target.value)} rows={2} placeholder="e.g. Challenging P4 set on Gravitational + Electric fields, mostly HOT, for my A2 class before their mock…" className={input + " resize-none"} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-dust">Questions</label>
                <input type="number" min={1} max={40} value={aiCount} onChange={(e) => setAiCount(Math.max(1, Math.min(40, +e.target.value || 10)))} className={input + " w-20"} />
                <button onClick={aiDesign} disabled={aiBusy} className="btn-primary !px-3.5 !py-1.5 text-xs disabled:opacity-50">{aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Design it</button>
                {aiMsg ? <span className="text-[11px] text-violet2">{aiMsg}</span> : null}
              </div>
              {aiDraft ? (
                <div className="rounded-lg border border-white/10 bg-abyss/40 p-2.5 text-xs text-fog">
                  <p><b className="text-ice">{aiDraft.title}</b> · {aiDraft.summary.count} Q · {aiDraft.summary.marks} marks · {aiDraft.summary.topics.join(", ")}</p>
                  {aiDraft.rationale ? <p className="mt-1 text-dust">{aiDraft.rationale}</p> : null}
                  <p className="mt-1 text-[10px] text-dust">The selection is loaded into “Pick questions” below — fine-tune it there if you like.</p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Content</label>
              <div className="flex flex-wrap gap-2">
                {(["paper", "drill", "custom", "daily"] as const).map((ct) => (
                  <button key={ct} onClick={() => setExContentType(ct)} className={"rounded-full border px-3 py-1.5 text-xs " + (exContentType === ct ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>{ct === "paper" ? "Real past paper" : ct === "drill" ? "Topic drill" : ct === "custom" ? "Pick questions" : "Daily (10 mixed P1)"}</button>
                ))}
              </div>
            </div>

            {exContentType === "paper" ? (
              <select value={exPaperCode} onChange={(e) => setExPaperCode(e.target.value)} className={input}>
                <option value="">Choose a past paper…</option>
                {(["P1", "P2", "P4"] as const).map((pt) => (
                  <optgroup key={pt} label={EX_PAPER_LABEL[pt]}>
                    {IMAGE_PAPERS.filter((p) => p.paperType === pt).map((p) => <option key={p.code} value={p.code}>{EX_PAPER_LABEL[pt]} · {exPaperName(p.code)} · {p.count} Q</option>)}
                  </optgroup>
                ))}
              </select>
            ) : exContentType === "drill" ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-abyss/40 p-3">
                <div className="flex gap-2">
                  {(["P1", "P2", "P4"] as const).map((pt) => <button key={pt} onClick={() => { setExDPaper(pt); setExTopics(new Set()); }} className={"rounded-full border px-3 py-1 text-xs " + (exDPaper === pt ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog")}>{pt}</button>)}
                </div>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
                  {(exDPaper === "P4" ? EX_TOPICS_A2 : EX_TOPICS_AS).map((t) => {
                    const on = exTopics.has(t);
                    return <button key={t} onClick={() => setExTopics((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })} className={"rounded-full border px-2 py-0.5 text-[11px] " + (on ? "border-cyan bg-cyan text-space" : "border-white/15 text-fog")}>{t}</button>;
                  })}
                </div>
                <p className="text-[11px] text-dust">No topic selected = all topics.</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dust">Questions</span>
                  <input type="range" min={1} max={40} value={exCount} onChange={(e) => setExCount(+e.target.value)} className="flex-1 accent-cyan" />
                  <span className="w-8 text-center font-display text-lg text-cyan">{exCount}</span>
                </div>
              </div>
            ) : exContentType === "custom" ? (
              <QuestionPicker pickIds={pickIds} setPickIds={setPickIds} paper={pickPaper} setPaper={setPickPaper} topic={pickTopic} setTopic={setPickTopic} year={pickYear} setYear={setPickYear} />
            ) : (
              <p className="rounded-lg border border-white/10 bg-abyss/40 px-3 py-2 text-xs text-dust">10 mixed Paper-1 questions, 15 minutes.</p>
            )}

            <textarea value={exInstructions} onChange={(e) => setExInstructions(e.target.value)} rows={2} placeholder="Instructions (optional)" className={input + " resize-none"} />
            <div className="flex flex-wrap gap-2">
              <div><label className="mb-1 block text-[11px] text-dust">Opens (schedule)</label><input type="datetime-local" value={exStarts} onChange={(e) => setExStarts(e.target.value)} className={input} /></div>
              <div><label className="mb-1 block text-[11px] text-dust">Due</label><input type="datetime-local" value={exDue} onChange={(e) => setExDue(e.target.value)} className={input} /></div>
              <div className="w-28"><label className="mb-1 block text-[11px] text-dust">Duration (min)</label><input type="number" value={exDuration} onChange={(e) => setExDuration(e.target.value)} placeholder="auto" className={input} /></div>
            </div>
          </>
        ) : type === "assignment" ? (
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
        <button onClick={submit} disabled={busy || !title.trim() || (type === "examlab" ? ((exTarget === "class" ? !exClassId : exTarget === "school" ? !exSchool : exTarget === "individual" ? !exStudentEmail.trim() : false) || (exContentType === "custom" && pickIds.size === 0) || (exContentType === "paper" && !exPaperCode)) : !classId)} className="btn-ghost !px-4 !py-2 text-sm">{busy ? "Working…" : type === "examlab" ? "Allocate" : `Post ${type}`}</button>
        {posted ? <p className="text-[11px] text-dust">Posted. Switch to the <b className="text-cyan">Attachments</b> tab to add files, or start a new one.</p> : null}
      </div>
      </>
      )}
    </div>
  );
}

function QuestionPicker({ pickIds, setPickIds, paper, setPaper, topic, setTopic, year, setYear }: {
  pickIds: Set<string>; setPickIds: (f: (s: Set<string>) => Set<string>) => void;
  paper: "P1" | "P2" | "P4"; setPaper: (p: "P1" | "P2" | "P4") => void;
  topic: string; setTopic: (t: string) => void; year: string; setYear: (y: string) => void;
}) {
  const input = "rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none";
  const yearOf = (code: string) => { const m = code.match(/9702_[smw](\d\d)_/); return m ? "20" + m[1] : ""; };
  const topics = useMemo(() => [...new Set(IMAGE_BANK.filter((q) => q.paperType === paper).map((q) => q.topic).filter(Boolean) as string[])].sort(), [paper]);
  const years = useMemo(() => [...new Set(IMAGE_BANK.filter((q) => q.paperType === paper).map((q) => yearOf(q.code)))].filter(Boolean).sort().reverse(), [paper]);
  const pool = useMemo(() => IMAGE_BANK.filter((q) => q.paperType === paper && (!topic || q.topic === topic) && (!year || yearOf(q.code) === year)).slice(0, 400), [paper, topic, year]);
  const marks = [...pickIds].reduce((s, id) => { const q = IMAGE_BANK.find((x) => x.id === id); return s + (q?.marks || 1); }, 0);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-abyss/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["P1", "P2", "P4"] as const).map((pt) => <button key={pt} onClick={() => { setPaper(pt); setTopic(""); setYear(""); }} className={"rounded-full border px-3 py-1 text-xs " + (paper === pt ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog")}>{pt}</button>)}
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={input + " text-xs"}>
          <option value="">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className={input + " text-xs"}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="ml-auto rounded-full border border-cyan/30 px-2.5 py-1 font-mono text-[11px] text-cyan">{pickIds.size} picked · {marks} marks</span>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto pr-1">
        {pool.map((q) => {
          const on = pickIds.has(q.id);
          return (
            <label key={q.id} className={"flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs " + (on ? "border-cyan/50 bg-cyan/[0.07] text-ice" : "border-white/[0.07] text-fog hover:border-cyan/30")}>
              <input type="checkbox" checked={on} onChange={() => setPickIds((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else if (n.size < 60) n.add(q.id); return n; })} className="h-3.5 w-3.5 accent-cyan" />
              <span className="font-mono text-[10px] text-dust">{q.ref}</span>
              <span className="truncate">{q.topic || "—"}</span>
              <span className={"rounded-full border px-1.5 py-0.5 font-mono text-[9px] " + (q.level === "LOT" ? "border-emerald2/40 text-emerald2" : "border-magenta/40 text-magenta")}>{q.level}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-dust">[{q.marks ?? 1}]</span>
            </label>
          );
        })}
        {!pool.length ? <p className="px-2 py-3 text-xs text-dust">No questions match those filters.</p> : null}
      </div>
      {pickIds.size ? <button onClick={() => setPickIds(() => new Set())} className="text-[11px] text-dust underline-offset-2 hover:text-ice hover:underline">Clear selection</button> : null}
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
