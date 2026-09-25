"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Coffee, Flag, Info, Loader2 } from "lucide-react";
import type { SessionState } from "@/lib/sat/client-types";
import { SprPad } from "./spr-pad";
import { ScoreReport } from "./score-report";
import { QuestionImage } from "./question-image";
import { useSignedImages } from "./use-signed-images";
import {
  SAVE_DEBOUNCE_MS, answersChangedFor, flaggedChangedFor, isTimeoutError, looksLikeSessionState, mergeAnswers, mergeFlagged,
  pickAnswers, pickFlagged, retryDelayMs, stopMessage,
} from "./sat-runner-utils";

type SaveState = "idle" | "saving" | "saved" | "unsaved" | "failed" | "stopped";
// `halted`: the failure was a 401/403/404, so nothing retries it automatically.
type PostResult = { kind: "ok"; state: SessionState } | { kind: "stale"; state: SessionState } | { kind: "error"; message: string; halted: boolean };
const SAVE_LABEL: Record<SaveState, string> = {
  idle: "", saving: "Saving…", saved: "Saved", unsaved: "Unsaved changes", failed: "Not saved — retrying", stopped: "Not saved",
};
const BACKSTOP_MS = 30_000;
const BREAK_RELOAD_MIN_GAP_MS = 5000;
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

  // Marks whether a save is currently in flight -- an edit (or the 30 s
  // backstop, or a debounce timer) that lands while one is running just keeps
  // `dirty` true. When that save's response lands still dirty, it re-arms the
  // debounce once (bumping `saveRearm` below), so back-to-back saves are
  // never sent and a slow save never leaves an edit waiting for the backstop.
  const saveBusy = useRef(false);

  // Failed requests back off instead of hammering the server (and Supabase's
  // per-IP auth limit) during an outage. `failures` counts consecutive failed
  // requests of any kind; an ok or stale (409) response resets it. After a
  // failure, automatic retries wait retryDelayMs(failures): 3 s, 6 s, 12 s,
  // 24 s, then 30 s. `retryAt` is when the next one may go, which the 30 s
  // backstop honours too.
  const failures = useRef(0);
  const retryAt = useRef(0);
  // A 401/403/404 won't change by asking again: `halted` stops every
  // automatic request (re-armed save, backstop, break-end reload) until a
  // request succeeds or the student edits (typing or Submit still try once).
  // `halt` is the message shown meanwhile; only a success clears it.
  const halted = useRef(false);
  const [halt, setHalt] = useState<string | null>(null);
  const noteSuccess = useCallback(() => {
    failures.current = 0;
    retryAt.current = 0;
    halted.current = false;
    setHalt(null);
  }, []);
  /** Counts a failed request; true when it stops automatic retries. */
  const noteFailure = useCallback((status: number | null) => {
    failures.current += 1;
    retryAt.current = Date.now() + retryDelayMs(failures.current);
    const stop = stopMessage(status);
    if (stop) { halted.current = true; setHalt(stop); }
    return stop !== null;
  }, []);

  // Bumped to restart the debounce: the autosave effect clears any pending
  // timer and sets a fresh one, `nextSaveDelay` from now. An edit sets it to
  // the ordinary 1.5 s; a re-arm to the current back-off (1.5 s when nothing
  // has failed).
  const nextSaveDelay = useRef(SAVE_DEBOUNCE_MS);
  const [saveRearm, setSaveRearm] = useState(0);
  const rearmSave = useCallback(() => {
    nextSaveDelay.current = retryDelayMs(failures.current);
    setSaveRearm((n) => n + 1);
  }, []);
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
  // note explains it instead. Either way, a module left dirty re-arms the
  // 1.5 s debounce and shows "Unsaved changes" until that save goes out.
  const applyStale = useCallback((s: SessionState) => {
    skew.current = s.serverNow - Date.now();
    const onScreenKey = stateRef.current?.stage?.key ?? null;
    const serverKey = s.stage?.key ?? null;
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
      setError(null);
      touched.current = new Set();
      dirty.current = answersChangedFor(s.answers, mergedAnswers, ids) || flaggedChangedFor(s.flagged, mergedFlagged, ids);
      setNote("This module was already submitted — showing the current module.");
    }
    if (dirty.current) { setSave("unsaved"); rearmSave(); }
    else setSave("idle");
  }, [setStateBoth, setAnswersBoth, setFlaggedBoth, rearmSave]);

  const load = useCallback(async () => {
    const fallback = "This sitting couldn't be loaded.";
    let res: Response;
    let j: { error?: string } | null; // a JSON `null` body parses too
    try {
      // A hung GET must never wedge the queue it now runs through -- a
      // timeout is caught below and treated like any other load failure.
      res = await fetch(`/api/sat/sessions/${sessionId}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      j = await res.json().catch(() => ({}));
    } catch (e) {
      noteFailure(null);
      setError(isTimeoutError(e) ? "The connection timed out — please try again." : (e as Error).message || fallback);
      return;
    }
    if (!res.ok || !looksLikeSessionState(j)) {
      noteFailure(res.ok ? null : res.status);
      setError((!res.ok && j?.error) || fallback);
      return;
    }
    noteSuccess();
    apply(j as SessionState); // clears `error` too
  }, [sessionId, apply, noteSuccess, noteFailure]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const postRaw = useCallback(async (
    body: object, timeoutMessage = "The connection timed out — your answers are kept. Please try again.",
  ): Promise<PostResult> => {
    try {
      // A hung request must never block the queued submit forever -- a
      // timeout is caught below and treated exactly like a network failure.
      const res = await fetch(`/api/sat/sessions/${sessionId}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      });
      const j = await res.json().catch(() => ({}));
      // The module already ended (another tab/device, or a racing request): the server hands back its current state.
      if (res.status === 409 && j.state && looksLikeSessionState(j.state)) { noteSuccess(); return { kind: "stale", state: j.state as SessionState }; }
      if (!res.ok) return { kind: "error", message: j.error || "Please try again.", halted: noteFailure(res.status) };
      // A 2xx whose body doesn't actually parse into a session state (a
      // malformed/empty body) must never be applied -- treat it as a failure.
      if (!looksLikeSessionState(j)) return { kind: "error", message: "Please try again.", halted: noteFailure(null) };
      noteSuccess();
      return { kind: "ok", state: j as SessionState };
    } catch (e) {
      return { kind: "error", message: isTimeoutError(e) ? timeoutMessage : (e as Error).message || "Please try again.", halted: noteFailure(null) };
    }
  }, [sessionId, noteSuccess, noteFailure]);

  // The actual save network round-trip -- a single attempt, never looping.
  // `editSeq` guards against a subtler case: an edit made after the request
  // body was already built (but before its response lands) must not be
  // wiped from `dirty` by that response's "ok" -- if the sequence moved on,
  // this stays dirty instead. Whatever the response (ok, stale, retryable
  // failure), a module still dirty re-arms the debounce once -- the edit's
  // own timer may already have fired (and been skipped) while this save was
  // in flight -- rather than resending back to back. After a failure the
  // re-arm waits the back-off; after a 401/403/404 nothing re-arms at all.
  const runSaveCycle = useCallback(async () => {
    try {
      const stageKey = stateRef.current?.stage?.key ?? null;
      if (!stageKey) return;
      if (submittedStage.current === stageKey) { setSave("idle"); return; } // a submit took over
      setSave("saving");
      const ids = stateRef.current?.stage?.questions.map((x) => x.id) ?? [];
      const seqAtSend = editSeq.current;
      const body = { action: "save" as const, stage: stageKey, answers: pickAnswers(answersRef.current, ids), flagged: pickFlagged(flaggedRef.current, ids) };
      const result = await postRaw(body);
      if (submittedStage.current === stageKey) { setSave("idle"); return; } // ditto, while this request was in flight
      if (result.kind === "error") {
        dirty.current = true;
        if (result.halted) setSave("stopped");
        else { setSave("failed"); rearmSave(); } // noteFailure already raised the back-off this re-arm waits
      }
      else if (result.kind === "stale") { applyStale(result.state); } // re-arms itself when it leaves the module dirty
      else {
        skew.current = result.state.serverNow - Date.now();
        if (editSeq.current === seqAtSend) { dirty.current = false; setSave("saved"); setNote(null); }
        else { dirty.current = true; setSave("unsaved"); rearmSave(); } // an edit landed after this body was built
      }
    } finally {
      saveBusy.current = false;
    }
  }, [postRaw, applyStale, rearmSave]);

  const requestSave = useCallback(() => {
    const stageKey = stateRef.current?.stage?.key ?? null;
    if (!stageKey || !dirty.current) return;
    if (submittedStage.current === stageKey) return;
    if (halted.current) return; // a 401/403/404: only an edit (or a success) lets a save go again
    if (saveBusy.current) { dirty.current = true; return; } // stays dirty; the in-flight save's response re-arms the debounce
    saveBusy.current = true;
    void enqueue(() => runSaveCycle());
  }, [enqueue, runSaveCycle]);

  // Autosave: 1.5 s after a change, or the back-off after a re-arm; and every
  // 30 s as a backstop, which never goes sooner than the back-off allows and
  // never while halted.
  useEffect(() => {
    if (!dirty.current) return;
    saveTimer.current = setTimeout(() => { saveTimer.current = null; requestSave(); }, nextSaveDelay.current);
    return () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } };
  }, [answers, flagged, saveRearm, requestSave]);
  useEffect(() => {
    const t = setInterval(() => { if (Date.now() >= retryAt.current) requestSave(); }, BACKSTOP_MS);
    return () => clearInterval(t);
  }, [requestSave]);

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
        const result = await postRaw(body, "The connection timed out — your answers are kept. Press Submit again.");
        if (result.kind === "error") {
          // We don't know if this submit actually reached the server -- keep
          // the module dirty so the 30 s backstop save fires (after the
          // back-off, and not at all when halted); if the submit DID land,
          // that save gets a 409 back and re-syncs the screen.
          dirty.current = true;
          setError(result.halted ? null : result.message); // a halt explains itself in the banner
          return;
        }
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
        if (result.kind === "error") { setError(result.halted ? null : result.message); return; }
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
  // retries only after at least 5 s, or the failure back-off when that is
  // longer, and not at all after a 401/403/404 ("Start Math now" still
  // works). Routed through the same promise chain as save/submit/begin so
  // it can never race "Start Math now" -- and guarded so that if it was
  // queued BEHIND a begin/submit that already
  // ran, it becomes a no-op instead of re-fetching and stomping on
  // whatever the student has typed into the module that's now on screen.
  useEffect(() => {
    if (state?.status !== "break" || !state.breakUntil) { breakReload.current = null; return; }
    const until = state.breakUntil;
    if (now + skew.current < until || halted.current) return;
    const last = breakReload.current;
    const nowMs = Date.now();
    const gap = Math.max(BREAK_RELOAD_MIN_GAP_MS, retryDelayMs(failures.current));
    if (last && last.until === until && nowMs - last.at < gap) return;
    breakReload.current = { until, at: nowMs };
    void enqueue(() => (stateRef.current?.status === "break" ? load() : Promise.resolve()));
  }, [state, now, load, enqueue]);

  const questions = useMemo(() => state?.stage?.questions ?? [], [state]);
  const { urls, error: imgError, missing: imgMissing } = useSignedImages(questions.map((q) => q.img));

  if (error && !state) return <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">{error} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></p>;
  if (!state) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading your sitting…</p>;
  if (state.status === "finished" && state.report) return <ScoreReport report={state.report} />;

  // Why nothing is being saved or reloaded automatically (a 401/403/404).
  const haltBanner = halt ? <p role="alert" className="rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-fog">{halt}</p> : null;

  if (state.status === "break") {
    const left = (state.breakUntil ?? 0) - (now + skew.current);
    return (
      <div className="mx-auto max-w-md space-y-4">
        {haltBanner}
        <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
          <Coffee className="mx-auto text-cyan" />
          <p className="mt-3 font-display text-xl text-ice">Break · {fmt(left)}</p>
          <p className="mt-2 text-sm text-fog">Reading and Writing is done. Math begins when the break ends.</p>
          <button disabled={busy} onClick={() => void beginModule()} className="btn-primary mt-5 !px-4 !py-2 text-sm">Start Math now</button>
          {error ? <p className="mt-3 text-xs text-signal">{error}</p> : null}
        </div>
      </div>
    );
  }

  const stage = state.stage!;
  const q = questions[idx];
  const unanswered = questions.filter((x) => !answers[x.id]).length;
  // Every edit: mark it unsaved, let one save try again even after a
  // 401/403/404, and save it 1.5 s after the last change.
  const noteEdit = () => {
    dirty.current = true;
    editSeq.current += 1;
    touched.current.add(q.id);
    halted.current = false;
    nextSaveDelay.current = SAVE_DEBOUNCE_MS;
  };
  const setAnswer = (v: string) => {
    noteEdit();
    setAnswersBoth({ ...answersRef.current, [q.id]: v });
  };
  const toggleFlag = () => {
    noteEdit();
    const next = flaggedRef.current.includes(q.id) ? flaggedRef.current.filter((x) => x !== q.id) : [...flaggedRef.current, q.id];
    setFlaggedBoth(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-ice">{stage.label}</p><p className="text-xs text-dust">{state.title}</p></div>
        <span className={"ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm " + (remaining <= 5 * 60_000 ? "border-amber-300/40 text-amber-200" : "border-white/15 text-ice")}><Clock size={14} /> {fmt(remaining)}</span>
        <span className="text-xs text-dust">{SAVE_LABEL[save]}</span>
      </div>

      {haltBanner}
      {expired ? <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-sm text-amber-100">Time is up for this module. Your saved answers are kept — submit the module to continue.</p> : null}
      {note ? <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-dust"><Info size={14} className="shrink-0" />{note}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
          <div className="flex items-center gap-2 text-sm text-fog">
            <span className="font-display text-ice">Question {q.n} of {questions.length}</span>
            <button type="button" disabled={busy} onClick={toggleFlag} className={"ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs disabled:opacity-40 " + (flagged.includes(q.id) ? "border-amber-300/50 text-amber-200" : "border-white/15 text-dust")}><Flag size={12} /> {flagged.includes(q.id) ? "Marked for review" : "Mark for review"}</button>
          </div>
          <QuestionImage key={q.img} src={urls[q.img]} alt={`Question ${q.n}`} error={imgMissing[q.img] ?? imgError} />
          {q.kind === "mcq" ? (
            <div className="grid grid-cols-4 gap-2">
              {["A", "B", "C", "D"].map((l) => (
                <button key={l} type="button" disabled={busy} onClick={() => setAnswer(answers[q.id] === l ? "" : l)} className={"rounded-xl border py-3 font-display text-lg disabled:opacity-40 " + (answers[q.id] === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog hover:border-white/30")}>{l}</button>
              ))}
            </div>
          ) : (
            <SprPad key={q.id} value={answers[q.id] ?? ""} onChange={setAnswer} disabled={busy} />
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
