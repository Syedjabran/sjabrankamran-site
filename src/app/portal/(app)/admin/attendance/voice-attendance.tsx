"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Check, Save, CalendarDays, Users, CircleCheck, CircleX, Clock3, RotateCcw, Wifi, Plane, ShieldCheck, Pencil } from "lucide-react";
import { ATTENDANCE_NOTE_MAX, allowsReason, requiresReason } from "@/lib/edu/attendance";

type ClassItem = { id: string; name: string; school: string; section: string | null; students: number };
type RosterRow = { studentId: string; name: string; firstName: string };
type Status = "present" | "absent" | "late" | "excused" | "online" | "leave" | "exempt" | "";

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  present: { label: "Present", cls: "border-emerald2/50 text-emerald2 bg-emerald2/10", icon: <CircleCheck size={13} /> },
  late: { label: "Late", cls: "border-signal/50 text-signal bg-signal/10", icon: <Clock3 size={13} /> },
  online: { label: "Online", cls: "border-cyan/50 text-cyan bg-cyan/10", icon: <Wifi size={13} /> },
  absent: { label: "Absent", cls: "border-magenta/50 text-magenta bg-magenta/10", icon: <CircleX size={13} /> },
  excused: { label: "Excused", cls: "border-white/20 text-dust bg-white/[0.04]", icon: <Check size={13} /> },
  leave: { label: "Leave", cls: "border-ultraviolet/50 text-ultraviolet bg-ultraviolet/10", icon: <Plane size={13} /> },
  exempt: { label: "Exempt", cls: "border-lime2/50 text-lime2 bg-lime2/10", icon: <ShieldCheck size={13} /> },
};
const CYCLE: Status[] = ["present", "late", "online", "absent", "excused", "leave", "exempt", ""];
/** Quick-tap buttons on every student row (excused stays on the tap-to-cycle). */
const QUICK: Status[] = ["present", "late", "online", "absent", "leave", "exempt"];

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
  if (/\b(online|remote|zoom|virtual)\b/.test(t)) return "online";
  // "exempt" before "excused": an exemption is the stricter, reason-bearing mark.
  if (/\b(exempt|exemption|exempted)\b/.test(t)) return "exempt";
  if (/\b(leave|on leave)\b/.test(t)) return "leave";
  if (/\b(excused|sick)\b/.test(t)) return "excused";
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
  // Official reasons (edu_attendance.note). `openReason` is the student whose
  // comment box is currently open — it opens on Exempt and collapses to a chip
  // once a reason is recorded.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [reasonError, setReasonError] = useState("");
  const reasonInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [supported, setSupported] = useState(true);
  const [voiceError, setVoiceError] = useState("");
  const [startingVoice, setStartingVoice] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const voiceAttemptRef = useRef(0);

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
      const n: Record<string, string> = {};
      for (const r of j.roster as RosterRow[]) {
        m[r.studentId] = (j.marks?.[r.studentId] as Status) || "";
        const note = (j.notes?.[r.studentId] as string) || "";
        if (note) n[r.studentId] = note;
      }
      setMarks(m); setNotes(n); setOpenReason(null); setDraft(""); setReasonError("");
    } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
  }, [classId, date]);

  /** Drop a recorded reason as soon as the status can no longer carry one. */
  const dropReasonIfUnusable = useCallback((studentId: string, status: Status) => {
    if (allowsReason(status)) return;
    setNotes((n) => { if (!(studentId in n)) return n; const next = { ...n }; delete next[studentId]; return next; });
    setOpenReason((cur) => (cur === studentId ? null : cur));
  }, []);

  /** Open the inline comment box for a student, pre-filled with any reason. */
  const openReasonFor = useCallback((studentId: string) => {
    setDraft(notes[studentId] || "");
    setReasonError("");
    setOpenReason(studentId);
  }, [notes]);

  const setStatus = useCallback((studentId: string, status: Status) => {
    setMarks((m) => ({ ...m, [studentId]: status }));
    dropReasonIfUnusable(studentId, status);
    // JB's rule: the comment box opens the moment Exempt is clicked.
    if (requiresReason(status)) openReasonFor(studentId);
  }, [dropReasonIfUnusable, openReasonFor]);

  const cycle = useCallback((studentId: string) => {
    const cur = marks[studentId] || "";
    setStatus(studentId, CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]);
  }, [marks, setStatus]);

  /** Record the typed reason; it then collapses back to a chip. */
  const commitReason = useCallback((studentId: string) => {
    const value = draft.trim().slice(0, ATTENDANCE_NOTE_MAX);
    if (!value && requiresReason(marks[studentId] || "")) {
      setReasonError("An official reason is required before an exemption can be saved.");
      return;
    }
    setNotes((n) => {
      const next = { ...n };
      if (value) next[studentId] = value; else delete next[studentId];
      return next;
    });
    setReasonError("");
    setOpenReason(null);
    setDraft("");
  }, [draft, marks]);

  // Focus the comment box as soon as it appears (keyboard users included).
  useEffect(() => { if (openReason) reasonInputRef.current?.focus(); }, [openReason]);

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

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopVoice = useCallback(() => {
    voiceAttemptRef.current += 1; // cancel an in-flight permission/start attempt
    listeningRef.current = false;
    clearRestartTimer();
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.stop(); } catch { try { rec.abort?.(); } catch { /* already stopped */ } }
    }
    setStartingVoice(false);
    setListening(false);
    setHeard("");
  }, [clearRestartTimer]);

  function voiceErrorMessage(code: string) {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        return "Microphone access was blocked. Allow microphone access for sjabrankamran.com in your browser's site settings, then try again.";
      case "audio-capture":
        return "No working microphone was found. Connect or enable a microphone, then try again.";
      case "no-speech":
        return "No speech was detected. Speak clearly near the microphone; voice marking will keep listening.";
      case "network":
        return "Voice recognition could not reach the speech service. Check your internet connection and try again.";
      case "aborted":
        return "Voice recognition stopped before it could hear a command. Tap Start voice to resume.";
      case "language-not-supported":
        return "English voice recognition is not supported by this browser. Use Chrome or Edge, or mark attendance by tapping.";
      default:
        return "Voice recognition could not start. You can still mark every student by tapping Present, Late or Absent below.";
    }
  }

  async function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (listeningRef.current || startingVoice) { stopVoice(); return; }
    setVoiceError("");
    setHeard("");
    if (!Ctor) {
      setSupported(false);
      setVoiceError("Voice marking is not supported in this browser. Open the portal in current Chrome or Edge, or use the tap controls below.");
      return;
    }
    if (!window.isSecureContext) {
      setVoiceError("Microphone access requires a secure HTTPS connection. Open https://sjabrankamran.com and try again; tap marking remains available below.");
      return;
    }
    if (!roster.length) {
      setVoiceError("Load a class register before starting voice attendance.");
      return;
    }

    const attempt = ++voiceAttemptRef.current;
    setStartingVoice(true);
    // Ask for microphone permission from this direct button click. This gives
    // browsers a reliable user gesture and lets us report a useful error before
    // the less-descriptive Web Speech API failure fires. Release the probe
    // stream immediately; SpeechRecognition opens its own capture stream.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        if (voiceAttemptRef.current !== attempt) return;
      } catch (error) {
        if (voiceAttemptRef.current !== attempt) return;
        const name = error instanceof DOMException ? error.name : "";
        setStartingVoice(false);
        setListening(false);
        listeningRef.current = false;
        setVoiceError(
          name === "NotAllowedError" || name === "SecurityError"
            ? voiceErrorMessage("not-allowed")
            : name === "NotFoundError" || name === "NotReadableError"
              ? voiceErrorMessage("audio-capture")
              : "The microphone could not be opened. Check browser/site microphone settings, or use the tap controls below."
        );
        return;
      }
    }

    if (voiceAttemptRef.current !== attempt) return;

    const rec = new Ctor();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    rec.onstart = () => {
      if (recRef.current !== rec || !listeningRef.current) return;
      setStartingVoice(false);
      setListening(true);
      setVoiceError("");
    };
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
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const code = ev.error || "unknown";
      setVoiceError(voiceErrorMessage(code));
      // `no-speech` is recoverable: onend will restart while the user still
      // wants to listen. All other errors stop the restart loop.
      if (code !== "no-speech") {
        listeningRef.current = false;
        clearRestartTimer();
        setStartingVoice(false);
        setListening(false);
      }
    };
    rec.onend = () => {
      if (recRef.current !== rec || !listeningRef.current) {
        setStartingVoice(false);
        setListening(false);
        return;
      }
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        if (recRef.current !== rec || !listeningRef.current) return;
        try { rec.start(); }
        catch {
          listeningRef.current = false;
          setStartingVoice(false);
          setListening(false);
          setVoiceError("Voice recognition could not restart. Tap Start voice to try again, or use the tap controls below.");
        }
      }, 250);
    };
    recRef.current = rec;
    listeningRef.current = true;
    try { rec.start(); }
    catch (error) {
      recRef.current = null;
      listeningRef.current = false;
      setStartingVoice(false);
      setListening(false);
      setVoiceError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? voiceErrorMessage("not-allowed")
          : "Voice recognition could not start. Reload once and try again, or use the tap controls below."
      );
    }
  }
  useEffect(() => () => {
    voiceAttemptRef.current += 1;
    listeningRef.current = false;
    clearRestartTimer();
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onstart = null; rec.onresult = null; rec.onerror = null; rec.onend = null;
      try { rec.stop(); } catch { try { rec.abort?.(); } catch { /* */ } }
    }
  }, [clearRestartTimer]);

  /** Exemptions without a recorded reason block the whole register. */
  const missingReasons = useMemo(
    () => roster.filter((r) => requiresReason(marks[r.studentId] || "") && !(notes[r.studentId] || "").trim()),
    [roster, marks, notes],
  );

  async function save() {
    if (!lessonId) return;
    if (missingReasons.length) {
      setMsg(`${missingReasons.length} exempted student${missingReasons.length === 1 ? "" : "s"} still need${missingReasons.length === 1 ? "s" : ""} an official reason — starting with ${missingReasons[0].name}.`);
      openReasonFor(missingReasons[0].studentId);
      return;
    }
    setSaving(true); setMsg("");
    try {
      const payload = {
        lessonId,
        marks: roster.map((r) => {
          const status = marks[r.studentId] || "absent";
          return { studentId: r.studentId, status, note: allowsReason(status) ? notes[r.studentId] || "" : "" };
        }),
      };
      const j = await api("/api/portal/admin/attendance", { method: "POST", body: JSON.stringify(payload) });
      setMsg(j.warning ? `Saved ${j.saved} students — ${j.warning}` : `Saved attendance for ${j.saved} students.`);
    } catch (e) { setMsg((e as Error).message); } finally { setSaving(false); }
  }

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, online: 0, absent: 0, excused: 0, leave: 0, exempt: 0, unset: 0 };
    for (const r of roster) { const s = marks[r.studentId] || ""; if (s) c[s as keyof typeof c]++; else c.unset++; }
    return c;
  }, [roster, marks]);

  function markAll(status: Status) {
    setMarks(() => Object.fromEntries(roster.map((r) => [r.studentId, status])));
    // Bulk marks never carry reasons, so no stale exemption reason can survive.
    if (!allowsReason(status)) { setNotes({}); setOpenReason(null); setDraft(""); setReasonError(""); }
  }

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
            <button onClick={toggleMic} title={supported ? "Toggle voice marking" : "Check voice support and show setup help"}
              className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm " + (listening ? "border-signal/60 bg-signal/15 text-signal" : "border-cyan/40 text-cyan hover:bg-cyan/10")}>
              {listening ? <MicOff size={15} /> : <Mic size={15} />} {listening ? "Stop voice" : startingVoice ? "Opening microphone…" : "Start voice"}
            </button>
            {listening ? <span className="inline-flex items-center gap-1.5 text-xs text-dust"><span className="h-2 w-2 animate-pulse rounded-full bg-signal" /> listening… <span className="italic text-fog">{heard}</span></span> : null}
            <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
              <button onClick={() => markAll("present")} className="rounded-full border border-emerald2/40 px-2.5 py-1 text-emerald2 hover:bg-emerald2/10">All present</button>
              <button onClick={() => markAll("absent")} className="rounded-full border border-magenta/40 px-2.5 py-1 text-magenta hover:bg-magenta/10">All absent</button>
              <button onClick={() => markAll("")} className="rounded-full border border-white/15 px-2.5 py-1 text-dust hover:text-ice"><RotateCcw size={11} className="inline" /> Reset</button>
            </div>
          </div>

          {voiceError ? (
            <div role="alert" className="rounded-xl border border-signal/35 bg-signal/[0.06] px-4 py-3 text-xs leading-relaxed text-fog">
              <p className="font-semibold text-signal">Voice attendance needs attention</p>
              <p className="mt-1">{voiceError}</p>
              <p className="mt-1 text-dust">Manual fallback: tap a student name to cycle status, or use the green/amber/pink status buttons. Saving works exactly the same.</p>
            </div>
          ) : !listening ? (
            <p className="text-[11px] leading-relaxed text-dust">
              Voice works best in current Chrome or Edge over HTTPS. Your browser may ask for microphone permission. If voice is unavailable, use the tap controls below—no attendance functionality is lost.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 text-xs text-dust">
            <span className="text-emerald2">{counts.present} present</span> ·
            <span className="text-signal">{counts.late} late</span> ·
            <span className="text-cyan">{counts.online} online</span> ·
            <span className="text-magenta">{counts.absent} absent</span> ·
            <span className="text-dust">{counts.excused} excused</span> ·
            <span className="text-ultraviolet">{counts.leave} leave</span> ·
            <span className="text-lime2">{counts.exempt} exempt</span> ·
            <span>{counts.unset} unmarked</span>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {roster.map((r) => {
              const s = marks[r.studentId] || "";
              const meta = s ? STATUS_META[s] : null;
              const reason = notes[r.studentId] || "";
              const editing = openReason === r.studentId;
              const needsReason = requiresReason(s) && !reason;
              return (
                <li key={r.studentId} className="rounded-xl border border-white/10 bg-space/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => cycle(r.studentId)} className="min-w-0 flex-1 truncate text-left text-sm text-fog hover:text-ice" title={meta ? `${meta.label} — tap to cycle status` : "Tap to cycle status"}>{r.name}</button>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {QUICK.map((st) => (
                        <button key={st} onClick={() => setStatus(r.studentId, st as Status)} title={`${STATUS_META[st as string].label} — ${r.name}`} aria-label={`${STATUS_META[st as string].label} — ${r.name}`} aria-pressed={s === st}
                          className={"grid h-7 w-7 place-items-center rounded-lg border " + (s === st ? STATUS_META[st as string].cls : "border-white/10 text-dust hover:text-ice")}>
                          {STATUS_META[st as string].icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment box: opens on Exempt, collapses to a chip once the
                      official reason is recorded, reopens when the chip is tapped. */}
                  {editing ? (
                    <div className="mt-2 rounded-lg border border-lime2/30 bg-lime2/[0.04] p-2">
                      <label htmlFor={`reason-${r.studentId}`} className="mb-1 block text-[11px] uppercase tracking-widest text-dust">
                        {requiresReason(s) ? "Official reason for exemption" : "Reason for leave (optional)"} — {r.name}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input id={`reason-${r.studentId}`} ref={reasonInputRef} value={draft} maxLength={ATTENDANCE_NOTE_MAX}
                          onChange={(e) => { setDraft(e.target.value); if (reasonError) setReasonError(""); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitReason(r.studentId); } if (e.key === "Escape" && !requiresReason(s)) { setOpenReason(null); setDraft(""); } }}
                          placeholder="e.g. School sports trip — approved by Head"
                          className="min-w-[10rem] flex-1 rounded-lg border border-white/10 bg-abyss/60 px-2.5 py-1.5 text-xs text-ice placeholder:text-dust focus:border-lime2 focus:outline-none" />
                        <button onClick={() => commitReason(r.studentId)} className="rounded-lg border border-lime2/40 px-3 py-1.5 text-xs text-lime2 hover:bg-lime2/10">Save reason</button>
                      </div>
                      {reasonError ? <p role="alert" className="mt-1 text-[11px] text-magenta">{reasonError}</p> : null}
                    </div>
                  ) : reason ? (
                    <button onClick={() => openReasonFor(r.studentId)}
                      className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-lime2/30 bg-lime2/[0.06] px-2 py-1 text-left text-[11px] text-lime2 hover:bg-lime2/10"
                      aria-label={`Edit recorded reason for ${r.name}: ${reason}`}>
                      <span className="truncate">Reason: {reason}</span> <Pencil size={11} className="shrink-0" />
                    </button>
                  ) : needsReason ? (
                    <button onClick={() => openReasonFor(r.studentId)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-magenta/40 bg-magenta/[0.06] px-2 py-1 text-[11px] text-magenta hover:bg-magenta/10">
                      Add official reason <Pencil size={11} />
                    </button>
                  ) : allowsReason(s) ? (
                    <button onClick={() => openReasonFor(r.studentId)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-dust hover:text-ice">
                      Add reason (optional) <Pencil size={11} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={save} disabled={saving} className="btn-primary !px-5 !py-2.5 text-sm">{saving ? "Saving…" : <><Save size={15} /> Save attendance</>}</button>
            {missingReasons.length ? <span className="text-xs text-magenta">{missingReasons.length} exemption{missingReasons.length === 1 ? "" : "s"} still need a recorded reason.</span> : null}
            {msg ? <span className="text-xs text-cyan">{msg}</span> : null}
          </div>
          {!supported ? <p className="text-[11px] text-dust">This browser does not expose speech recognition. Open the portal in current Chrome or Edge, or use tap marking. Unmarked students save as absent.</p> : null}
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
  start: () => void; stop: () => void; abort?: () => void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionErrorEvent { error: string; message?: string }
