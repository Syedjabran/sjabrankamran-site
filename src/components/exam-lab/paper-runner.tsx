"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, CheckCircle2, Eye, RotateCcw, Printer, Clock, ArrowLeft } from "lucide-react";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";

type UrlMap = Record<string, string>;

export function PaperRunner({
  questions,
  title,
  subtitle,
  timed = true,
  duration = 60,
  onExit,
}: {
  questions: ImgQuestion[];
  title: string;
  subtitle?: string;
  timed?: boolean;
  duration?: number;
  onExit?: () => void;
}) {
  const [urls, setUrls] = useState<UrlMap>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const topRef = useRef<HTMLDivElement>(null);

  const isMcq = (q: ImgQuestion) => q.paperType === "P1";
  const totalMarks = useMemo(() => questions.reduce((s, q) => s + (q.marks || 0), 0), [questions]);

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

  function submit() {
    setSubmitted(true);
    const rev: Record<string, boolean> = {};
    questions.forEach((q) => {
      if (!isMcq(q)) rev[q.id] = true;
    });
    setRevealed((r) => ({ ...r, ...rev }));
    setTimeout(() => topRef.current?.querySelector(".pr-result")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  const mcqs = questions.filter(isMcq);
  const got = mcqs.reduce((s, q) => s + (submitted && q.answer && answers[q.id] === "ABCD".indexOf(q.answer) ? 1 : 0), 0);
  const structCount = questions.length - mcqs.length;
  const structMarks = questions.filter((q) => !isMcq(q)).reduce((s, q) => s + (q.marks || 0), 0);
  const pct = mcqs.length ? Math.round((got / mcqs.length) * 100) : 0;

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

  return (
    <div ref={topRef}>
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
          {timed && !submitted && <Countdown minutes={duration} />}
          <button onClick={() => window.print()} className="btn-ghost !px-3 !py-1.5 text-xs el-noprint"><Printer size={13} /> PDF</button>
        </div>
      </div>

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

      <ol className="space-y-8">
        {questions.map((q, i) => {
          const chosen = answers[q.id];
          const ai = q.answer ? "ABCD".indexOf(q.answer) : -1;
          return (
            <li key={q.id} className="pr-q rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 md:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-slate2 font-display text-sm font-bold text-ice">{i + 1}</span>
                {q.topic && <span className="rounded-full border border-cyan/30 px-2.5 py-0.5 font-mono text-[10px] text-cyan">{q.topic}</span>}
                <span className={"rounded-full border px-2.5 py-0.5 font-mono text-[10px] " + (q.level === "LOT" ? "border-emerald2/40 text-emerald2" : "border-magenta/40 text-magenta")}>{q.level}</span>
                <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-fog">{q.paperType}</span>
                {q.marks != null && <span className="ml-auto font-mono text-xs text-dust">[{q.marks}]</span>}
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[q.img]} alt={`Question ${q.qnum}`} className="w-full rounded-lg border border-white/10 bg-white" loading="lazy" />

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
                  <textarea disabled={submitted} placeholder="Write your answer / working here…" className="min-h-28 w-full resize-y rounded-xl border border-white/15 bg-void px-3.5 py-3 text-sm text-ice el-noprint" />
                  <button
                    onClick={() => setRevealed((r) => ({ ...r, [q.id]: !r[q.id] }))}
                    className="btn-ghost mt-2 !px-3 !py-1.5 text-xs el-noprint"
                  >
                    <Eye size={13} /> {revealed[q.id] ? "Hide" : "Reveal"} mark scheme
                  </button>
                  {revealed[q.id] && q.ms_img && urls[q.ms_img] && (
                    <div className="mt-3">
                      <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-cyan">Official mark scheme</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls[q.ms_img]} alt={`Mark scheme ${q.qnum}`} className="w-full rounded-lg border border-cyan/30 bg-white" loading="lazy" />
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
          <button onClick={submit} className="btn-primary"><CheckCircle2 size={16} /> Submit &amp; mark</button>
        ) : onExit ? (
          <button onClick={onExit} className="btn-ghost"><RotateCcw size={16} /> Choose another</button>
        ) : null}
      </div>
    </div>
  );
}

function Countdown({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    const iv = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(iv);
  }, []);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 font-mono text-sm" style={{ color: left === 0 ? "#FF7A2F" : "#3DE1F0" }}>
      <Clock size={13} />
      {h > 0 ? `${h}:` : ""}{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </div>
  );
}
