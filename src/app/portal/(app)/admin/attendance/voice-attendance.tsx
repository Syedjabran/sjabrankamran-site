"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Check, Save, CalendarDays, Users, CircleCheck, CircleX, Clock3, RotateCcw } from "lucide-react";

type ClassItem = { id: string; name: string; school: string; section: string | null; students: number };
type RosterRow = { studentId: string; name: string; firstName: string };
type Status = "present" | "absent" | "late" | "excused" | "";

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  present: { label: "Present", cls: "border-emerald2/50 text-emerald2 bg-emerald2/10", icon: <CircleCheck size={13} /> },
  late: { label: "Late", cls: "border-signal/50 text-signal bg-signal/10", icon: <Clock3 size={13} /> },
  absent: { label: "Absent", cls: "border-magenta/50 text-magenta bg-magenta/10", icon: <CircleX size={13} /> },
  excused: { label: "Excused", cls: "border-white/20 text-dust bg-white/[0.04]", icon: <Check size={13} /> },
};
const CYCLE: Status[] = ["present", "late", "absent", "excused", ""];

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function norm(s: string) { return s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, ""); }
function statusFromWords(text: string): Status | null {
  const t = " " + text.toLowerCase() + " ";
  if (/\b(absent|away|missing|not here|nope|no)\b/.test(t)) return "absent";
  if (/\b(late|tardy)\b/.test(t)) return "late";
  if (/\b(excused|leave|sick)\b/.test(t)) return "excused";
  if (/\b(present|here|yes|yep|in|hazir)\b/.test(t)) return "present";
  return null;
}

