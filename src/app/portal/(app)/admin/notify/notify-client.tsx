"use client";

import { useEffect, useState } from "react";
import { Megaphone, Send, CheckCircle2, AlertTriangle } from "lucide-react";

type ClassRow = { id: string; name: string; school: string; section: string | null; students: number };

const TARGETS = [
  { id: "all", label: "Everyone (all portal users)" },
  { id: "students", label: "All students" },
  { id: "school", label: "One school" },
  { id: "class", label: "One class" },
  { id: "individual", label: "One person (by email)" },
];

export function NotifyComposer() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [target, setTarget] = useState("all");
  const [school, setSchool] = useState("");
  const [classId, setClassId] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/admin/classes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) { setClasses(j.classes || []); setSchools(j.schools || []); } })
      .catch(() => {});
  }, []);

  async function send() {
    setErr(null); setDone(null);
    if (!title.trim()) { setErr("Give the announcement a title."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/portal/admin/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, school, class_id: classId, email, title, message, link }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not send the announcement.");
      setDone(`Sent to ${j.recipients} ${j.recipients === 1 ? "person" : "people"}.`);
      setTitle(""); setMessage(""); setLink("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-white/10 bg-space/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan/40 focus:outline-none";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ice">
          <Megaphone size={22} className="text-cyan" /> Send announcement
        </h1>
        <p className="mt-1 text-sm text-fog">
          Delivers straight to the bell and the Notifications page — everyone, a school, a class, or one person.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-space/60 p-6">
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">Audience</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        {target === "school" ? (
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">School</label>
            <select value={school} onChange={(e) => setSchool(e.target.value)} className={field}>
              <option value="">— pick a school —</option>
              {schools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ) : null}
        {target === "class" ? (
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
              <option value="">— pick a class —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.school} · {c.name}{c.section ? ` (${c.section})` : ""} — {c.students} students</option>
              ))}
            </select>
          </div>
        ) : null}
        {target === "individual" ? (
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">Recipient email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" className={field} />
          </div>
        ) : null}
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Mock exam next Monday" className={field} />
        </div>
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">Message (optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} placeholder="Details students should read…" className={field} />
        </div>
        <div>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-dust">Link (optional)</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/portal/exam-lab or https://…" className={field} />
        </div>

        {err ? <p className="flex items-center gap-2 text-sm text-signal"><AlertTriangle size={15} /> {err}</p> : null}
        {done ? <p className="flex items-center gap-2 text-sm text-emerald2"><CheckCircle2 size={15} /> {done}</p> : null}

        <button onClick={send} disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan/40 bg-cyan/10 px-5 py-2.5 text-sm font-semibold text-cyan transition hover:bg-cyan/20 disabled:opacity-50">
          <Send size={15} /> {busy ? "Sending…" : "Send announcement"}
        </button>
      </div>
    </div>
  );
}
