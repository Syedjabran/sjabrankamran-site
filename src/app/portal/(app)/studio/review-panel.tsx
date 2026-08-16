"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Save, Wand2, EyeOff, XCircle, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { approveAndPublish, saveTeacherAnswer, unpublish, rejectQuestion } from "./actions";

type Q = {
  id: string;
  question: string;
  curriculum: string;
  topic: string | null;
  ai_answer: string | null;
  teacher_answer: string | null;
  review_status: string;
  is_public: boolean;
  slug: string | null;
  created_at: string;
};

export function ReviewPanel({ q }: { q: Q }) {
  const [answer, setAnswer] = useState(q.teacher_answer || q.ai_answer || "");
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      setMsg(r.ok ? { kind: "ok", text: okText } : { kind: "err", text: r.error || "Failed." });
    });
  }

  const statusColor =
    q.review_status === "approved"
      ? "text-emerald2 border-emerald2/30"
      : q.review_status === "review_requested"
      ? "text-signal border-signal/30"
      : "text-cyan border-cyan/30";

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-ice">{q.question}</p>
          <p className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widelabel text-dust">
            <span>{q.curriculum}</span>
            {q.topic ? <span>· {q.topic}</span> : null}
            <span>· {new Date(q.created_at).toLocaleDateString()}</span>
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widelabel ${statusColor}`}>
          {q.is_public ? "published" : q.review_status.replace("_", " ")}
        </span>
      </div>

      {q.ai_answer ? (
        <details className="rounded-xl border border-white/10 bg-abyss/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-dust">AI draft (reference)</summary>
          <div className="mt-2 max-h-56 overflow-auto text-sm text-fog">
            <MarkdownRenderer content={q.ai_answer} />
          </div>
        </details>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-ice">Your reviewed answer</label>
          <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs text-cyan hover:underline">
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[8rem] rounded-xl border border-white/10 bg-abyss/40 p-3 text-sm text-fog">
            {answer.trim() ? <MarkdownRenderer content={answer} /> : <span className="text-dust">Nothing to preview yet.</span>}
          </div>
        ) : (
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={8}
            placeholder="Write the verified explanation. Markdown + $LaTeX$ supported."
            className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-3 font-mono text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
        )}
      </div>

      {msg ? (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald2" : "text-signal"}`}>{msg.text}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => saveTeacherAnswer(q.id, answer), "Saved as draft.")}
          className="btn-ghost !px-3.5 !py-1.5 text-xs disabled:opacity-60"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save draft
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveAndPublish(q.id, answer), "Approved & published to the library.")}
          className="btn-primary !px-3.5 !py-1.5 text-xs disabled:opacity-60"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve &amp; publish
        </button>
        {answer.trim() === (q.ai_answer || "").trim() && q.ai_answer ? (
          <span className="inline-flex items-center gap-1 self-center font-mono text-[10px] uppercase tracking-widelabel text-dust">
            <Wand2 size={11} /> editing AI draft
          </span>
        ) : null}
        {q.is_public ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unpublish(q.id), "Unpublished.")}
            className="btn-ghost !px-3.5 !py-1.5 text-xs disabled:opacity-60"
          >
            <EyeOff size={13} /> Unpublish
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => rejectQuestion(q.id), "Rejected & hidden.")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-signal/30 px-3.5 py-1.5 text-xs text-signal transition hover:bg-signal/10 disabled:opacity-60"
        >
          <XCircle size={13} /> Reject
        </button>
      </div>
    </div>
  );
}
