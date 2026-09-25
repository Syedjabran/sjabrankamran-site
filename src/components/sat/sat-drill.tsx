"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { DrillState, ReviewItem } from "@/lib/sat/client-types";
import { SprPad } from "./spr-pad";
import { QuestionImage } from "./question-image";
import { useSignedImages } from "./use-signed-images";

export function SatDrill({ initial }: { initial: DrillState }) {
  const [state, setState] = useState(initial);
  const firstOpen = initial.questions.findIndex((q) => !initial.checked[q.id]);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = state.questions[idx];
  const done: ReviewItem | undefined = state.checked[q.id];
  const { urls, error: imgError, missing: imgMissing } = useSignedImages(state.questions.flatMap((x) => [x.img, state.checked[x.id]?.rationaleImg ?? ""]));
  useEffect(() => setResponse(""), [idx]);

  async function check() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/sat/sessions/${state.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", questionId: q.id, response }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Please try again.");
      setState(j.state as DrillState);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const correct = Object.values(state.checked).filter((r) => r.correct).length;
  if (state.finished && idx === state.questions.length) {
    return <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-center"><p className="font-display text-2xl text-ice">{correct}/{state.questions.length}</p><p className="mt-1 text-sm text-fog">{state.title} complete</p><Link href="/portal/sat-lab" className="btn-primary mt-4 inline-flex !px-4 !py-2 text-sm">Back to SAT Lab</Link></div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3 text-sm">
        <span className="font-semibold text-ice">{state.title}</span>
        <span className="ml-auto font-mono text-dust">{Object.keys(state.checked).length}/{state.questions.length} · {correct} correct</span>
      </div>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
        <p className="font-display text-ice">Question {q.n} of {state.questions.length}</p>
        <QuestionImage key={q.img} src={urls[q.img]} alt={`Question ${q.n}`} error={imgMissing[q.img] ?? imgError} />
        {done ? (
          <div className={"space-y-3 rounded-xl border p-3 " + (done.correct ? "border-emerald2/30" : "border-signal/30")}>
            <p className="flex items-center gap-2 text-sm">{done.correct ? <CheckCircle2 size={16} className="text-emerald2" /> : <XCircle size={16} className="text-signal" />}<span className="text-ice">You answered {done.response}. The answer is {done.answer}.</span></p>
            {done.rationaleImg && urls[done.rationaleImg] ? <img src={urls[done.rationaleImg]} alt="Official rationale" className="w-full rounded-lg bg-white" /> : done.rationale ? <p className="whitespace-pre-line text-sm text-fog">{done.rationale}</p> : null}
          </div>
        ) : q.kind === "mcq" ? (
          <div className="grid grid-cols-4 gap-2">{["A", "B", "C", "D"].map((l) => <button key={l} type="button" disabled={busy} onClick={() => setResponse(l)} className={"rounded-xl border py-3 font-display text-lg disabled:opacity-40 " + (response === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog")}>{l}</button>)}</div>
        ) : (
          <SprPad value={response} onChange={setResponse} disabled={busy} />
        )}
        {error ? <p className="text-xs text-signal">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {done ? <button onClick={() => setIdx(idx + 1 < state.questions.length ? idx + 1 : state.finished ? state.questions.length : idx)} className="btn-primary !px-4 !py-2 text-sm">{idx + 1 < state.questions.length ? "Next question" : "Finish"}</button>
            : <button disabled={!response || busy} onClick={() => void check()} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : "Check"}</button>}
        </div>
      </div>
    </div>
  );
}
