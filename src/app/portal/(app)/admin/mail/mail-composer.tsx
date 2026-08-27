"use client";

import { useState } from "react";
import { Loader2, Send, Users, Mail, FileText, CheckCircle2, Clock, AlertTriangle, Sparkles, GraduationCap } from "lucide-react";

type ClassOpt = { id: string; label: string };
type Template = { id: string; name: string; subject: string; body: string };
type LogEntry = { id: string; ts: number; to: string[]; subject: string; status: string; byName?: string; kind: string; error?: string };

const inputCls = "w-full rounded-xl border border-white/15 bg-void px-3.5 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";
const labelCls = "mb-1 block font-mono text-[11px] uppercase tracking-widest text-fog";

export function MailComposer({ classes, templates, initialLog }: { classes: ClassOpt[]; templates: Template[]; initialLog: LogEntry[] }) {
  const [mode, setMode] = useState<"class" | "emails" | "progress">("class");
  const [prClass, setPrClass] = useState(classes[0]?.id || "");
  const [prAudience, setPrAudience] = useState<"students" | "parents" | "both">("both");
  const [prBusy, setPrBusy] = useState(false);
  const [prMsg, setPrMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [audience, setAudience] = useState<"students" | "parents" | "both">("both");
  const [emails, setEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<LogEntry[]>(initialLog);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (t) { setSubject(t.subject); setBody(t.body); }
  }

  async function runProgress(dryRun: boolean) {
    setPrBusy(true); setPrMsg(null);
    try {
      const r = await fetch("/api/portal/progress-email", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId: prClass, toStudent: prAudience !== "parents", toParents: prAudience !== "students", dryRun }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        const s = j.summary;
        setPrMsg({ ok: true, text: dryRun
          ? `Dry run: ${s.students} student(s), ${s.emailed} would be emailed, ${s.skipped} skipped (no activity).`
          : `Done: ${s.emailed}/${s.students} emailed · ${s.totalSent} sent, ${s.totalQueued} queued, ${s.skipped} skipped.` });
        if (!dryRun) refreshLog();
      } else {
        setPrMsg({ ok: false, text: j.error || "Could not run." });
      }
    } catch {
      setPrMsg({ ok: false, text: "Network error." });
    } finally {
      setPrBusy(false);
    }
  }

  async function refreshLog() {
    try {
      const r = await fetch("/api/portal/mail");
      const j = await r.json();
      if (r.ok) setLog(j.items || []);
    } catch { /* ignore */ }
  }

  async function send() {
    setSending(true); setMsg(null);
    try {
      const payload = mode === "class"
        ? { mode, classId, audience, subject, body }
        : { mode, to: emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean), subject, body };
      const r = await fetch("/api/portal/mail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (r.ok && j.ok) {
        setMsg({ ok: true, text: j.status === "sent" ? `Sent to ${j.recipients} recipient(s).` : `Queued for ${j.recipients} recipient(s) — will send once the Gmail relay is connected.` });
        setSubject(""); setBody("");
        refreshLog();
      } else {
        setMsg({ ok: false, text: j.error || "Could not send." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* composer */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex gap-2">
          <button onClick={() => setMode("class")} className={"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition " + (mode === "class" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}><Users size={13} /> Class broadcast</button>
          <button onClick={() => setMode("emails")} className={"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition " + (mode === "emails" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}><Mail size={13} /> Specific emails</button>
          <button onClick={() => setMode("progress")} className={"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition " + (mode === "progress" ? "border-violet2 bg-violet2 text-space font-semibold" : "border-white/15 text-fog hover:border-violet2")}><Sparkles size={13} /> Progress reports</button>
        </div>

        {mode === "progress" ? (
          <div>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-violet2/25 bg-violet2/[0.05] px-3.5 py-2.5 text-xs text-fog">
              <GraduationCap size={15} className="text-violet2" />
              Maxwell writes a personalised Physics progress email for each student (from their Exam Lab performance, level & attendance) and sends it to the student and/or parents.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Class</label>
                <select className={inputCls} value={prClass} onChange={(e) => setPrClass(e.target.value)}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Send to</label>
                <select className={inputCls} value={prAudience} onChange={(e) => setPrAudience(e.target.value as "students" | "parents" | "both")}>
                  <option value="both">Students &amp; parents</option>
                  <option value="students">Students only</option>
                  <option value="parents">Parents only</option>
                </select>
              </div>
            </div>
            {prMsg && (
              <div className={"mt-3 rounded-xl border px-3.5 py-2 text-xs " + (prMsg.ok ? "border-emerald2/40 bg-emerald2/[0.06] text-emerald2" : "border-signal/40 bg-signal/[0.06] text-signal")}>{prMsg.text}</div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runProgress(true)} disabled={prBusy} className="btn-ghost disabled:opacity-50">{prBusy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Dry run (preview counts)</button>
              <button onClick={() => runProgress(false)} disabled={prBusy} className="btn-primary disabled:opacity-50">{prBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate &amp; send</button>
            </div>
          </div>
        ) : (
        <>

        {mode === "class" ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Class</label>
              <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Recipients</label>
              <select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value as "students" | "parents" | "both")}>
                <option value="both">Students &amp; parents</option>
                <option value="students">Students only</option>
                <option value="parents">Parents only</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <label className={labelCls}>Email addresses (comma / space separated)</label>
            <textarea className={inputCls + " min-h-16"} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="a@email.com, b@email.com" />
          </div>
        )}

        {templates.length > 0 && (
          <div className="mb-4">
            <label className={labelCls}>Start from a template</label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button key={t.id} onClick={() => applyTemplate(t.id)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-fog transition hover:border-cyan"><FileText size={12} /> {t.name}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3"><label className={labelCls}>Subject</label><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        {/* body + send below */}
        <div className="mb-4"><label className={labelCls}>Message</label>
          <textarea className={inputCls + " min-h-52"} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message… (use {{name}} in templates)" />
          <p className="mt-1 text-[11px] text-dust">Plain text — line breaks are preserved. Sent as {`{`}physics@sjabrankamran.com{`}`}.</p>
        </div>

        {msg && (
          <div className={"mb-3 rounded-xl border px-3.5 py-2 text-xs " + (msg.ok ? "border-emerald2/40 bg-emerald2/[0.06] text-emerald2" : "border-signal/40 bg-signal/[0.06] text-signal")}>{msg.text}</div>
        )}
        <button onClick={send} disabled={sending} className="btn-primary disabled:opacity-50">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send
        </button>
        </>
        )}
      </div>

      {/* log */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm text-ice">Sent &amp; queued</p>
          <button onClick={refreshLog} className="font-mono text-[11px] text-cyan hover:underline">refresh</button>
        </div>
        {log.length === 0 ? (
          <p className="text-xs text-dust">No emails yet.</p>
        ) : (
          <ul className="space-y-2 max-h-[520px] overflow-auto">
            {log.map((e) => (
              <li key={e.id} className="rounded-xl border border-white/[0.07] bg-void/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-xs text-ice" title={e.subject}>{e.subject}</span>
                  <StatusPill s={e.status} />
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-dust">
                  <span>{e.to.length} recipient{e.to.length === 1 ? "" : "s"} · {e.kind}</span>
                  <span>{new Date(e.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  if (s === "sent") return <span className="inline-flex items-center gap-1 rounded-full border border-emerald2/40 px-2 py-0.5 font-mono text-[9px] text-emerald2"><CheckCircle2 size={10} /> sent</span>;
  if (s === "queued") return <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 px-2 py-0.5 font-mono text-[9px] text-amber-300"><Clock size={10} /> queued</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-signal/40 px-2 py-0.5 font-mono text-[9px] text-signal"><AlertTriangle size={10} /> {s}</span>;
}
