"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, CheckCircle2, Eye, RotateCcw, Printer, Clock, ArrowLeft, Sparkles,
  ShieldAlert, Upload, FileText, ScanText, TimerReset, Timer,
} from "lucide-react";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";
import { questionSeconds, formatDuration } from "@/lib/portal/timing";
import { useExamGuard } from "./use-exam-guard";

type UrlMap = Record<string, string>;
type LogMeta = { mode: "paper" | "drill"; code?: string; ref?: string; paperType: "P1" | "P2" | "P4" | "mixed" };

export function PaperRunner({
  questions,
  title,
  subtitle,
  timed = true,
  duration = 60,
  onExit,
  logMeta,
}: {
  questions: ImgQuestion[];
  title: string;
  subtitle?: string;
  timed?: boolean;
  duration?: number; // minutes
  onExit?: () => void;
  logMeta?: LogMeta;
}) {
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
  const [remaining, setRemaining] = useState(duration * 60);
  const [paceAlert, setPaceAlert] = useState(false);
  const paceFired = useRef(false);
  const [voided, setVoided] = useState<string | null>(null);
  const totalSec = duration * 60;

  // ---- per-question time tracking (starts when a question is on screen) ----
  const [perQ, setPerQ] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const liRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const isMcq = (q: ImgQuestion) => q.paperType === "P1";
  const totalMarks = useMemo(() => questions.reduce((s, q) => s + (q.marks || 0), 0), [questions]);

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
    return () => {
      alive = false;
    };
  }, [questions]);

  // start the clock once the paper is on screen
  useEffect(() => {
    if (!loading && !err && startedAt === null) setStartedAt(Date.now());
  }, [loading, err, startedAt]);

  const running = timed && startedAt !== null && !submitted && !voided && remaining > 0;

  const submit = useCallback((timeUp = false) => {
    setSubmitted(true);
    const rev: Record<string, boolean> = {};
    questions.forEach((q) => {
      if (!isMcq(q)) rev[q.id] = true;
    });
    setRevealed((r) => ({ ...r, ...rev }));
    if (logMeta) {
      const qlog = questions.map((q) => {
        const ai = q.answer ? "ABCD".indexOf(q.answer) : -1;
        const mcq = isMcq(q);
        const earned = mcq ? (answers[q.id] === ai ? q.marks || 1 : 0) : (maxwell[q.id]?.awarded ?? null);
        return { id: q.id, topic: q.topic, level: q.level, paperType: q.paperType, marks: q.marks || 1, earned: earned as number | null, correct: mcq ? answers[q.id] === ai : null, spentSec: perQ[q.id] ?? null, expectedSec: questionSeconds({ paper: q.paperType, difficulty: q.level, marks: q.marks }) };
      });
      const scored = qlog.filter((q) => q.earned !== null);
      const score = scored.reduce((s, q) => s + (q.earned || 0), 0);
      const totalScored = scored.reduce((s, q) => s + q.marks, 0);
      fetch("/api/exam-lab/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: logMeta.mode, paperType: logMeta.paperType, code: logMeta.code, ref: logMeta.ref,
          score, total: totalScored, qCount: questions.length, scoredCount: scored.length,
          durationSec: startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined, questions: qlog,
        }),
      }).catch(() => {});
    }
    if (!timeUp) setTimeout(() => topRef.current?.querySelector(".pr-result")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }, [answers, maxwell, questions, logMeta, startedAt, perQ]);

  // tick the countdown
  useEffect(() => {
    if (!running) return;
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
  }, [running, totalSec]);

  // auto-submit when time is up
  useEffect(() => {
    if (timed && startedAt !== null && remaining <= 0 && !submitted && !voided) submit(true);
  }, [remaining, timed, startedAt, submitted, voided, submit]);

  // Track which question is most visible → that's the one being worked on.
  useEffect(() => {
    if (loading || submitted) return;
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.qid;
          if (id) ratios.set(id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let best: string | null = null;
        let bestR = 0.15; // must be at least ~15% on screen to count as "active"
        for (const [id, r] of ratios) if (r > bestR) { bestR = r; best = id; }
        activeIdRef.current = best;
        setActiveId(best);
      },
      { threshold: [0, 0.15, 0.35, 0.6, 0.85, 1] }
    );
    questions.forEach((q) => { const el = liRefs.current[q.id]; if (el) io.observe(el); });
    return () => io.disconnect();
  }, [loading, submitted, questions]);

  // Accumulate time on the active question (pauses when tab hidden / not running).
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const id = activeIdRef.current;
      if (!id || document.visibilityState === "hidden") return;
      setPerQ((m) => ({ ...m, [id]: (m[id] || 0) + 1 }));
    }, 1000);
    return () => clearInterval(iv);
  }, [running]);

  const seize = useCallback((reason: string) => {
    setVoided(reason);
  }, []);
  useExamGuard({ active: running, onViolation: seize });

  async function markMaxwell(id: string) {
    const answer = (structAnswers[id] || "").trim();
    if (answer.length < 3) {
      setMaxwell((m) => ({ ...m, [id]: { error: "Write your answer first." } }));
      return;
    }
    setMaxwell((m) => ({ ...m, [id]: { loading: true } }));
    try {
      const res = await fetch("/api/exam-lab/mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, answer }),
      });
      const j = await res.json();
      if (!res.ok) setMaxwell((m) => ({ ...m, [id]: { error: j.error || "Marking failed." } }));
      else setMaxwell((m) => ({ ...m, [id]: { awarded: j.awarded, outOf: j.outOf, feedback: j.feedback, points: j.points } }));
    } catch {
      setMaxwell((m) => ({ ...m, [id]: { error: "Network error." } }));
    }
  }

  const mcqs = questions.filter(isMcq);
  const got = mcqs.reduce((s, q) => s + (submitted && q.answer && answers[q.id] === "ABCD".indexOf(q.answer) ? 1 : 0), 0);
  const structCount = questions.length - mcqs.length;
  const structMarks = questions.filter((q) => !isMcq(q)).reduce((s, q) => s + (q.marks || 0), 0);
  const pct = mcqs.length ? Math.round((got / mcqs.length) * 100) : 0;

  const watermark = useMemo(() => {
    // Ownership/branding watermark tiled across the live exam.
    const txt = `physics@sjabrankamran.com`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='10' y='120' transform='rotate(-22 180 100)' font-family='monospace' font-size='15' fill='%23ffffff'>${encodeURIComponent(txt).replace(/'/g, "%27")}</text></svg>`;
    return `url("data:image/svg+xml,${svg}")`;
  }, []);

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

  // ---- SEIZED: malpractice ----
  if (voided) {
    return (
      <div ref={topRef}>
        <div className="rounded-3xl border border-red-500/40 bg-gradient-to-b from-red-950/60 to-abyss p-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-red-500/50 bg-red-500/10">
            <ShieldAlert className="text-red-400" size={30} />
          </div>
          <h3 className="font-display text-2xl font-black text-red-400">Drill cancelled</h3>
          <p className="mx-auto mt-3 max-w-md text-sm text-fog">
            Your attempt was terminated due to <b className="text-red-300">unethical means of attempting the paper</b>.
          </p>
          <p className="mx-auto mt-1 max-w-md font-mono text-xs text-dust">{voided}</p>
          <p className="mx-auto mt-4 max-w-md text-xs text-dust">
            Exam Lab drills must be sat in a single, full-screen window — no minimising, tab-switching, split-screen or screenshots once the timer begins.
          </p>
          <button onClick={onExit} className="btn-primary mx-auto mt-6"><ArrowLeft size={15} /> Back to Exam Lab</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef} className={running ? "el-exam-live relative" : "relative"}>
      {/* 15-minutes-left pace alert */}
      {paceAlert && (
        <div className="el-pace-alert">
          <div>
            <b>15:00</b>
            <p className="mt-4 font-display text-xl font-bold uppercase tracking-widest text-red-300">Minutes remaining — pace up</p>
          </div>
        </div>
      )}

      {/* forensic identity watermark while the drill is live */}
      {running && <div className="el-watermark" style={{ backgroundImage: watermark }} aria-hidden />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onExit && (
            <button onClick={onExit} className="btn-ghost !px-3 !py-1.5 text-xs"><ArrowLeft size={13} /> Back</button>
          )}
          <div>
            <h3 className="font-display text-lg text-ice">{title}</h3>
            {subtitle && <p className="font-mono text-xs text-dust">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {timed && startedAt !== null && !submitted && <ClockPill left={remaining} warn={remaining <= 15 * 60} />}
          {submitted && (
            <button onClick={() => window.print()} className="btn-ghost !px-3 !py-1.5 text-xs el-noprint"><Printer size={13} /> PDF</button>
          )}
        </div>
      </div>

      {running && (
        <div className="el-noprint mb-4 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-3.5 py-2 text-xs text-amber-200/90">
          <ShieldAlert size={14} className="text-amber-300" />
          Proctored drill in progress — do not minimise, switch tabs, split-screen or screenshot, or the drill is cancelled.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 font-mono text-[11px] text-dust">
        <span className="rounded-full border border-white/10 px-2.5 py-0.5">{questions.length} questions</span>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5">{totalMarks} marks</span>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5">exact CAIE images · diagrams included</span>
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
              {structCount > 0 && <> &nbsp;{structCount} structured ({structMarks} marks) — mark yourself against the official mark schemes shown under each.</>}
            </p>
          </div>
        </div>
      )}

      {/* answer-script upload (after submit / time up) */}
      {submitted && logMeta && startedAt !== null && (
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
          return (
            <li key={q.id} ref={(el) => { liRefs.current[q.id] = el; }} data-qid={q.id} className={"pr-q rounded-2xl border p-4 md:p-5 transition-colors " + (isActive ? "border-cyan/45 bg-cyan/[0.04]" : "border-white/[0.08] bg-white/[0.015]")}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-slate2 font-display text-sm font-bold text-ice">{i + 1}</span>
                {q.topic && <span className="rounded-full border border-cyan/30 px-2.5 py-0.5 font-mono text-[10px] text-cyan">{q.topic}</span>}
                <span className={"rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (q.level === "LOT" ? "border-emerald2/40 text-emerald2" : "border-magenta/40 text-magenta")}>{q.level}</span>
                <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-fog">{q.paperType}</span>
                <span title="Expected time for this question (by paper & difficulty)" className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-dust"><Timer size={10} /> {formatDuration(expSec)}</span>
                {!submitted ? (
                  <span title={isActive ? "Timing this question now" : "Countdown starts when this question is on screen"} className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (overTime ? "border-signal/50 text-signal" : isActive ? "border-cyan/60 text-cyan" : "border-white/10 text-fog")}>
                    {isActive ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
                    {overTime ? `+${formatDuration(spentSec - expSec)}` : formatDuration(Math.max(0, expSec - spentSec))}
                  </span>
                ) : (
                  <span title="Time you spent vs expected" className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (overTime ? "border-signal/40 text-signal" : "border-emerald2/40 text-emerald2")}>{formatDuration(spentSec)} / {formatDuration(expSec)}</span>
                )}
                {q.marks != null && <span className="ml-auto font-mono text-xs text-dust">[{q.marks}]</span>}
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[q.img]} alt={`Question ${q.qnum}`} className="w-full rounded-lg border border-white/10 bg-white" loading="lazy" draggable={false} />

              {isMcq(q) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {["A", "B", "C", "D"].map((L, k) => {
                    const isCorrect = submitted && k === ai;
                    const isWrong = submitted && chosen === k && k !== ai;
                    return (
                      <button
                        key={L}
                        disabled={submitted}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: k }))}
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
                  {submitted && q.answer && (
                    <span className="ml-2 self-center font-mono text-xs text-lime2">Answer: {q.answer}</span>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <textarea
                    value={structAnswers[q.id] || ""}
                    onChange={(e) => setStructAnswers((s) => ({ ...s, [q.id]: e.target.value }))}
                    placeholder="Write your answer / working here…"
                    className="min-h-28 w-full resize-y rounded-xl border border-white/15 bg-void px-3.5 py-3 text-sm text-ice el-noprint"
                  />
                  <div className="mt-2 flex flex-wrap gap-2 el-noprint">
                    <button onClick={() => markMaxwell(q.id)} disabled={maxwell[q.id]?.loading} className="btn-primary !px-3.5 !py-1.5 text-xs disabled:opacity-50">
                      {maxwell[q.id]?.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Mark with Maxwell
                    </button>
                    <button onClick={() => setRevealed((r) => ({ ...r, [q.id]: !r[q.id] }))} className="btn-ghost !px-3 !py-1.5 text-xs">
                      <Eye size={13} /> {revealed[q.id] ? "Hide" : "Reveal"} mark scheme
                    </button>
                  </div>
                  {maxwell[q.id]?.error && <p className="mt-2 text-xs text-signal">{maxwell[q.id]?.error}</p>}
                  {maxwell[q.id]?.awarded != null && (
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
                  {revealed[q.id] && q.ms_img && urls[q.ms_img] && (
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

      <div className="mt-6 flex flex-wrap justify-center gap-3 el-noprint">
        {!submitted ? (
          <button onClick={() => submit(false)} className="btn-primary"><CheckCircle2 size={16} /> Submit &amp; mark</button>
        ) : onExit ? (
          <button onClick={onExit} className="btn-ghost"><RotateCcw size={16} /> Choose another</button>
        ) : null}
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

  async function upload() {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMsg("Answer scripts must be a single PDF file.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const sign = await fetch("/api/exam-lab/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: logMeta.mode, paperType: logMeta.paperType, code: logMeta.code, ref: logMeta.ref,
          startedAt, durationSec,
        }),
      });
      const j = await sign.json();
      if (!sign.ok) throw new Error(j.error || "Upload not authorised.");
      const put = await fetch(j.signedUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: file });
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
        <p className="flex items-center gap-2 font-display text-sm text-ice"><Upload size={15} className="text-cyan" /> Upload your written answer script (PDF)</p>
        <span className={"flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] " + (windowLeft > 0 ? "border-emerald2/40 text-emerald2" : "border-signal/50 text-signal")}>
          <TimerReset size={12} /> {windowLeft > 0 ? `window closes in ${Math.floor(windowLeft / 60)}:${String(windowLeft % 60).padStart(2, "0")}` : "upload window closed"}
        </span>
      </div>
      <p className="mt-1 text-xs text-dust">
        Scan or photograph your handwritten answers as one PDF and upload within the window (exam time + 5 minutes). Later uploads are accepted but flagged <b className="text-signal">late / malpractice</b>.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="btn-ghost !px-3 !py-1.5 cursor-pointer text-xs">
          <FileText size={13} /> {file ? file.name.slice(0, 28) : "Choose PDF"}
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
