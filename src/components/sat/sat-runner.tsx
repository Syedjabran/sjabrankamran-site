"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Coffee, Flag, Info, Loader2 } from "lucide-react";
import type { SessionState } from "@/lib/sat/client-types";
import { SprPad } from "./spr-pad";
import { ScoreReport } from "./score-report";
import { useSignedImages } from "./use-signed-images";
import { answersChangedFor, flaggedChangedFor, mergeAnswers, mergeFlagged, pickAnswers, pickFlagged } from "./sat-runner-utils";

type SaveState = "idle" | "saving" | "saved" | "failed";
type PostResult = { kind: "ok"; state: SessionState } | { kind: "stale"; state: SessionState } | { kind: "error"; message: string };
const fmt = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function SatRunner({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
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
  // Ids the student has actually edited (answered or flagged) since the
  // last adopted server snapshot -- as opposed to an id local merely
  // inherited by copying a server map. Only touched ids may win a
  // stage-switch merge; cleared whenever a server snapshot is adopted for
  // a stage (apply(), and applyStale's switch-to-a-different-module branch).
  const touched = useRef<Set<string>>(new Set());
  // Bumped by every edit; a save response is only trusted to mean "nothing
  // left to save" if no edit happened after the request body was built.
  const editSeq = useRef(0);

  // Refs mirroring the latest state/answers/flagged for use inside async
  // request handlers, which must always act on "the module now on screen"
  // rather than a value captured by a stale closure.
  const stateRef = useRef<SessionState | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const flaggedRef = useRef<string[]>([]);

  const setStateBoth = useCallback((s: SessionState | null) => { stateRef.current = s; setState(s); }, []);
  const setAnswersBoth = useCallback((a: Record<string, string>) => { answersRef.current = a; setAnswers(a); }, []);
  const setFlaggedBoth = useCallback((f: string[]) => { flaggedRef.current = f; setFlagged(f); }, []);

  // A single promise chain -- at most one save/submit/begin POST is ever in
  // flight at a time; each new one is queued after whatever is running.
  const postQueue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = postQueue.current.then(fn, fn);
    postQueue.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  // Autosave coalescing: a save requested while one is in flight sets
  // `saveAgain` instead of queuing a second request; the in-flight save
  // loops once more (with the latest answers) before releasing `saveBusy`.
  const saveBusy = useRef(false);
  const saveAgain = useRef(false);
  // The stage key a submit has been sent for -- blocks any further save for
  // that same stage until the submit settles (success, stale, or error).
  const submittedStage = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fires load() once per break (keyed by its end time), then backs off.
  const breakReload = useRef<{ until: number; at: number } | null>(null);

  const apply = useCallback((s: SessionState) => {
    skew.current = s.serverNow - Date.now();
    setStateBoth(s);
    setAnswersBoth(s.answers);
    setFlaggedBoth(s.flagged);
    setIdx(0);
    setConfirming(false);
    setNote(null);
    setError(null);
    expiredOnLoad.current = !!s.stage && s.stage.deadline <= s.serverNow;
    dirty.current = false;
    touched.current = new Set();
  }, [setStateBoth, setAnswersBoth, setFlaggedBoth]);

  // A 409 (save or submit): adopt the server's clock always. If the
  // server's stage still matches the module on screen, the local
  // answers/flagged for it are left completely untouched (and kept dirty,
  // so the next save resends them) -- never wiped just because a stale
  // response landed, and `expiredOnLoad` is left alone too (this module was
  // already on screen; it isn't being freshly "loaded"). Only when the
  // server has moved to a DIFFERENT module do we switch the screen,
  // recompute `expiredOnLoad` for it, and seed its answers/flagged from the
  // server's copy merged with any local answers/flags the student actually
  // TOUCHED for it (touched wins; an id merely inherited from an earlier
  // snapshot never overrides the server's own copy) -- dirty only if that
  // merge actually changed something. Never shown as "saved" -- a neutral
  // note explains it instead.
  const applyStale = useCallback((s: SessionState) => {
    skew.current = s.serverNow - Date.now();
    const onScreenKey = stateRef.current?.stage?.key ?? null;
    const serverKey = s.stage?.key ?? null;
    setSave("idle");
    if (serverKey && serverKey === onScreenKey) {
      setStateBoth({ ...s, answers: answersRef.current, flagged: flaggedRef.current });
      dirty.current = true;
      setNote("Your answers were re-synced — keep going.");
    } else {
      expiredOnLoad.current = !!s.stage && s.stage.deadline <= s.serverNow;
      const ids = s.stage?.questions.map((q) => q.id) ?? [];
      const mergedAnswers = mergeAnswers(s.answers, answersRef.current, ids, touched.current);
      const mergedFlagged = mergeFlagged(s.flagged, flaggedRef.current, ids, touched.current);
      setStateBoth({ ...s, answers: mergedAnswers, flagged: mergedFlagged });
      setAnswersBoth(mergedAnswers);
      setFlaggedBoth(mergedFlagged);
      setIdx(0);
      setConfirming(false);
      touched.current = new Set();
      dirty.current = answersChangedFor(s.answers, mergedAnswers, ids) || flaggedChangedFor(s.flagged, mergedFlagged, ids);
      setNote("This module was already submitted — showing the current module.");
    }
  }, [setStateBoth, setAnswersBoth, setFlaggedBoth]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sat/sessions/${sessionId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "This sitting couldn't be loaded.");
      apply(j as SessionState); // clears `error` too
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sessionId, apply]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const postRaw = useCallback(async (body: object): Promise<PostResult> => {
    try {
      // A hung request must never block the queued submit forever -- a
      // timeout is caught below and treated exactly like a network failure.
      const res = await fetch(`/api/sat/sessions/${sessionId}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      });
      const j = await res.json().catch(() => ({}));
      // The module already ended (another tab/device, or a racing request): the server hands back its current state.
      if (res.status === 409 && j.state) return { kind: "stale", state: j.state as SessionState };
      if (!res.ok) return { kind: "error", message: j.error || "Please try again." };
      return { kind: "ok", state: j as SessionState };
    } catch (e) {
      return { kind: "error", message: (e as Error).message || "Please try again." };
    }
  }, [sessionId]);

  // The actual save network round-trip, looping once more in place whenever
  // a save was requested again while this one was in flight -- so at most
  // one save is ever queued, and it always sends the latest local answers.
  // `editSeq` guards against a subtler case: an edit made after the request
  // body was already built (but before its response lands) must not be
  // wiped from `dirty` by that response's "ok" -- the loop treats it the
  // same as a coalesced follow-up and sends one more save immediately.
  const runSaveCycle = useCallback(async () => {
    setSave("saving");
    try {
      for (;;) {
        const stageKey = stateRef.current?.stage?.key ?? null;
        if (!stageKey) break;
        if (submittedStage.current === stageKey) { setSave("idle"); saveAgain.current = false; break; } // a submit took over
        const ids = stateRef.current?.stage?.questions.map((x) => x.id) ?? [];
        const seqAtSend = editSeq.current;
        const body = { action: "save" as const, stage: stageKey, answers: pickAnswers(answersRef.current, ids), flagged: pickFlagged(flaggedRef.current, ids) };
        const result = await postRaw(body);
        if (submittedStage.current === stageKey) { setSave("idle"); saveAgain.current = false; break; } // ditto, while this request was in flight
        if (result.kind === "error") { dirty.current = true; setSave("failed"); }
        else if (result.kind === "stale") { applyStale(result.state); }
        else {
          skew.current = result.state.serverNow - Date.now();
          if (editSeq.current === seqAtSend) { dirty.current = false; setSave("saved"); setNote(null); }
          else { dirty.current = true; saveAgain.current = true; } // an edit landed after this body was built -- resend, don't show "Saved"
        }
        if (!saveAgain.current) break;
        saveAgain.current = false;
      }
    } finally {
      saveBusy.current = false;
    }
  }, [postRaw, applyStale]);

  const requestSave = useCallback(() => {
    const stageKey = stateRef.current?.stage?.key ?? null;
    if (!stageKey || !dirty.current) return;
    if (submittedStage.current === stageKey) return;
    if (saveBusy.current) { saveAgain.current = true; return; }
    saveBusy.current = true;
    void enqueue(() => runSaveCycle());
  }, [enqueue, runSaveCycle]);

  // Autosave: shortly after a change, and every 30 s as a backstop.
  useEffect(() => {
    if (!dirty.current) return;
    saveTimer.current = setTimeout(() => { saveTimer.current = null; requestSave(); }, 1500);
    return () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } };
  }, [answers, flagged, requestSave]);
  useEffect(() => { const t = setInterval(() => requestSave(), 30_000); return () => clearInterval(t); }, [requestSave]);

  const submit = useCallback(async () => {
    const stageKey = stateRef.current?.stage?.key ?? null;
    if (!stageKey) return;
    setBusy(true);
    // Cancel any pending debounce timer -- its stale snapshot must never be sent after a submit for this stage.
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    submittedStage.current = stageKey;
    try {
      // Wait for an in-flight save to settle (enqueue puts us right after it in the same chain), then submit with the latest local answers.
      await enqueue(async () => {
        const ids = stateRef.current?.stage?.key === stageKey ? (stateRef.current?.stage?.questions.map((x) => x.id) ?? []) : [];
        const body = { action: "submit" as const, stage: stageKey, answers: pickAnswers(answersRef.current, ids), flagged: pickFlagged(flaggedRef.current, ids) };
        const result = await postRaw(body);
        if (result.kind === "error") { setError(result.message); return; }
        if (result.kind === "stale") { applyStale(result.state); return; }
        apply(result.state);
      });
    } finally {
      submittedStage.current = null;
      setBusy(false);
    }
  }, [enqueue, postRaw, applyStale, apply]);

  const beginModule = useCallback(async () => {
    setBusy(true);
    try {
      await enqueue(async () => {
        const result = await postRaw({ action: "begin" });
        if (result.kind === "error") { setError(result.message); return; }
        if (result.kind === "stale") { applyStale(result.state); return; }
        apply(result.state);
      });
    } finally {
      setBusy(false);
    }
  }, [enqueue, postRaw, applyStale, apply]);

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

  // Break: reload once when it ends (the server starts Math at the break's
  // end), keyed by the break's own end time so this never re-fires every
  // tick; if the server still reports the break (a slow/failed reload), it
  // retries only after a 5 s back-off. Routed through the same promise
  // chain as save/submit/begin so it can never race "Start Math now".
  useEffect(() => {
    if (state?.status !== "break" || !state.breakUntil) { breakReload.current = null; return; }
    const until = state.breakUntil;
    if (now + skew.current < until) return;
    const last = breakReload.current;
    const nowMs = Date.now();
    if (last && last.until === until && nowMs - last.at < 5000) return;
    breakReload.current = { until, at: nowMs };
    void enqueue(() => load());
  }, [state, now, load, enqueue]);

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
        <button disabled={busy} onClick={() => void beginModule()} className="btn-primary mt-5 !px-4 !py-2 text-sm">Start Math now</button>
      </div>
    );
  }

  const stage = state.stage!;
  const q = questions[idx];
  const unanswered = questions.filter((x) => !answers[x.id]).length;
  const setAnswer = (v: string) => {
    dirty.current = true;
    editSeq.current += 1;
    touched.current.add(q.id);
    setAnswersBoth({ ...answersRef.current, [q.id]: v });
  };
  const toggleFlag = () => {
    dirty.current = true;
    editSeq.current += 1;
    touched.current.add(q.id);
    const next = flaggedRef.current.includes(q.id) ? flaggedRef.current.filter((x) => x !== q.id) : [...flaggedRef.current, q.id];
    setFlaggedBoth(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-ice">{stage.label}</p><p className="text-xs text-dust">{state.title}</p></div>
        <span className={"ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm " + (remaining <= 5 * 60_000 ? "border-amber-300/40 text-amber-200" : "border-white/15 text-ice")}><Clock size={14} /> {fmt(remaining)}</span>
        <span className="text-xs text-dust">{save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "failed" ? "Not saved — retrying" : ""}</span>
      </div>

      {expired ? <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-sm text-amber-100">Time is up for this module. Your saved answers are kept — submit the module to continue.</p> : null}
      {note ? <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-dust"><Info size={14} className="shrink-0" />{note}</p> : null}
      {imgError ? <p className="text-sm text-signal">{imgError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
          <div className="flex items-center gap-2 text-sm text-fog">
            <span className="font-display text-ice">Question {q.n} of {questions.length}</span>
            <button type="button" disabled={busy} onClick={toggleFlag} className={"ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs disabled:opacity-40 " + (flagged.includes(q.id) ? "border-amber-300/50 text-amber-200" : "border-white/15 text-dust")}><Flag size={12} /> {flagged.includes(q.id) ? "Marked for review" : "Mark for review"}</button>
          </div>
          {urls[q.img] ? <img src={urls[q.img]} alt={`Question ${q.n}`} className="w-full rounded-lg bg-white" /> : <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />}
          {q.kind === "mcq" ? (
            <div className="grid grid-cols-4 gap-2">
              {["A", "B", "C", "D"].map((l) => (
                <button key={l} type="button" disabled={busy} onClick={() => setAnswer(answers[q.id] === l ? "" : l)} className={"rounded-xl border py-3 font-display text-lg disabled:opacity-40 " + (answers[q.id] === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog hover:border-white/30")}>{l}</button>
              ))}
            </div>
          ) : (
            <SprPad value={answers[q.id] ?? ""} onChange={setAnswer} disabled={busy} />
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
