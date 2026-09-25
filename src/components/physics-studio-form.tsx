"use client";

import { useEffect, useState } from "react";
import { Sparkles, Send, Loader2, ShieldCheck } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";

const CURRICULA = ["A-Level", "O-Level", "IBDP", "General", "Other"] as const;
const TOPICS = [
  "Mechanics", "Waves", "Electricity", "Fields", "Thermal Physics",
  "Circular Motion", "Quantum Physics", "Nuclear Physics", "Practical Skills",
  "Data Analysis", "Uncertainty", "Examination Technique",
];
const MODES = [
  "Give me a hint", "Explain the concept", "Guide me step by step",
  "Show a worked example", "Examiner-style explanation", "Practical-planning guidance",
  "Identify my mistake", "Make the explanation easier", "Challenge me with a follow-up",
];

type Result = { answer: string | null; label: string; status: string } | null;

export function PhysicsStudioForm() {
  const [question, setQuestion] = useState("");
  const [curriculum, setCurriculum] = useState<(typeof CURRICULA)[number]>("A-Level");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState(MODES[1]);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [requestReview, setRequestReview] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  // Einstein companion can inject example questions.
  useEffect(() => {
    const onExample = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q === "string") setQuestion(q);
    };
    window.addEventListener("physics-studio:example", onExample);
    return () => window.removeEventListener("physics-studio:example", onExample);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (question.trim().length < 10) {
      setError("Please write a slightly longer question (at least 10 characters).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/physics-question", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question, curriculum, topic, responseMode: mode,
          requestReview, email, consent, website,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Something went wrong. Please try again.");
      } else {
        setResult({ answer: j.answer, label: j.label, status: j.status });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* FORM */}
      <form onSubmit={submit} className="card space-y-5 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ice">Your physics question</label>
          <textarea
            id="physics-question-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={5}
            required
            maxLength={4000}
            placeholder="e.g. Why does a satellite in a higher orbit have a lower speed?"
            className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-3 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ice">Curriculum</label>
            <select
              value={curriculum}
              onChange={(e) => setCurriculum(e.target.value as (typeof CURRICULA)[number])}
              className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none"
            >
              {CURRICULA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ice">Topic</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none"
            >
              <option value="">Any / not sure</option>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ice">How should the tutor help?</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none"
          >
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* honeypot */}
        <input
          type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
          className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true"
        />

        <label className="flex items-start gap-2.5 text-sm text-fog">
          <input type="checkbox" checked={requestReview} onChange={(e) => setRequestReview(e.target.checked)} className="mt-0.5" />
          Request a personal review by Syed Jabran Ali Kamran
        </label>

        {requestReview ? (
          <div className="space-y-3">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200}
              placeholder="Email (optional)"
              className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
            />
            <label className="flex items-start gap-2.5 text-xs text-dust">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              I consent to my email being stored with this question.
            </label>
          </div>
        ) : null}

        {error ? <p className="text-sm text-signal">{error}</p> : null}

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
          {loading ? <><Loader2 size={16} className="animate-spin" /> Thinking…</> : <><Send size={16} /> Ask Physics Studio</>}
        </button>
        <p className="text-center text-xs text-dust">
          AI-assisted. Not a substitute for your teacher&rsquo;s guidance. Be respectful — submissions are moderated.
        </p>
      </form>

      {/* RESULT */}
      <div className="card flex min-h-[320px] flex-col p-6" aria-busy={loading}>
        {loading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="The tutor is preparing your answer">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-5/6" />
            <p className="mt-2 text-center text-xs text-dust">Working through the physics…</p>
          </div>
        ) : !result ? (
          <div className="m-auto max-w-xs text-center text-dust">
            <Sparkles className="mx-auto mb-3 text-cyan/60" size={28} />
            <p className="text-sm">Your guided answer will appear here. The tutor teaches — expect explanation, not just a final number.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widelabel text-cyan">
              <ShieldCheck size={12} /> {result.label}
            </span>
            {result.answer ? (
              <div className="text-sm leading-relaxed text-fog">
                <MarkdownRenderer content={result.answer} />
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-fog">
                Your question has been sent for personal review. Reviewed answers may be added to the Physics Studio Library.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
