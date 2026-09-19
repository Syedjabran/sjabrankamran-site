"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, CheckCircle2, Eye, RotateCcw, Printer, Clock, ArrowLeft, Sparkles,
  ShieldAlert, Upload, FileText, ScanText, TimerReset, Timer, Lock, Video, ShieldCheck, Send, Pause, Play,
  Maximize2,
} from "lucide-react";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";
import { questionSeconds, formatDuration } from "@/lib/portal/timing";
import { AnswerPad } from "./answer-pad";
import { useExamGuard, type GuardEvent, type GuardMode } from "./use-exam-guard";
import { exitExamFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange, requestExamFullscreen } from "@/lib/exam-lab/fullscreen";
import { ProctorCamera } from "./proctor-camera";

type UrlMap = Record<string, string>;
type LogMeta = { mode: "paper" | "drill"; code?: string; ref?: string; paperType: "P1" | "P2" | "P4" | "mixed" };

export type AttemptKind = "practice" | "assignment" | "test";

function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export function PaperRunner({
  questions,
  title,
  subtitle,
  timed = true,
  lockOnExpiry = true,
  duration = 60,
  onExit,
  logMeta,
  integrity = "standard",
  kind = "practice",
  help = true,
  allocationId = null,
  attemptId,
  canPause = false,
}: {
  questions: ImgQuestion[];
  title: string;
  subtitle?: string;
  timed?: boolean;
  lockOnExpiry?: boolean;            // false: countdown shows but never auto-submits or locks answers
  duration?: number; // minutes
  onExit?: () => void;
  logMeta?: LogMeta;
  integrity?: GuardMode;            // "off" | "standard" | "strict"
  kind?: AttemptKind;               // practice | assignment | test
  help?: boolean;                   // help (mark scheme / Maxwell) permitted
  allocationId?: string | null;     // staff allocation this attempt belongs to
  attemptId?: string;               // stable forensic id (allocations use alloc-<id>)
  canPause?: boolean;               // super-admin: pause individual question timers
}) {
  const strict = integrity === "strict";
  // Open Practice is intentionally untimed at the session level: the per-
  // question figure remains a pacing guide, but it must never lock an answer
  // or auto-submit the session. Exam self-tests and teacher assignments keep
  // their existing timed/locked behaviour.
  const openPractice = integrity === "off" && kind === "practice";
  const attemptIdRef = useRef<string>(attemptId || newId());

  const [urls, setUrls] = useState<UrlMap>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [structAnswers, setStructAnswers] = useState<Record<string, string>>({});
  const [maxwell, setMaxwell] = useState<
    Record<string, { loading?: boolean; awarded?: number; outOf?: number; feedback?: string; points?: { earned: boolean; text: string }[]; error?: string }>
  >({});
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const topRef = useRef<HTMLDivElement>(null);

  // ---- exam clock / integrity ----
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [begun, setBegun] = useState(!strict); // strict tests wait behind the camera gate
  const [remaining, setRemaining] = useState(duration * 60);
  const [paceAlert, setPaceAlert] = useState(false);
  const paceFired = useRef(false);
  const [voided, setVoided] = useState<string | null>(null);
  const voidedRef = useRef(false);
  const totalSec = duration * 60;
  // ---- integrity / forensic state ----
  const revealsRef = useRef(0);
  const flagsRef = useRef(0);
  const [camStatus, setCamStatus] = useState<{ ready: boolean; faceOk: boolean; calibrated?: boolean } | null>(null);
  const [consent, setConsent] = useState(false);
  const attemptPostedRef = useRef(false);

  // ---- per-question time tracking ----
  const [perQ, setPerQ] = useState<Record<string, number>>({});
  const [pausedQuestions, setPausedQuestions] = useState<Set<string>>(() => new Set());
  // "Task completed" phase: the student has finished writing and wants to upload
  // an attachment. Time stops, answers freeze, and — crucially — the anti-cheat
  // guard + camera proctor stand down so switching tabs / opening the file
  // picker to grab the file does NOT lock the test. The attempt is recorded on
  // entry so responses are safe even if they navigate away to upload.
  const [taskCompleted, setTaskCompleted] = useState(false);
  // ---- full-screen ----
  // Every attempt is sat full-screen. The request itself is fired from the
  // click that opened the paper (see `enter()` in papers-hub) because browsers
  // only honour it under a user gesture; this state just tracks the result so
  // a student whose request was refused — or who arrived via a task deep-link,
  // where there is no gesture at all — can still go full-screen with one tap.
  const [fsOn, setFsOn] = useState(false);
  const [fsAvailable, setFsAvailable] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const liRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [answerMode, setAnswerMode] = useState<Record<string, string>>({});
  const toggleQuestionPause = useCallback((id: string) => {
    setPausedQuestions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isMcq = (q: ImgQuestion) => q.paperType === "P1";
  const totalMarks = useMemo(() => questions.reduce((s, q) => s + (q.marks || 0), 0), [questions]);

  // Per-question time budget (seconds). In open Practice this is guidance only:
  // the counter continues into overtime so returning to/editing a question is
  // always possible and the extra time is recorded.
  const qBudget = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of questions) m[q.id] = questionSeconds({ paper: q.paperType, difficulty: q.level, marks: q.marks });
    return m;
  }, [questions]);
  const qLocked = useCallback((id: string) => {
    if (openPractice || !timed || !lockOnExpiry || !begun || submitted) return false;
    return (perQ[id] || 0) >= (qBudget[id] || 90);
  }, [openPractice, timed, lockOnExpiry, begun, submitted, perQ, qBudget]);

  // Track full-screen, and always leave it behind when the runner unmounts
  // (Back, or a cancelled/locked attempt) so the rest of the portal is normal.
  useEffect(() => {
    setFsAvailable(fullscreenSupported());
    setFsOn(isFullscreen());
    const off = onFullscreenChange(() => setFsOn(isFullscreen()));
    return () => { off(); void exitExamFullscreen(); };
  }, []);

  // load exact past-paper images
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      const paths = Array.from(new Set(questions.flatMap((q) => [q.img, q.ms_img].filter(Boolean) as string[])));
      try {
        const res = await fetch("/api/exam-lab/asset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paths }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "load failed");
        if (alive) setUrls(j.urls || {});
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [questions]);

  // start the clock once the paper is on screen (non-strict) or once begun (strict)
  useEffect(() => {
    if (!loading && !err && begun && startedAt === null) setStartedAt(Date.now());
  }, [loading, err, begun, startedAt]);

  const running = timed && begun && startedAt !== null && !submitted && !voided && !taskCompleted && (openPractice || remaining > 0);
  const clockRunning = running && !openPractice;

  // ---- forensic event pipeline (strict tests stream to the proctor log) ----
  const postProctor = useCallback((body: Record<string, unknown>) => {
    fetch("/api/exam-lab/proctor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attemptId: attemptIdRef.current, ...body }) }).catch(() => {});
  }, []);

  const buildQLog = useCallback(() => questions.map((q) => {
    const ai = q.answer ? "ABCD".indexOf(q.answer) : -1;
    const mcq = isMcq(q);
    const earned = mcq ? (answers[q.id] === ai ? q.marks || 1 : 0) : (maxwell[q.id]?.awarded ?? null);
    return {
      id: q.id, topic: q.topic, level: q.level, paperType: q.paperType, marks: q.marks || 1,
      earned: earned as number | null, correct: mcq ? answers[q.id] === ai : null,
      spentSec: perQ[q.id] ?? null, expectedSec: questionSeconds({ paper: q.paperType, difficulty: q.level, marks: q.marks }),
      response: mcq ? (answers[q.id] == null ? null : "ABCD"[answers[q.id]]) : (structAnswers[q.id] || null),
      feedback: maxwell[q.id]?.feedback || null,
    };
    // structAnswers MUST stay in the dep list: without it the closure captured a
    // stale (often empty) answer map, so typed self-test / proctored responses
    // could be saved blank. Every submitted response is now recorded.
  }), [questions, answers, maxwell, perQ, structAnswers]);

  const postAttempt = useCallback((cancelled: boolean, lockedReason: string | null) => {
    if (!logMeta || attemptPostedRef.current) return;
    attemptPostedRef.current = true;
    const qlog = buildQLog();
    const scored = qlog.filter((q) => q.earned !== null);
    const score = scored.reduce((s, q) => s + (q.earned || 0), 0);
    const totalScored = scored.reduce((s, q) => s + q.marks, 0);
    fetch("/api/exam-lab/attempt", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: logMeta.mode, paperType: logMeta.paperType, code: logMeta.code, ref: logMeta.ref,
        score, total: totalScored, qCount: questions.length, scoredCount: scored.length,
        durationSec: startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : undefined, questions: qlog,
        context: { integrity, kind, help, revealsUsed: revealsRef.current, proctored: strict, cancelled, lockedReason, flags: flagsRef.current, allocationId, attemptId: attemptIdRef.current },
      }),
    }).catch(() => {});
  }, [logMeta, buildQLog, questions.length, startedAt, integrity, kind, help, strict, allocationId]);

  const seize = useCallback((reason: string) => {
    if (voidedRef.current) return;
    voidedRef.current = true;
    setVoided(reason);
    // The attempt is over: hand the screen back rather than leaving the student
    // pinned in a full-screen dead end.
    void exitExamFullscreen();
    postAttempt(true, reason);
    if (strict) postProctor({ action: "end", status: "submitted" }); // server keeps the locked state; this just closes the clock
  }, [postAttempt, postProctor, strict]);

  // A single funnel for guard + camera integrity signals.
  const handleEvent = useCallback((ev: GuardEvent, source: "guard" | "camera") => {
    if (strict && startedAt !== null) {
      postProctor({ action: "event", events: [{ type: ev.type, reason: ev.reason, terminal: ev.terminal, source }] });
    }
    if (!ev.terminal) flagsRef.current += 1;
    if (ev.terminal) seize(ev.reason);
  }, [strict, startedAt, postProctor, seize]);

  useExamGuard({
    active: running,
    mode: integrity,
    onViolation: () => { /* handled via onEvent funnel */ },
    onEvent: (ev) => handleEvent(ev, "guard"),
  });

  // Finish answering to upload safely: stop the clock, freeze answers, disarm
  // the guard + camera (running becomes false), and record responses now.
  const completeTask = useCallback(() => {
    if (taskCompleted || submitted || voided) return;
    setTaskCompleted(true);
    // They are about to go and find a file: drop full-screen along with the
    // guard so the file picker and other apps are reachable.
    void exitExamFullscreen();
    postAttempt(false, null);
    if (strict) postProctor({ action: "end", status: "task_completed" });
  }, [taskCompleted, submitted, voided, postAttempt, postProctor, strict]);

  const submit = useCallback((timeUp = false) => {
    setSubmitted(true);
    void exitExamFullscreen();
    const rev: Record<string, boolean> = {};
    questions.forEach((q) => { if (!isMcq(q) && !strict) rev[q.id] = true; });
    setRevealed((r) => ({ ...r, ...rev }));
    postAttempt(false, null);
    if (strict) postProctor({ action: "end", status: "submitted" });
    if (allocationId) fetch("/api/exam-lab/allocations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: allocationId, action: "submitted" }) }).catch(() => {});
    if (!timeUp) setTimeout(() => topRef.current?.querySelector(".pr-result")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }, [questions, strict, postAttempt, postProctor, allocationId]);

  // tick the countdown
  useEffect(() => {
    if (!clockRunning) return;
    const iv = setInterval(() => {
      setRemaining((s) => {
        const n = s - 1;
        if (!paceFired.current && totalSec > 15 * 60 && n <= 15 * 60) {
          paceFired.current = true;
          setPaceAlert(true);
          setTimeout(() => setPaceAlert(false), 3000);
        }
        if (n <= 0) return 0;
        return n;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [clockRunning, totalSec]);

  // auto-submit when time is up
  useEffect(() => {
    if (!openPractice && timed && lockOnExpiry && begun && startedAt !== null && remaining <= 0 && !submitted && !voided) submit(true);
  }, [openPractice, remaining, timed, lockOnExpiry, begun, startedAt, submitted, voided, submit]);

  // Active question = the one at the viewport centre.
  useEffect(() => {
    if (loading || submitted || !begun) return;
    const pick = () => {
      const centerY = window.innerHeight / 2;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const q of questions) {
        const el = liRefs.current[q.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        if (r.top <= centerY && r.bottom >= centerY) { best = q.id; break; }
        const dist = Math.min(Math.abs(r.top - centerY), Math.abs(r.bottom - centerY));
        if (dist < bestDist) { bestDist = dist; best = q.id; }
      }
      if (best !== activeIdRef.current) { activeIdRef.current = best; setActiveId(best); }
    };
    pick();
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(pick); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const iv = setInterval(pick, 1000);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); clearInterval(iv); cancelAnimationFrame(raf); };
  }, [loading, submitted, begun, questions]);

  // Accumulate time on the active question. Open Practice deliberately does
  // not auto-advance or lock at the recommended budget.
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const id = activeIdRef.current;
      if (!id || pausedQuestions.has(id) || document.visibilityState === "hidden") return;
      setPerQ((prev) => {
        const next = { ...prev, [id]: (prev[id] || 0) + 1 };
        const budget = qBudget[id] || 90;
        if (!openPractice && next[id] >= budget) {
          // Question just expired — auto-scroll to the next unanswered, unlocked question.
          requestAnimationFrame(() => {
            const idx = questions.findIndex((q) => q.id === id);
            for (let j = idx + 1; j < questions.length; j++) {
              const nq = questions[j];
              if ((next[nq.id] || 0) < (qBudget[nq.id] || 90)) {
                liRefs.current[nq.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
                break;
              }
            }
          });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [running, pausedQuestions, openPractice, questions, qBudget]);

  async function beginStrict() {
    if (!consent || !camStatus?.calibrated) return;
    // Open the forensic session, then start the clock.
    postProctor({ action: "start", kind, integrity, cameraConsent: true, meta: { title, subtitle, code: logMeta?.code, ref: logMeta?.ref, paperType: logMeta?.paperType } });
    // Refusal is survivable — a proctored test still starts, and the guard's
    // existing fullscreen_exit rule only bites once full-screen was granted.
    await requestExamFullscreen();
    setBegun(true);
  }

  async function markMaxwell(id: string) {
    if (strict) return; // help is locked in a proctored test
    const answer = (structAnswers[id] || "").trim();
    if (answer.length < 3) { setMaxwell((m) => ({ ...m, [id]: { error: "Write your answer first." } })); return; }
    setMaxwell((m) => ({ ...m, [id]: { loading: true } }));
    try {
      const res = await fetch("/api/exam-lab/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, answer }) });
      const j = await res.json();
      if (!res.ok) setMaxwell((m) => ({ ...m, [id]: { error: j.error || "Marking failed." } }));
      else setMaxwell((m) => ({ ...m, [id]: { awarded: j.awarded, outOf: j.outOf, feedback: j.feedback, points: j.points } }));
    } catch { setMaxwell((m) => ({ ...m, [id]: { error: "Network error." } })); }
  }

  function toggleReveal(id: string) {
    if (strict) return; // mark-scheme reveal is locked in a proctored test
    setRevealed((r) => {
      const turningOn = !r[id];
      if (turningOn) {
        revealsRef.current += 1;
        if (!help) flagsRef.current += 1; // used help in a no-help assignment
        if (startedAt !== null && (strict || kind !== "practice")) {
          postProctor({ action: "event", events: [{ type: "reveal_ms", reason: "Revealed the mark scheme.", terminal: false, source: "system" }] });
        }
      }
      return { ...r, [id]: !r[id] };
    });
  }

  const mcqs = questions.filter(isMcq);
  const got = mcqs.reduce((s, q) => s + (submitted && q.answer && answers[q.id] === "ABCD".indexOf(q.answer) ? 1 : 0), 0);
  const structCount = questions.length - mcqs.length;
  const structMarks = questions.filter((q) => !isMcq(q)).reduce((s, q) => s + (q.marks || 0), 0);
  const pct = mcqs.length ? Math.round((got / mcqs.length) * 100) : 0;

  const watermark = useMemo(() => {
    const txt = `physics@sjabrankamran.com`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='10' y='120' transform='rotate(-22 180 100)' font-family='monospace' font-size='15' fill='%23ffffff'>${encodeURIComponent(txt).replace(/'/g, "%27")}</text></svg>`;
    return `url("data:image/svg+xml,${svg}")`;
  }, []);

  const camPhase: "preview" | "live" | "off" = !strict ? "off" : voided || submitted || taskCompleted ? "off" : begun ? "live" : "preview";

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-fog">
        <Loader2 className="animate-spin text-cyan" size={18} /> Loading exact past-paper images…
      </div>
    );
  }
  if (err) {
    return <div className="rounded-2xl border border-signal/40 bg-signal/[0.06] p-6 text-signal">Couldn’t load images: {err}. Try again.</div>;
  }

  // ---- STRICT camera gate (before the test begins) ----
  if (strict && !begun && !voided) {
    return (
      <div ref={topRef}>
        {camPhase !== "off" && <ProctorCamera phase="preview" onStatus={(s) => setCamStatus({ ready: s.ready, faceOk: s.faceOk, calibrated: s.calibrated })} />}
        <div className="mx-auto max-w-lg rounded-3xl border border-cyan/30 bg-gradient-to-b from-space/80 to-abyss p-7">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-cyan/40 bg-cyan/10 text-cyan"><Video size={26} /></div>
          <h3 className="text-center font-display text-xl font-bold text-ice">Proctored test — camera required</h3>
          <p className="mx-auto mt-2 max-w-md text-center text-sm text-fog">{title}{subtitle ? ` · ${subtitle}` : ""}</p>
          <div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-fog">
            <p className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald2" /> <span>This is a formal, invigilated test. Your camera stays on and an AI proctor watches for integrity — all analysis runs <b>on your device</b>; no video is stored or uploaded.</span></p>
            <p className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-300" /> <span>The test <b>cancels and locks</b> if you leave full-screen, switch tabs, minimise, split-screen, screenshot, or if another person appears / you leave the frame. A locked test can only be re-opened by a super-admin after review.</span></p>
            <p className="flex items-start gap-2"><Lock size={16} className="mt-0.5 shrink-0 text-cyan" /> <span>Mark schemes are locked during the test.</span></p>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-fog">
            <p className="mb-1 font-semibold text-ice">Get in position before you start</p>
            <ol className="list-decimal space-y-1 pl-5 text-[13px]">
              <li>Sit centred, face the screen in good light, only <b>you</b> in frame.</li>
              <li>Put away phones and notes — the proctor scans for them.</li>
              <li>Your position is approved <b>automatically</b> — wait for <b className="text-emerald2">Position approved ✓</b> on the camera window.</li>
              <li>Looking <b>down at your desk to write</b> your answer script is fine — that won’t be flagged. Turning left/right/up will warn you.</li>
            </ol>
          </div>
          <div className={"mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs " + (camStatus?.calibrated ? "border-emerald2/40 text-emerald2" : "border-amber-400/40 text-amber-200")}>
            {camStatus?.calibrated ? <ScanText size={14} /> : <Loader2 size={14} className="animate-spin" />}
            {camStatus?.calibrated ? "Position approved — you're ready to begin." : camStatus?.ready ? "Camera on — hold still, approving your position…" : "Waiting for camera… allow access in your browser."}
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-fog">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan" />
            <span>I consent to on-device camera monitoring and facial-attention scanning for the duration of this test, and I understand the integrity rules above.</span>
          </label>
          <div className="mt-5 flex items-center justify-center gap-3">
            {onExit && <button onClick={onExit} className="btn-ghost !px-4 !py-2 text-sm"><ArrowLeft size={14} /> Not now</button>}
            <button onClick={beginStrict} disabled={!consent || !camStatus?.calibrated} className="btn-primary disabled:opacity-40"><Video size={15} /> Begin test</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- SEIZED: standard drill cancelled ----
  if (voided && !strict) {
    return (
      <div ref={topRef}>
        <div className="rounded-3xl border border-red-500/40 bg-gradient-to-b from-red-950/60 to-abyss p-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-red-500/50 bg-red-500/10"><ShieldAlert className="text-red-400" size={30} /></div>
          <h3 className="font-display text-2xl font-black text-red-400">Drill cancelled</h3>
          <p className="mx-auto mt-3 max-w-md text-sm text-fog">Your attempt was terminated due to <b className="text-red-300">unethical means of attempting the paper</b>.</p>
          <p className="mx-auto mt-1 max-w-md font-mono text-xs text-dust">{voided}</p>
          <p className="mx-auto mt-4 max-w-md text-xs text-dust">No-help drills must be sat in a single, full-screen window — no minimising, tab-switching, split-screen or screenshots once the timer begins.</p>
          <button onClick={onExit} className="btn-primary mx-auto mt-6"><ArrowLeft size={15} /> Back to Exam Lab</button>
        </div>
      </div>
    );
  }

  // ---- SEIZED: strict test LOCKED (needs super-admin review) ----
  if (voided && strict) {
    return <TestLocked reason={voided} attemptId={attemptIdRef.current} onExit={onExit} />;
  }

  return (
    <div ref={topRef} className={running ? "el-exam-live relative" : "relative"}>
      {camPhase === "live" && (
        <ProctorCamera
          phase="live"
          onStatus={(s) => setCamStatus({ ready: s.ready, faceOk: s.faceOk, calibrated: s.calibrated })}
          onEvent={(ev) => handleEvent(ev, "camera")}
          onSnapshot={(dataUrl, reason) => postProctor({ action: "snapshot", dataUrl, reason })}
        />
      )}

      {paceAlert && (
        <div className="el-pace-alert">
          <div>
            <b>15:00</b>
            <p className="mt-4 font-display text-xl font-bold uppercase tracking-widest text-red-300">Minutes remaining — pace up</p>
          </div>
        </div>
      )}

      {running && <div className="el-watermark" style={{ backgroundImage: watermark }} aria-hidden />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onExit && <button onClick={onExit} className="btn-ghost !px-3 !py-1.5 text-xs"><ArrowLeft size={13} /> Back</button>}
          <div>
            <h3 className="font-display text-lg text-ice">{title}</h3>
            {subtitle && <p className="font-mono text-xs text-dust">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {openPractice ? <span className="rounded-xl border border-emerald2/30 px-3 py-1.5 font-mono text-xs text-emerald2">Practice · no deadline</span> : timed && startedAt !== null && !submitted && <ClockPill left={remaining} warn={remaining <= 15 * 60} />}
          {fsAvailable && !fsOn && !submitted && !taskCompleted && (
            <button onClick={() => { void requestExamFullscreen(); }} className="btn-ghost !px-3 !py-1.5 text-xs el-noprint" title="Sit this paper full-screen">
              <Maximize2 size={13} /> Full screen
            </button>
          )}
          {submitted && <button onClick={() => window.print()} className="btn-ghost !px-3 !py-1.5 text-xs el-noprint"><Printer size={13} /> PDF</button>}
        </div>
      </div>

      {running && integrity !== "off" && (
        <div className={"el-noprint mb-4 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs " + (strict ? "border-red-400/30 bg-red-400/[0.05] text-red-200/90" : "border-amber-400/25 bg-amber-400/[0.05] text-amber-200/90")}>
          <ShieldAlert size={14} className={strict ? "text-red-300" : "text-amber-300"} />
          {strict
            ? "Proctored TEST in progress — camera on. Leaving full-screen, tab-switching, split-screen, screenshots, or another face in frame will cancel & lock the test."
            : "Proctored drill in progress — do not minimise, switch tabs, split-screen or screenshot, or the drill is cancelled."}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 font-mono text-[11px] text-dust">
        <span className="rounded-full border border-white/10 px-2.5 py-0.5">{questions.length} questions</span>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5">{totalMarks} marks</span>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5">exact CAIE images · diagrams included</span>
        {kind !== "practice" && <span className="rounded-full border border-cyan/25 px-2.5 py-0.5 text-cyan">{kind === "test" ? "Test" : help ? "Assignment · help allowed" : "Assignment · no help"}</span>}
      </div>

      {submitted && (
        <div className="pr-result mb-5 flex flex-wrap items-center gap-5 rounded-2xl border border-white/15 bg-gradient-to-r from-cyan/10 to-violet2/10 p-5">
          {mcqs.length > 0 && (
            <div className="grid h-24 w-24 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(#3DE1F0 ${pct}%, rgba(255,255,255,.08) 0)` }}>
              <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-abyss text-center">
                <div><b className="font-display text-xl text-ice">{pct}%</b><span className="block font-mono text-[9px] text-dust">MCQ</span></div>
              </div>
            </div>
          )}
          <div>
            <h4 className="flex items-center gap-2 font-display text-lg"><CheckCircle2 size={18} className="text-emerald2" /> Submitted</h4>
            <p className="mt-1 text-sm text-fog">
              {mcqs.length > 0 && <>Multiple choice: <b className="text-ice">{got} / {mcqs.length}</b>.</>}
              {structCount > 0 && <> &nbsp;{structCount} structured ({structMarks} marks){strict ? " — your teacher will mark these." : " — mark yourself against the official mark schemes shown under each."}</>}
            </p>
          </div>
        </div>
      )}

      {taskCompleted && !submitted && (
        <div className="el-noprint mb-4 flex items-start gap-2 rounded-xl border border-emerald2/30 bg-emerald2/[0.06] px-4 py-3 text-sm text-emerald2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span><b>Task completed — time stopped.</b> You can now switch tabs or open other apps to pick your file, and upload it below <b>without your test locking</b>. Your answers are locked from further changes. Tap <b>Submit</b> when you’ve finished uploading.</span>
        </div>
      )}

      {(submitted || taskCompleted) && logMeta && startedAt !== null && (
        <ScriptUpload logMeta={logMeta} startedAt={startedAt} durationSec={totalSec} />
      )}

      <ol className="space-y-8">
        {questions.map((q, i) => {
          const chosen = answers[q.id];
          const ai = q.answer ? "ABCD".indexOf(q.answer) : -1;
          const expSec = questionSeconds({ paper: q.paperType, difficulty: q.level, marks: q.marks });
          const spentSec = perQ[q.id] || 0;
          const overTime = spentSec > expSec;
          const isActive = !submitted && activeId === q.id;
          const questionPaused = pausedQuestions.has(q.id);
          return (
            <li key={q.id} ref={(el) => { liRefs.current[q.id] = el; }} data-qid={q.id} className={"pr-q rounded-2xl border p-4 md:p-5 transition-colors " + (isActive ? "border-cyan/45 bg-cyan/[0.04]" : "border-white/[0.08] bg-white/[0.015]")}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-slate2 font-display text-sm font-bold text-ice">{i + 1}</span>
                {q.topic && <span className="rounded-full border border-cyan/30 px-2.5 py-0.5 font-mono text-[10px] text-cyan">{q.topic}</span>}
                <span className={"rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (q.level === "LOT" ? "border-emerald2/40 text-emerald2" : "border-magenta/40 text-magenta")}>{q.level}</span>
                <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-fog">{q.paperType}</span>
                <span title="Time budget for this question" className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-dust"><Timer size={10} /> {formatDuration(expSec)}</span>
                {!submitted ? (
                  <span title={openPractice ? (overTime ? "Recommended time passed — keep working; overtime is recorded" : isActive ? "Recommended time; keep working if needed" : "Recommended time starts when this question is on screen") : qLocked(q.id) ? "Time expired — answer locked" : isActive ? "Counting down" : "Countdown starts when this question is on screen"}
                    className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (questionPaused ? "border-amber-400/60 bg-amber-400/10 text-amber-300" : qLocked(q.id) ? "border-signal/60 bg-signal/10 text-signal" : overTime ? "border-signal/50 text-signal" : isActive ? "border-cyan/60 text-cyan" : "border-white/10 text-fog")}>
                    {questionPaused ? <Pause size={10} /> : qLocked(q.id) ? <Lock size={10} /> : isActive ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
                    {questionPaused ? `Paused · ${formatDuration(Math.max(0, expSec - spentSec))}` : qLocked(q.id) ? "Locked" : overTime ? `+${formatDuration(spentSec - expSec)}` : formatDuration(Math.max(0, expSec - spentSec))}
                  </span>
                ) : (
                  <span title="Time you spent vs expected" className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (overTime ? "border-signal/40 text-signal" : "border-emerald2/40 text-emerald2")}>{formatDuration(spentSec)} / {formatDuration(expSec)}</span>
                )}
                {canPause && startedAt !== null && !submitted && !voided && !qLocked(q.id) && (
                  <button
                    type="button"
                    onClick={() => toggleQuestionPause(q.id)}
                    title={questionPaused ? `Resume the timer for question ${i + 1}` : `Pause only the timer for question ${i + 1}`}
                    className={"el-noprint inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition " + (questionPaused ? "border-emerald2/50 bg-emerald2/10 text-emerald2" : "border-amber-400/40 bg-amber-400/[0.06] text-amber-300 hover:border-amber-300")}>
                    {questionPaused ? <><Play size={10} /> Resume Q{i + 1}</> : <><Pause size={10} /> Pause Q{i + 1}</>}
                  </button>
                )}
                {q.marks != null && <span className="ml-auto font-mono text-xs text-dust">[{q.marks}]</span>}
              </div>

              {isMcq(q) || answerMode[q.id] !== "write" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[q.img]} alt={`Question ${q.qnum}`} className="w-full rounded-lg border border-white/10 bg-white" loading="lazy" draggable={false} />
              ) : null}

              {isMcq(q) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {["A", "B", "C", "D"].map((L, k) => {
                    const isCorrect = submitted && !strict && k === ai;
                    const isWrong = submitted && !strict && chosen === k && k !== ai;
                    return (
                      <button
                        key={L}
                        disabled={submitted || taskCompleted || qLocked(q.id)}
                        onClick={() => { if (!qLocked(q.id) && !taskCompleted) setAnswers((a) => ({ ...a, [q.id]: k })); }}
                        className={
                          "h-10 w-12 rounded-lg border font-display text-base font-bold transition " +
                          (isCorrect ? "border-emerald2 bg-emerald2 text-space" :
                           isWrong ? "border-signal bg-signal/20 text-signal" :
                           chosen === k ? "border-cyan bg-cyan text-space" : "border-white/20 text-fog hover:border-cyan")
                        }
                      >
                        {L}
                      </button>
                    );
                  })}
                  {submitted && !strict && q.answer && (
                    <span className="ml-2 self-center font-mono text-xs text-lime2">Answer: {q.answer}</span>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <AnswerPad
                    value={structAnswers[q.id] || ""}
                    onChange={(v) => setStructAnswers((s) => ({ ...s, [q.id]: v }))}
                    imageUrl={urls[q.img]}
                    qid={q.id}
                    code={logMeta?.code || logMeta?.ref || "exam"}
                    disabled={submitted || taskCompleted}
                    onModeChange={(m) => setAnswerMode((s) => ({ ...s, [q.id]: m }))}
                  />
                  {strict ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-dust el-noprint"><Lock size={12} className="text-cyan" /> Marking &amp; mark schemes are locked during a proctored test.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2 el-noprint">
                      <button onClick={() => markMaxwell(q.id)} disabled={maxwell[q.id]?.loading} className="btn-primary !px-3.5 !py-1.5 text-xs disabled:opacity-50">
                        {maxwell[q.id]?.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Mark with Maxwell
                      </button>
                      <button onClick={() => toggleReveal(q.id)} className="btn-ghost !px-3 !py-1.5 text-xs">
                        <Eye size={13} /> {revealed[q.id] ? "Hide" : "Reveal"} mark scheme
                      </button>
                    </div>
                  )}
                  {!strict && maxwell[q.id]?.error && <p className="mt-2 text-xs text-signal">{maxwell[q.id]?.error}</p>}
                  {!strict && maxwell[q.id]?.awarded != null && (
                    <div className="mt-3 rounded-xl border border-violet2/30 bg-violet2/[0.06] p-3">
                      <p className="flex items-center gap-2 font-display text-sm text-ice">
                        <Sparkles size={14} className="text-violet2" /> Maxwell: <b className="text-violet2">{maxwell[q.id]?.awarded}/{maxwell[q.id]?.outOf}</b>
                      </p>
                      {maxwell[q.id]?.feedback && <p className="mt-1 text-sm text-fog">{maxwell[q.id]?.feedback}</p>}
                      {!!maxwell[q.id]?.points?.length && (
                        <ul className="mt-2 space-y-1">
                          {maxwell[q.id]!.points!.map((pt, k) => (
                            <li key={k} className="flex gap-2 text-xs text-fog">
                              <span className={pt.earned ? "text-emerald2" : "text-signal"}>{pt.earned ? "✓" : "✗"}</span>
                              <span>{pt.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {!strict && revealed[q.id] && q.ms_img && urls[q.ms_img] && (
                    <div className="mt-3">
                      <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-cyan">Official mark scheme</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls[q.ms_img]} alt={`Mark scheme ${q.qnum}`} className="w-full rounded-lg border border-cyan/30 bg-white" loading="lazy" draggable={false} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-col items-center gap-2 el-noprint">
        {!submitted ? (
          <>
            <div className="flex flex-wrap justify-center gap-3">
              {integrity !== "off" && !taskCompleted && (
                <button onClick={completeTask} className="btn-ghost !border-emerald2/50 !text-emerald2"><CheckCircle2 size={16} /> Task completed — let me upload</button>
              )}
              <button onClick={() => submit(false)} className="btn-primary"><CheckCircle2 size={16} /> {strict ? "Submit test" : "Submit & mark"}</button>
            </div>
            {integrity !== "off" && !taskCompleted && (
              <p className="max-w-md text-center text-[11px] text-dust">To upload any attachment without your task being locked, click <b className="text-emerald2">Task completed</b> first — the timer stops and you can safely switch tabs to pick your file.</p>
            )}
          </>
        ) : onExit ? (
          <button onClick={onExit} className="btn-ghost"><RotateCcw size={16} /> Choose another</button>
        ) : null}
      </div>
    </div>
  );
}

function TestLocked({ reason, attemptId, onExit }: { reason: string; attemptId: string; onExit?: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function requestReview() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/exam-lab/proctor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unlock-request", attemptId, note }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Could not send your request.");
      setSent(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-gradient-to-b from-red-950/60 to-abyss p-8 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-red-500/50 bg-red-500/10"><Lock className="text-red-400" size={28} /></div>
        <h3 className="font-display text-2xl font-black text-red-400">Test locked</h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-fog">Your test was cancelled and <b className="text-red-300">locked</b> by the AI proctor. It can only be re-opened by a super-admin after reviewing the forensic record.</p>
        <p className="mx-auto mt-1 max-w-md font-mono text-xs text-dust">{reason}</p>

        {sent ? (
          <div className="mx-auto mt-5 max-w-md rounded-2xl border border-emerald2/30 bg-emerald2/[0.06] p-4 text-sm text-emerald2">
            <CheckCircle2 size={16} className="mx-auto mb-1" /> Review request sent. Your teacher / super-admin will look into it and can re-open the test for you.
          </div>
        ) : (
          <div className="mx-auto mt-5 max-w-md text-left">
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Request a review (optional note)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Explain what happened (e.g. the page went full-screen off, a sibling walked in)…" className="w-full resize-none rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
            {err ? <p className="mt-1 text-xs text-signal">{err}</p> : null}
            <div className="mt-3 flex items-center justify-center gap-3">
              {onExit && <button onClick={onExit} className="btn-ghost !px-4 !py-2 text-sm"><ArrowLeft size={14} /> Back</button>}
              <button onClick={requestReview} disabled={busy} className="btn-primary disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Request review</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClockPill({ left, warn }: { left: number; warn?: boolean }) {
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return (
    <div
      className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm"
      style={{ color: left === 0 ? "#FF7A2F" : warn ? "#FF4D4D" : "#3DE1F0", borderColor: warn ? "rgba(255,77,77,.5)" : "rgba(255,255,255,.15)" }}
    >
      <Clock size={13} />
      {h > 0 ? `${h}:` : ""}{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </div>
  );
}

function ScriptUpload({ logMeta, startedAt, durationSec }: { logMeta: LogMeta; startedAt: number; durationSec: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: "ontime" | "late"; path: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  const deadline = startedAt + (durationSec + 300) * 1000;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const windowLeft = Math.max(0, Math.round((deadline - now) / 1000));

  const EXT_CT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", heif: "image/heif", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  async function upload() {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!EXT_CT[ext]) {
      setMsg("Attach a PDF, image (JPG/PNG/WebP/HEIC) or Word document.");
      return;
    }
    const contentType = file.type || EXT_CT[ext];
    setBusy(true);
    setMsg(null);
    try {
      const sign = await fetch("/api/exam-lab/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: logMeta.mode, paperType: logMeta.paperType, code: logMeta.code, ref: logMeta.ref,
          startedAt, durationSec, ext,
        }),
      });
      const j = await sign.json();
      if (!sign.ok) throw new Error(j.error || "Upload not authorised.");
      const put = await fetch(j.signedUrl, { method: "PUT", headers: { "content-type": contentType }, body: file });
      if (!put.ok) throw new Error("Upload failed — please retry.");
      setResult({ status: j.status, path: j.path });
      setMsg(
        j.status === "late"
          ? "Uploaded but marked LATE — this is outside the allowed window (exam time + 5 min) and is flagged as malpractice in the upload folder."
          : "Answer script uploaded on time."
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function readIt() {
    if (!result) return;
    setReading(true);
    setTranscript(null);
    try {
      const r = await fetch("/api/exam-lab/read-script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: result.path }),
      });
      const j = await r.json();
      if (!r.ok) setTranscript(`⚠️ ${j.error || "Could not read the script."}`);
      else setTranscript(j.text);
    } catch {
      setTranscript("⚠️ Network error.");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="el-noprint mb-6 rounded-2xl border border-cyan/20 bg-cyan/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-sm text-ice"><Upload size={15} className="text-cyan" /> Upload your answer script or attachment</p>
        <span className={"flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] " + (windowLeft > 0 ? "border-emerald2/40 text-emerald2" : "border-signal/50 text-signal")}>
          <TimerReset size={12} /> {windowLeft > 0 ? `window closes in ${Math.floor(windowLeft / 60)}:${String(windowLeft % 60).padStart(2, "0")}` : "upload window closed"}
        </span>
      </div>
      <p className="mt-1 text-xs text-dust">
        Attach your answers as a PDF, a photo (JPG/PNG/WebP/HEIC) or a Word document, within the window (exam time + 5 minutes). Later uploads are accepted but flagged <b className="text-signal">late / malpractice</b>.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="btn-ghost !px-3 !py-1.5 cursor-pointer text-xs">
          <FileText size={13} /> {file ? file.name.slice(0, 28) : "Choose file"}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.doc,.docx,application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={upload} disabled={!file || busy || !!result} className="btn-primary !px-3.5 !py-1.5 text-xs disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload script
        </button>
        {result && (
          <button onClick={readIt} disabled={reading} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
            {reading ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />} Read my handwriting
          </button>
        )}
      </div>
      {msg && <p className={"mt-2 text-xs " + (result?.status === "late" ? "text-signal" : "text-emerald2")}>{msg}</p>}
      {transcript && (
        <div className="mt-3 rounded-xl border border-violet2/25 bg-violet2/[0.05] p-3">
          <p className="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-violet2"><ScanText size={12} /> Maxwell read your script</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs text-fog">{transcript}</pre>
        </div>
      )}
    </div>
  );
}