export function VoiceAttendance() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [supported, setSupported] = useState(true);
  const recRef = useRef<{ start: () => void; stop: () => void; abort?: () => void } | null>(null);
  const listeningRef = useRef(false);

  useEffect(() => { api("/api/portal/admin/classes").then((j) => setClasses(j.classes ?? [])).catch(() => {}); }, []);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true); setMsg("");
    try {
      const j = await api(`/api/portal/admin/attendance?classId=${classId}&date=${date}`);
      setLessonId(j.lessonId); setRoster(j.roster);
      const m: Record<string, Status> = {};
      for (const r of j.roster as RosterRow[]) m[r.studentId] = (j.marks?.[r.studentId] as Status) || "";
      setMarks(m);
    } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
  }, [classId, date]);

  const setStatus = (studentId: string, status: Status) => setMarks((m) => ({ ...m, [studentId]: status }));
  const cycle = (studentId: string) => setMarks((m) => { const cur = m[studentId] || ""; const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]; return { ...m, [studentId]: next }; });

  // Match a spoken utterance to a roster student + status.
  const applyUtterance = useCallback((text: string) => {
    const status = statusFromWords(text) || "present"; // default to present if a name is heard
    const nt = norm(text);
    let best: RosterRow | null = null; let bestScore = 0;
    for (const r of roster) {
      const fn = norm(r.firstName);
      const full = norm(r.name);
      let score = 0;
      if (fn && nt.includes(fn)) score = fn.length + 2;
      else if (full && nt.includes(full)) score = full.length + 3;
      else if (fn && (fn.startsWith(nt.slice(0, Math.max(3, fn.length))) || nt.includes(fn.slice(0, 4)))) score = 2;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best && bestScore >= 2) { setStatus(best.studentId, status); return best.name + " → " + status; }
    return null;
  }, [roster]);

  function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    if (listening) { listeningRef.current = false; recRef.current?.stop(); setListening(false); return; }
    const rec = new Ctor();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (ev: SpeechResultEvent) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalText += res[0].transcript + " ";
        else setHeard(res[0].transcript);
      }
      if (finalText.trim()) {
        setHeard(finalText.trim());
        // split on commas / "and" so "ahmed present, sara absent" both apply
        finalText.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean).forEach((chunk) => {
          const applied = applyUtterance(chunk);
          if (applied) setMsg(applied);
        });
      }
    };
    rec.onerror = () => { listeningRef.current = false; setListening(false); };
    rec.onend = () => { if (recRef.current === rec && listeningRef.current) { try { rec.start(); } catch { /* */ } } };
    recRef.current = rec as unknown as { start: () => void; stop: () => void };
    try { rec.start(); listeningRef.current = true; setListening(true); } catch { listeningRef.current = false; setListening(false); }
  }
  useEffect(() => () => { listeningRef.current = false; try { recRef.current?.stop(); } catch { /* */ } }, []);

  async function save() {
    if (!lessonId) return;
    setSaving(true); setMsg("");
    try {
      const payload = { lessonId, marks: roster.map((r) => ({ studentId: r.studentId, status: marks[r.studentId] || "absent" })) };
      const j = await api("/api/portal/admin/attendance", { method: "POST", body: JSON.stringify(payload) });
      setMsg(`Saved attendance for ${j.saved} students.`);
    } catch (e) { setMsg((e as Error).message); } finally { setSaving(false); }
  }

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, unset: 0 };
    for (const r of roster) { const s = marks[r.studentId] || ""; if (s) c[s as keyof typeof c]++; else c.unset++; }
    return c;
  }, [roster, marks]);

  function markAll(status: Status) { setMarks(() => Object.fromEntries(roster.map((r) => [r.studentId, status]))); }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><Users size={18} /></span>
        <div>
          <h1 className="text-2xl font-semibold text-ice">Attendance</h1>
          <p className="text-xs text-dust">Mark a class by voice or tap. Say e.g. &ldquo;Ahmed present, Sara absent, Zainab late.&rdquo;</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-space/60 p-4">
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none">
            <option value="">Choose a class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.school} — {c.name}{c.section ? ` (${c.section})` : ""} · {c.students}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust"><CalendarDays size={11} className="inline" /> Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none" />
        </div>
        <button onClick={load} disabled={!classId || loading} className="btn-ghost !px-4 !py-2 text-sm">{loading ? "Loading…" : "Load register"}</button>
      </div>

      {roster.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-space/60 p-3">
            <button onClick={toggleMic} disabled={!supported} title={supported ? "Toggle voice marking" : "Voice not supported in this browser"}
              className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm " + (listening ? "border-signal/60 bg-signal/15 text-signal" : "border-cyan/40 text-cyan hover:bg-cyan/10")}>
              {listening ? <MicOff size={15} /> : <Mic size={15} />} {listening ? "Stop voice" : "Start voice"}
            </button>
            {listening ? <span className="inline-flex items-center gap-1.5 text-xs text-dust"><span className="h-2 w-2 animate-pulse rounded-full bg-signal" /> listening… <span className="italic text-fog">{heard}</span></span> : null}
            <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
              <button onClick={() => markAll("present")} className="rounded-full border border-emerald2/40 px-2.5 py-1 text-emerald2 hover:bg-emerald2/10">All present</button>
              <button onClick={() => markAll("absent")} className="rounded-full border border-magenta/40 px-2.5 py-1 text-magenta hover:bg-magenta/10">All absent</button>
              <button onClick={() => markAll("")} className="rounded-full border border-white/15 px-2.5 py-1 text-dust hover:text-ice"><RotateCcw size={11} className="inline" /> Reset</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-dust">
            <span className="text-emerald2">{counts.present} present</span> ·
            <span className="text-signal">{counts.late} late</span> ·
            <span className="text-magenta">{counts.absent} absent</span> ·
            <span className="text-dust">{counts.excused} excused</span> ·
            <span>{counts.unset} unmarked</span>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {roster.map((r) => {
              const s = marks[r.studentId] || "";
              const meta = s ? STATUS_META[s] : null;
              return (
                <li key={r.studentId} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-space/60 px-3 py-2">
                  <button onClick={() => cycle(r.studentId)} className="min-w-0 flex-1 truncate text-left text-sm text-fog hover:text-ice" title="Tap to cycle status">{r.name}</button>
                  <div className="flex shrink-0 gap-1">
                    {(["present", "late", "absent"] as Status[]).map((st) => (
                      <button key={st} onClick={() => setStatus(r.studentId, st)} title={STATUS_META[st].label}
                        className={"grid h-7 w-7 place-items-center rounded-lg border " + (s === st ? STATUS_META[st].cls : "border-white/10 text-dust hover:text-ice")}>
                        {STATUS_META[st].icon}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={save} disabled={saving} className="btn-primary !px-5 !py-2.5 text-sm">{saving ? "Saving…" : <><Save size={15} /> Save attendance</>}</button>
            {msg ? <span className="text-xs text-cyan">{msg}</span> : null}
          </div>
          {!supported ? <p className="text-[11px] text-dust">Voice marking needs Chrome/Edge/Safari. You can still tap to mark. Unmarked students save as absent.</p> : null}
        </>
      ) : msg ? <p className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-fog">{msg}</p> : null}
    </div>
  );
}

// Minimal Web Speech typings (avoids depending on lib.dom SpeechRecognition).
interface SpeechResultAlt { transcript: string }
interface SpeechResult { 0: SpeechResultAlt; isFinal: boolean }
interface SpeechResultList { length: number; [i: number]: SpeechResult }
interface SpeechResultEvent { resultIndex: number; results: SpeechResultList }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: (e: SpeechResultEvent) => void; onerror: () => void; onend: () => void;
}
