"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import type { SATReport } from "@/lib/sat/client-types";
import { useSignedImages } from "./use-signed-images";

const SECTION = { rw: "Reading and Writing", math: "Math" } as const;
const DOMAIN_LABEL: Record<string, string> = {
  "information-ideas": "Information and Ideas", "craft-structure": "Craft and Structure",
  "expression-ideas": "Expression of Ideas", "standard-english": "Standard English Conventions",
  algebra: "Algebra", "advanced-math": "Advanced Math", psda: "Problem-Solving and Data Analysis",
  "geometry-trig": "Geometry and Trigonometry",
};

export function ScoreReport({ report }: { report: SATReport }) {
  const [open, setOpen] = useState<string | null>(null);
  const { urls, error: imgError } = useSignedImages(report.review.flatMap((r) => [r.img, r.rationaleImg ?? ""]));
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
            <p className="text-xs uppercase tracking-widest text-dust">{SECTION[k]}</p>
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
                <span className="text-fog">{SECTION[r.section]} · Q{r.n}</span>
                <span className="ml-auto font-mono text-xs text-dust">You: {r.response ?? "—"} · Answer: {r.answer}</span>
              </button>
              {open === r.id ? (
                <div className="space-y-3 border-t border-white/10 p-3">
                  {urls[r.img] ? <img src={urls[r.img]} alt={`Question ${r.n}`} className="w-full rounded-lg bg-white" /> : null}
                  {r.rationaleImg && urls[r.rationaleImg] ? <img src={urls[r.rationaleImg]} alt="Official rationale" className="w-full rounded-lg bg-white" />
                    : r.rationale ? <p className="whitespace-pre-line text-sm text-fog">{r.rationale}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
