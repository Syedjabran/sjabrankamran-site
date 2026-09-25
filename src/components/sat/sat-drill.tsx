"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { DrillState, ReviewItem } from "@/lib/sat/client-types";
import { validateSPR } from "@/lib/sat/grade";
import { SprPad } from "./spr-pad";
import { QuestionImage } from "./question-image";
import { useSignedImages } from "./use-signed-images";
import { isTimeoutError } from "./sat-runner-utils";

// The same bound the runner puts on its requests: a hung Check must end.
const CHECK_TIMEOUT_MS = 20_000;

export function SatDrill({ initial }: { initial: DrillState }) {
  const [state, setState] = useState(initial);
  const firstOpen = initial.questions.findIndex((q) => !initial.checked[q.id]);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { urls, error: imgError, missing: imgMissing, resign } = useSignedImages(state.questions.flatMap((x) => [x.img, state.checked[x.id]?.rationaleImg ?? ""]));
  useEffect(() => setResponse(""), [idx]);

  const correct = Object.values(state.checked).filter((r) => r.correct).length;
  // Every question id of this drill has gone from a rebuilt bank: say so
  // instead of indexing into an empty list.
  if (!state.questions.length) {
    return <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-center"><p className="text-sm text-fog">This drill has no questions to show — they are no longer in the question bank.</p><Link href="/portal/sat-lab" className="btn-primary mt-4 inline-flex !px-4 !py-2 text-sm">Back to SAT Lab</Link></div>;
  }
  // "Finish" moves idx one past the last question; this must be checked
  // before anything reads state.questions[idx].
  if (state.finished && idx === state.questions.length) {
    return <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-center"><p className="font-display text-2xl text-ice">{correct}/{state.questions.length}</p><p className="mt-1 text-sm text-fog">{state.title} complete</p><Link href="/portal/sat-lab" className="btn-primary mt-4 inline-flex !px-4 !py-2 text-sm">Back to SAT Lab</Link></div>;
  }
  const q = state.questions[Math.min(idx, state.questions.length - 1)];
  const done: ReviewItem | undefined = state.checked[q.id];
  // The pad already shows why; the server would refuse it too (and record
  // nothing), so Check waits for an entry the answer box accepts.
  const invalidEntry = !done && q.kind === "spr" && !!response && !validateSPR(response).ok;
  const rationaleText = done?.rationale ? <p className="whitespace-pre-line text-sm text-fog">{done.rationale}</p> : null;
  const rationaleImg = done?.rationaleImg ?? null;

  async function check() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/sat/sessions/${state.id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", questionId: q.id, response }),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.state) throw new Error(j.error || "Please try again.");
      setState(j.state as DrillState);
    } catch (e) {
      setError(isTimeoutError(e) ? "The connection timed out — please check again." : (e as Error).message || "Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3 text-sm">
        <span className="font-semibold text-ice">{state.title}</span>
        <span className="ml-auto font-mono text-dust">{Object.keys(state.checked).length}/{state.questions.length} · {correct} correct</span>
      </div>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
        <p className="font-display text-ice">Question {q.n} of {state.questions.length}</p>
        <QuestionImage key={q.img} src={urls[q.img]} alt={`Question ${q.n}`} error={imgMissing[q.img] ?? imgError} resign={() => resign(q.img)} />
        {done ? (
          <div className={"space-y-3 rounded-xl border p-3 " + (done.correct ? "border-emerald2/30" : "border-signal/30")}>
            <p className="flex items-center gap-2 text-sm">{done.correct ? <CheckCircle2 size={16} className="text-emerald2" /> : <XCircle size={16} className="text-signal" />}<span className="text-ice">You answered {done.response}. The answer is {done.answer}.</span></p>
            {rationaleImg ? (
              // An image that can't be shown says so, and the text rationale stays.
              <QuestionImage
                key={rationaleImg} src={urls[rationaleImg]} alt="Official rationale" error={imgMissing[rationaleImg] ?? imgError}
                resign={() => resign(rationaleImg)}
                failedText={"The official rationale image couldn't be loaded." + (rationaleText ? " Its text version is below." : "")}
                fallback={rationaleText}
              />
            ) : rationaleText}
          </div>
        ) : q.kind === "mcq" ? (
          <div className="grid grid-cols-4 gap-2">{["A", "B", "C", "D"].map((l) => <button key={l} type="button" disabled={busy} onClick={() => setResponse(l)} className={"rounded-xl border py-3 font-display text-lg disabled:opacity-40 " + (response === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog")}>{l}</button>)}</div>
        ) : (
          <SprPad value={response} onChange={setResponse} disabled={busy} />
        )}
        {error ? <p className="text-xs text-signal">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {done ? <button onClick={() => setIdx(idx + 1 < state.questions.length ? idx + 1 : state.finished ? state.questions.length : idx)} className="btn-primary !px-4 !py-2 text-sm">{idx + 1 < state.questions.length ? "Next question" : "Finish"}</button>
            : <button disabled={!response || busy || invalidEntry} onClick={() => void check()} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : "Check"}</button>}
        </div>
      </div>
    </div>
  );
}
