"use client";

import "katex/dist/katex.min.css";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Zap, Printer, RotateCcw, Loader2, CheckCircle2, Eye, Timer as TimerIcon } from "lucide-react";
import { TOPICS } from "@/lib/exam-lab/bank";
import { normalizePhysicsMath } from "@/components/markdown-renderer";

type Q = {
  id: string;
  t: string;
  lvl: "LOT" | "HOT";
  type: "mcq" | "structured";
  paper: string;
  cmd: string;
  marks: number;
  stem: string;
  opts?: string[];
  ans?: number;
  scheme: string[];
};

function Tex({ text, block = false }: { text: string; block?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => (block ? <p className="m-0 leading-relaxed">{children}</p> : <span>{children}</span>),
        strong: ({ children }) => <strong className="font-semibold text-ice">{children}</strong>,
      }}
    >
      {normalizePhysicsMath(text)}
    </ReactMarkdown>
  );
}

type Pattern = { key: string; label: string; style: "mixed" | "mcq" | "structured"; group?: "AS" | "A2" | "OL"; levels?: ("LOT" | "HOT")[]; count: number };

export function ExamRunner({
  mode,
  maxCount,
  showPatterns = false,
  course = "9702",
}: {
  mode: "public" | "portal";
  maxCount: number;
  showPatterns?: boolean;
  /** "9702" (A Level, default) or "5054" (O Level mirror). */
  course?: "9702" | "5054";
}) {
  const [selTopics, setSelTopics] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Set<"LOT" | "HOT">>(new Set(["LOT", "HOT"]));
  const [style, setStyle] = useState<"mixed" | "mcq" | "structured">("mixed");
  const [count, setCount] = useState(mode === "public" ? 4 : 6);
  const [timerOn, setTimerOn] = useState(true);

  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [score, setScore] = useState<{ got: number; total: number; structured: number } | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  const isOLevel = course === "5054";
  const patterns: Pattern[] = isOLevel
    ? [
        { key: "drill", label: "Topical drill", style: "mixed", count: 6 },
        { key: "ol-p1", label: "O Level Paper 1 · MCQ", style: "mcq", group: "OL", count: 12 },
        { key: "ol-p2", label: "O Level Paper 2 · Structured", style: "structured", group: "OL", count: 6 },
      ]
    : [
        { key: "drill", label: "Topical drill", style: "mixed", count: 6 },
        { key: "as-p1", label: "AS Paper 1 · MCQ", style: "mcq", group: "AS", count: 12 },
        { key: "as-p2", label: "AS Paper 2 · Structured", style: "structured", group: "AS", count: 6 },
        { key: "a2-p4", label: "A2 Paper 4 · Structured", style: "structured", group: "A2", count: 6 },
      ];
  const topicGroups: ("AS" | "A2" | "OL")[] = isOLevel ? ["OL"] : ["AS", "A2"];

  function toggleTopic(tp: string) {
    setSelTopics((s) => {
      const n = new Set(s);
      if (n.has(tp)) n.delete(tp);
      else n.add(tp);
      return n;
    });
  }
  function applyGroup(group: "AS" | "A2" | "OL" | "clear") {
    setSelTopics((s) => {
      const n = new Set(s);
      if (group === "clear") return new Set();
      TOPICS[group].forEach((t) => n.add(t));
      return n;
    });
  }
  function toggleLevel(l: "LOT" | "HOT") {
    setLevels((s) => {
      const n = new Set(s);
      if (n.has(l) && n.size === 1) return n; // keep ≥1
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });
  }
  function applyPattern(p: Pattern) {
    setStyle(p.style);
    setCount(Math.min(p.count, maxCount));
    if (p.group) setSelTopics(new Set(TOPICS[p.group]));
    else setSelTopics(new Set());
    if (p.levels) setLevels(new Set(p.levels));
  }

  async function generate() {
    setLoading(true);
    setNote(null);
    setSubmitted(false);
    setRevealed(false);
    setScore(null);
    setAnswers({});
    try {
      const res = await fetch("/api/exam-lab/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          // "None = all" means all topics of THIS course: an empty list is
          // read as 9702, so the O Level presets used to serve A Level items.
          topics: selTopics.size ? [...selTopics] : isOLevel ? [...TOPICS.OL] : [],
          levels: [...levels],
          style,
          count,
          course,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setNote(j.error || "Could not build a test. Try again.");
        setQuestions([]);
      } else {
        setQuestions(j.questions || []);
        if (!j.questions?.length) setNote("No questions matched — widen your topics or levels.");
        else if (mode === "public" && j.source === "seed")
          setNote("Served from the practice bank (AI generator busy) — still a valid paper.");
        else if (mode === "portal" && j.available < count)
          setNote(`Only ${j.available} question${j.available === 1 ? "" : "s"} in the bank for this filter yet — more arrive as past papers are ingested.`);
        setTimeout(() => paperRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      }
    } catch {
      setNote("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function submit() {
    let got = 0;
    let total = 0;
    let structured = 0;
    for (const q of questions) {
      if (q.type === "mcq" && typeof q.ans === "number") {
        total += 1;
        if (answers[q.id] === q.ans) got += 1;
      } else structured += 1;
    }
    setScore({ got, total, structured });
    setSubmitted(true);
    setRevealed(true);
    if (mode === "portal") {
      const mcqAnswers: Record<string, number> = {};
      questions.forEach((q) => {
        if (q.type === "mcq" && typeof answers[q.id] === "number") mcqAnswers[q.id] = answers[q.id];
      });
      fetch("/api/exam-lab/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          questionIds: questions.map((q) => q.id),
          answers: mcqAnswers,
          config: { topics: [...selTopics], levels: [...levels], style },
        }),
      }).catch(() => {});
    }
    setTimeout(() => paperRef.current?.querySelector(".el-result")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  const totalMarks = useMemo(() => questions.reduce((s, q) => s + q.marks, 0), [questions]);
  const lotN = useMemo(() => questions.filter((q) => q.lvl === "LOT").length, [questions]);
  const recMin = Math.max(1, totalMarks);

  return (
    <div>
      {/* ---------- Builder ---------- */}
      <div className="card p-6 el-noprint">
        <h3 className="flex items-center gap-2 font-display text-lg">
          <span className="font-mono text-sm text-cyan">01</span> Configure your paper
        </h3>

        {showPatterns && (
          <div className="mt-5">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Exam pattern</p>
            <div className="flex flex-wrap gap-2">
              {patterns.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPattern(p)}
                  className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-fog transition hover:border-cyan hover:text-cyan"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* topics */}
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">
              Topics <span className="normal-case tracking-normal text-dust">(none = all)</span>
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {isOLevel ? (
                <button onClick={() => applyGroup("OL")} className="rounded-full border border-white/15 px-3 py-1 text-xs text-fog hover:border-cyan hover:text-cyan">＋ All O Level</button>
              ) : (
                <>
                  <button onClick={() => applyGroup("AS")} className="rounded-full border border-white/15 px-3 py-1 text-xs text-fog hover:border-cyan hover:text-cyan">＋ All AS</button>
                  <button onClick={() => applyGroup("A2")} className="rounded-full border border-white/15 px-3 py-1 text-xs text-fog hover:border-cyan hover:text-cyan">＋ All A2</button>
                </>
              )}
              <button onClick={() => applyGroup("clear")} className="rounded-full border border-white/15 px-3 py-1 text-xs text-fog hover:border-cyan hover:text-cyan">✕ Clear</button>
            </div>
            <div className="max-h-56 space-y-3 overflow-auto pr-1">
              {topicGroups.map((g) => (
                <div key={g}>
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-dust">{g === "AS" ? "AS Level (Year 1)" : g === "A2" ? "A2 (Year 2)" : "O Level (5054)"}</p>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS[g].map((tp) => {
                      const on = selTopics.has(tp);
                      return (
                        <button
                          key={tp}
                          onClick={() => toggleTopic(tp)}
                          className={
                            "rounded-full border px-2.5 py-1 text-xs transition " +
                            (on ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan hover:text-cyan")
                          }
                        >
                          {tp}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* right column */}
          <div className="space-y-6">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Thinking level</p>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleLevel("LOT")}
                  className={"rounded-full border px-3.5 py-1.5 text-xs transition " + (levels.has("LOT") ? "border-emerald2 bg-emerald2 text-space font-semibold" : "border-white/15 text-fog hover:border-emerald2")}
                >
                  LOT · lower-order
                </button>
                <button
                  onClick={() => toggleLevel("HOT")}
                  className={"rounded-full border px-3.5 py-1.5 text-xs transition " + (levels.has("HOT") ? "border-magenta bg-magenta text-space font-semibold" : "border-white/15 text-fog hover:border-magenta")}
                >
                  HOT · higher-order
                </button>
              </div>
              <p className="mt-2 text-xs text-dust">LOT = state / define / calculate. HOT = explain / suggest / show-that / evaluate.</p>
            </div>

            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Question style</p>
              <select value={style} onChange={(e) => setStyle(e.target.value as typeof style)} className="w-full rounded-xl border border-white/15 bg-void px-3 py-2.5 text-sm text-ice">
                <option value="mixed">Mixed — MCQ + structured</option>
                <option value="mcq">Paper 1 style — Multiple choice only</option>
                <option value="structured">Paper 2 / 4 style — Structured only</option>
              </select>
            </div>

            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Number of questions</p>
              <div className="flex items-center gap-4">
                <input type="range" min={1} max={maxCount} value={count} onChange={(e) => setCount(+e.target.value)} className="flex-1 accent-cyan" />
                <span className="w-10 text-center font-display text-2xl text-cyan">{count}</span>
              </div>
            </div>

            <button onClick={() => setTimerOn((v) => !v)} className={"inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition " + (timerOn ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog")}>
              <TimerIcon size={13} /> Exam timer {timerOn ? "on" : "off"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={generate} disabled={loading} className="btn-primary disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? "Building…" : "Generate test"}
          </button>
          {mode === "public" && <span className="text-xs text-dust">Short AI-generated papers · fresh every time</span>}
        </div>
        {note && <p className="mt-3 text-xs text-signal">{note}</p>}
      </div>

      {/* ---------- Test ---------- */}
      {questions.length > 0 && (
        <div ref={paperRef} className="el-paper mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6 md:p-8">
          <div className="el-noprint mb-4 flex flex-wrap justify-end gap-2">
            <button onClick={() => window.print()} className="btn-ghost !px-3.5 !py-1.5 text-xs"><Printer size={13} /> Save / Print PDF</button>
            <button onClick={generate} className="btn-ghost !px-3.5 !py-1.5 text-xs"><RotateCcw size={13} /> New random set</button>
          </div>

          <div className="mb-2 flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <p className="eyebrow">Physics Studio · Exam Lab</p>
              <h3 className="mt-1 font-display text-xl">CAIE 9702 Practice Paper</h3>
              <p className="mt-1 font-mono text-xs text-fog">
                {questions.length} questions · {totalMarks} marks · LOT {lotN} / HOT {questions.length - lotN} · rec. {recMin} min
              </p>
            </div>
            {timerOn && <Countdown key={questions.map((q) => q.id).join()} seconds={recMin * 60} running={!submitted} />}
          </div>

          {submitted && score && (
            <div className="el-result mb-4 flex flex-wrap items-center gap-5 rounded-2xl border border-white/15 bg-gradient-to-r from-cyan/10 to-violet2/10 p-5">
              <ScoreDial pct={score.total ? Math.round((score.got / score.total) * 100) : 0} hasMcq={score.total > 0} />
              <div>
                <h4 className="flex items-center gap-2 font-display text-lg"><CheckCircle2 size={18} className="text-emerald2" /> Submitted</h4>
                <p className="mt-1 text-sm text-fog">
                  {score.total ? <>Multiple choice: <b className="text-ice">{score.got} / {score.total}</b> marks.</> : "No MCQs in this set."}
                  {score.structured > 0 && <> &nbsp;{score.structured} structured question{score.structured > 1 ? "s" : ""} — self-mark against the schemes below.</>}
                </p>
                <p className="mt-2 font-mono text-xs text-cyan">Model answers &amp; examiner points are shown under each question. Use “Save / Print PDF” to keep a copy.</p>
              </div>
            </div>
          )}

          <div>
            {questions.map((q, i) => {
              const chosen = answers[q.id];
              return (
                <div key={q.id} className="border-b border-white/[0.06] py-6 last:border-0 el-q">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-lg border border-white/15 bg-slate2 font-display text-sm font-bold text-ice">{i + 1}</span>
                    <span className="rounded-full border border-cyan/30 px-2.5 py-0.5 font-mono text-[10px] text-cyan">{q.t}</span>
                    <span className={"rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (q.lvl === "LOT" ? "border-emerald2/40 text-emerald2" : "border-magenta/40 text-magenta")}>{q.lvl}</span>
                    <span className="rounded-full border border-violet2/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-violet2">{q.cmd}</span>
                    <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-fog">{q.paper}</span>
                    <span className="ml-auto font-mono text-xs text-dust">[{q.marks}]</span>
                  </div>

                  <div className="mb-3 text-[15px] leading-relaxed text-ice/90"><Tex text={q.stem} block /></div>

                  {q.type === "mcq" && q.opts ? (
                    <div className="grid gap-2">
                      {q.opts.map((o, k) => {
                        const isCorrect = submitted && k === q.ans;
                        const isWrong = submitted && chosen === k && k !== q.ans;
                        return (
                          <label
                            key={k}
                            className={
                              "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition " +
                              (isCorrect ? "border-emerald2 bg-emerald2/10" : isWrong ? "border-signal bg-signal/10" : "border-white/15 hover:border-cyan")
                            }
                          >
                            <input type="radio" name={q.id} checked={chosen === k} onChange={() => setAnswers((a) => ({ ...a, [q.id]: k }))} className="mt-1 accent-cyan" disabled={submitted} />
                            <span className="font-display font-bold text-cyan">{"ABCD"[k]}</span>
                            <span className="text-ice/90"><Tex text={o} /></span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      className="min-h-24 w-full resize-y rounded-xl border border-white/15 bg-void px-3.5 py-3 text-sm text-ice"
                      placeholder="Type your working and answer here…"
                      disabled={submitted}
                    />
                  )}

                  {revealed && (
                    <div className="mt-3 rounded-r-xl border-l-2 border-cyan bg-cyan/5 px-4 py-3 el-scheme">
                      <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-cyan">Mark scheme{q.type === "structured" ? ` · ${q.marks} marks` : ""}</p>
                      <ul className="space-y-1">
                        {q.scheme.map((s, si) => (
                          <li key={si} className="flex gap-2 text-sm text-ice/80">
                            <span className="text-emerald2">✓</span>
                            <span><Tex text={s} /></span>
                          </li>
                        ))}
                      </ul>
                      {q.type === "mcq" && typeof q.ans === "number" && (
                        <p className="mt-2 font-mono text-xs text-lime2">Correct answer: {"ABCD"[q.ans]}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="el-noprint mt-4 flex flex-wrap justify-center gap-3">
            {!submitted ? (
              <>
                <button onClick={submit} className="btn-primary"><CheckCircle2 size={16} /> Submit &amp; mark</button>
                <button onClick={() => setRevealed((v) => !v)} className="btn-ghost"><Eye size={16} /> {revealed ? "Hide" : "Reveal"} mark schemes</button>
              </>
            ) : (
              <button onClick={generate} className="btn-primary"><RotateCcw size={16} /> New test</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreDial({ pct, hasMcq }: { pct: number; hasMcq: boolean }) {
  return (
    <div className="grid h-24 w-24 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(#3DE1F0 ${pct}%, rgba(255,255,255,.08) 0)` }}>
      <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-abyss text-center">
        <div>
          <b className="font-display text-xl text-ice">{hasMcq ? pct + "%" : "—"}</b>
          <span className="block font-mono text-[9px] text-dust">MCQ score</span>
        </div>
      </div>
    </div>
  );
}

function Countdown({ seconds, running }: { seconds: number; running: boolean }) {
  const [left, setLeft] = useState(seconds);
  const leftRef = useRef(seconds);

  useEffect(() => {
    leftRef.current = seconds;
    setLeft(seconds);
  }, [seconds]);

  // Wall-clock, not tick-counting: background tabs throttle intervals, so
  // counting ticks ran the clock slow. Each run derives a deadline from the
  // time left and re-reads the clock on every refresh.
  useEffect(() => {
    if (!running) return;
    const deadline = Date.now() + leftRef.current * 1000;
    const tick = () => {
      const n = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      leftRef.current = n;
      setLeft(n);
    };
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [running, seconds]);

  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <div className="el-noprint rounded-xl border border-white/15 px-4 py-2 text-center">
      <span className="font-mono text-[15px]" style={{ color: left === 0 ? "#FF7A2F" : "#3DE1F0" }}>
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
      <small className="block font-mono text-[9px] tracking-widest text-dust">TIME LEFT</small>
    </div>
  );
}
