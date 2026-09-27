"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { DOMAIN_LABEL, SECTION_LABEL, type SATReport } from "@/lib/sat/client-types";
import { ExplainButton } from "./explain-button";
import { QuestionImage } from "./question-image";
import { useSignedImages } from "./use-signed-images";
import { useImagePreload } from "./use-image-preload";
import { reviewPreloadOrder } from "./sat-runner-utils";

/** `explainFrom`: the sitting's id on the student's own finished report --
 *  wrong answers get an "Explain my mistake" link to the SAT tutor for that
 *  attempt (never on a staff view, which passes nothing). `images`: signed
 *  URLs the response that brought this report carried (any path without
 *  one is signed here). The review's images load in the background -- every
 *  wrong answer's rationale and question first -- so a row opens with its
 *  images already there; an image that fails to load retries once with a
 *  freshly signed URL (QuestionImage). */
export function ScoreReport({ report, explainFrom, images }: { report: SATReport; explainFrom?: string; images?: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const { urls, error: imgError, missing: imgMissing, resign } = useSignedImages(report.review.flatMap((r) => [r.img, r.rationaleImg ?? ""]), images);
  useImagePreload(undefined, reviewPreloadOrder(report.review).map((path) => urls[path]).filter((url): url is string => !!url));
  const s = report.score;
  return (
    <div className="space-y-6">
      {imgError ? <p className="text-sm text-signal">{imgError}</p> : null}
      <section className="rounded-2xl border border-white/10 bg-space/60 p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-fog">{report.title}</p>
        {s ? (
          <>
            <p className="mt-2 font-display text-4xl text-ice">{s.lower}–{s.upper}</p>
            <p className={"mt-1 text-sm " + (s.authority === "official" ? "text-emerald2" : "text-amber-200")}>
              {s.authority === "official" ? `Official score range · Practice Test ${s.testNo}` : "Estimated score range — not an official SAT score"}
            </p>
            {s.authority === "estimated" ? <p className="mt-2 max-w-2xl text-xs text-dust">{s.basis}</p> : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-fog">{report.scoreNote}</p>
        )}
        {report.overtime ? <p className="mt-3 text-xs text-amber-200">At least one module was submitted after its time limit.</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {(["rw", "math"] as const).map((k) => (
          <div key={k} className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-4">
            <p className="text-xs uppercase tracking-widest text-dust">{SECTION_LABEL[k]}</p>
            <p className="mt-1 font-display text-2xl text-ice">{report.sections[k].correct}/{report.sections[k].total}</p>
            {report.routed[k] ? <p className="mt-1 text-xs text-fog">Module 2: {report.routed[k] === "upper" ? "harder" : "easier"} form</p> : null}
          </div>
        ))}
      </section>

      {report.routingDisclosure ? (
        <p className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-dust"><Info size={14} className="mt-0.5 shrink-0" />{report.routingDisclosure}</p>
      ) : null}

      {report.domains.length ? (
        <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
          <p className="mb-3 text-sm font-semibold text-ice">By domain</p>
          <ul className="space-y-2">
            {report.domains.map((d) => (
              <li key={d.domain} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-fog">{DOMAIN_LABEL[d.domain] ?? d.domain}</span>
                <span className="shrink-0 font-mono text-ice">{d.correct}/{d.total}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
        <p className="mb-3 text-sm font-semibold text-ice">Review every question</p>
        <ol className="space-y-2">
          {report.review.map((r) => (
            <li key={r.id} className="rounded-xl border border-white/10">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
                {r.correct ? <CheckCircle2 size={16} className="text-emerald2" /> : <XCircle size={16} className="text-signal" />}
                <span className="text-fog">{SECTION_LABEL[r.section]} · Q{r.n}</span>
                <span className="ml-auto font-mono text-xs text-dust">You: {r.response ?? "—"} · Answer: {r.answer}</span>
              </button>
              {open === r.id ? (
                <div className="space-y-3 border-t border-white/10 p-3">
                  <QuestionImage key={r.img} src={urls[r.img]} alt={`Question ${r.n}`} error={imgMissing[r.img] ?? imgError} resign={() => resign(r.img)} />
                  <ReviewRationale item={r} src={r.rationaleImg ? urls[r.rationaleImg] : undefined} error={r.rationaleImg ? imgMissing[r.rationaleImg] ?? imgError : null} resign={resign} />
                  {explainFrom && !r.correct ? <ExplainButton questionId={r.id} from={explainFrom} context={`${SECTION_LABEL[r.section]} · Q${r.n}`} /> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** A review row's official rationale: the image (retried once when it fails
 *  to load), with the text version under the failure message; the text
 *  alone when there is no image. */
function ReviewRationale({ item, src, error, resign }: {
  item: SATReport["review"][number]; src: string | undefined; error: string | null; resign: (path: string) => Promise<string | null>;
}) {
  const text = item.rationale ? <p className="whitespace-pre-line text-sm text-fog">{item.rationale}</p> : null;
  const path = item.rationaleImg;
  if (!path) return text;
  return (
    <QuestionImage
      key={path} src={src} alt="Official rationale" error={error} resign={() => resign(path)}
      failedText={"The official rationale image couldn't be loaded." + (text ? " Its text version is below." : "")}
      fallback={text}
    />
  );
}
