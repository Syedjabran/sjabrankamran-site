"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Coffee, Flag, Loader2 } from "lucide-react";
import type { SessionState } from "@/lib/sat/client-types";
import { SprPad } from "./spr-pad";
import { ScoreReport } from "./score-report";
import { useSignedImages } from "./use-signed-images";

type SaveState = "idle" | "saving" | "saved" | "failed";
const fmt = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function SatRunner({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [save, setSave] = useState<SaveState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const skew = useRef(0);
  const expiredOnLoad = useRef(false);
  const dirty = useRef(false);
  const autoSubmitted = useRef<string | null>(null);

  const apply = useCallback((s: SessionState) => {
    skew.current = s.serverNow - Date.now();
    setState(s);
    setAnswers(s.answers);
    setFlagged(s.flagged);
    setIdx(0);
    setConfirming(false);
    expiredOnLoad.current = !!s.stage && s.stage.deadline <= s.serverNow;
    dirty.current = false;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sat/sessions/${sessionId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "This sitting couldn't be loaded.");
      apply(j as SessionState);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sessionId, apply]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const post = useCallback(async (body: object) => {
    const res = await fetch(`/api/sat/sessions/${sessionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    // The module already ended (another tab, a double click): adopt the server's state.
    if (res.status === 409 && j.state) return j.state as SessionState;
    if (!res.ok) throw new Error(j.error || "Please try again.");
    return j as SessionState;
  }, [sessionId]);

  const doSave = useCallback(async () => {
    if (!state?.stage || !dirty.current) return;
    setSave("saving");
    try {
      const s = await post({ action: "save", stage: state.stage.key, answers, flagged });
      if (s.stage?.key !== state.stage.key) apply(s); // the module moved on elsewhere
      dirty.current = false; setSave("saved");
    }
    catch { setSave("failed"); }
  }, [state, answers, flagged, post]);

  // Autosave: shortly after a change, and every 30 s as a backstop.
  useEffect(() => { if (!dirty.current) return; const t = setTimeout(() => void doSave(), 1500); return () => clearTimeout(t); }, [answers, flagged, doSave]);
  useEffect(() => { const t = setInterval(() => void doSave(), 30_000); return () => clearInterval(t); }, [doSave]);

  const submit = useCallback(async () => {
    setBusy(true);
    try { apply(await post({ action: "submit", stage: state?.stage?.key, answers, flagged })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [answers, flagged, post, apply, state]);

  const remaining = state?.stage ? state.stage.deadline - (now + skew.current) : 0;
  const expired = !!state?.stage && remaining <= 0;

  // Auto-submit only when the clock runs out WHILE the module is on screen, and
  // only once per stage: a failed auto-submit must not retry every second on a
  // flaky network -- the student is left with the banner and a manual Submit.
  useEffect(() => {
    if (state?.status !== "running" || !expired || expiredOnLoad.current || !state.stage || busy) return;
    if (autoSubmitted.current === state.stage.key) return;
    autoSubmitted.current = state.stage.key;
    void submit();
  }, [expired, state, busy, submit]);

  // Break: reload when it ends (the server starts Math at the break's end).
  useEffect(() => {
    if (state?.status === "break" && state.breakUntil && now + skew.current >= state.breakUntil) void load();
  }, [state, now, load]);

  const questions = useMemo(() => state?.stage?.questions ?? [], [state]);
  const { urls, error: imgError } = useSignedImages(questions.map((q) => q.img));

  if (error && !state) return <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">{error} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></p>;
  if (!state) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading your sitting…</p>;
  if (state.status === "finished" && state.report) return <ScoreReport report={state.report} />;

  if (state.status === "break") {
    const left = (state.breakUntil ?? 0) - (now + skew.current);
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
        <Coffee className="mx-auto text-cyan" />
        <p className="mt-3 font-display text-xl text-ice">Break · {fmt(left)}</p>
        <p className="mt-2 text-sm text-fog">Reading and Writing is done. Math begins when the break ends.</p>
        <button disabled={busy} onClick={async () => { setBusy(true); try { apply(await post({ action: "begin" })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }} className="btn-primary mt-5 !px-4 !py-2 text-sm">Start Math now</button>
      </div>
    );
  }

  const stage = state.stage!;
  const q = questions[idx];
  const unanswered = questions.filter((x) => !answers[x.id]).length;
  const setAnswer = (v: string) => { dirty.current = true; setAnswers((a) => ({ ...a, [q.id]: v })); };
  const toggleFlag = () => { dirty.current = true; setFlagged((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id])); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-ice">{stage.label}</p><p className="text-xs text-dust">{state.title}</p></div>
        <span className={"ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm " + (remaining <= 5 * 60_000 ? "border-amber-300/40 text-amber-200" : "border-white/15 text-ice")}><Clock size={14} /> {fmt(remaining)}</span>
        <span className="text-xs text-dust">{save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "failed" ? "Not saved — retrying" : ""}</span>
      </div>

      {expired ? <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-sm text-amber-100">Time is up for this module. Your saved answers are kept — submit the module to continue.</p> : null}
      {imgError ? <p className="text-sm text-signal">{imgError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
          <div className="flex items-center gap-2 text-sm text-fog">
            <span className="font-display text-ice">Question {q.n} of {questions.length}</span>
            <button type="button" onClick={toggleFlag} className={"ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs " + (flagged.includes(q.id) ? "border-amber-300/50 text-amber-200" : "border-white/15 text-dust")}><Flag size={12} /> {flagged.includes(q.id) ? "Marked for review" : "Mark for review"}</button>
          </div>
          {urls[q.img] ? <img src={urls[q.img]} alt={`Question ${q.n}`} className="w-full rounded-lg bg-white" /> : <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />}
          {q.kind === "mcq" ? (
            <div className="grid grid-cols-4 gap-2">
              {["A", "B", "C", "D"].map((l) => (
                <button key={l} type="button" onClick={() => setAnswer(answers[q.id] === l ? "" : l)} className={"rounded-xl border py-3 font-display text-lg " + (answers[q.id] === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog hover:border-white/30")}>{l}</button>
              ))}
            </div>
          ) : (
            <SprPad value={answers[q.id] ?? ""} onChange={setAnswer} />
          )}
          <div className="flex justify-between">
            <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="btn-ghost !px-3 !py-1.5 text-sm disabled:opacity-40"><ChevronLeft size={14} /> Back</button>
            <button type="button" disabled={idx === questions.length - 1} onClick={() => setIdx(idx + 1)} className="btn-ghost !px-3 !py-1.5 text-sm disabled:opacity-40">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        <aside className="min-w-0 space-y-3 rounded-2xl border border-white/10 bg-space/60 p-4">
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {questions.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setIdx(i)} aria-label={`Question ${x.n}`}
                className={"relative rounded-md border py-1 text-xs " + (i === idx ? "border-cyan text-ice" : answers[x.id] ? "border-white/25 bg-white/[0.08] text-ice" : "border-white/10 text-dust")}>
                {x.n}{flagged.includes(x.id) ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300" /> : null}
              </button>
            ))}
          </div>
          {confirming ? (
            <div className="space-y-2 rounded-xl border border-amber-300/30 p-3 text-xs text-amber-100">
              <p>{unanswered} question{unanswered === 1 ? " is" : "s are"} unanswered. Submit this module anyway?</p>
              <div className="flex gap-2"><button disabled={busy} onClick={() => void submit()} className="btn-primary !px-3 !py-1.5 text-xs">Submit</button><button onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">Keep working</button></div>
            </div>
          ) : (
            <button disabled={busy} onClick={() => (unanswered ? setConfirming(true) : void submit())} className="btn-primary w-full !py-2 text-sm">{busy ? "Submitting…" : `Submit ${stage.label.split(" · ")[1]}`}</button>
          )}
          {error ? <p className="text-xs text-signal">{error}</p> : null}
        </aside>
      </div>
    </div>
  );
}
