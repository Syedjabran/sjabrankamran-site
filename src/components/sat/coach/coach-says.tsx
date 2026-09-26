"use client";
// "Coach says" (SAT Coach spec 8.2): the headline, two-sentence summary and
// up to 3 tips built from the student's analytics + plan status. Purely
// presentational -- Task 9 (sat-hub.tsx) fetches the InsightsView from
// GET /api/sat/coach (refreshed server-side there) and passes it in, along
// with what a "Drill this" tap should do.
import type { InsightsView } from "@/lib/sat/client-types";

export function CoachSays({ view, onDrill }: { view: InsightsView; onDrill: (skill: string) => void }) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ice">Coach says</h2>
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-dust">
          {view.source === "ai" ? "AI" : "Coach"}
        </span>
      </div>
      <p className="mt-3 text-base text-ice">{view.headline}</p>
      <p className="mt-1 text-sm text-fog">{view.summary}</p>
      {view.tips.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {view.tips.map((tip, i) => (
            <li key={`${tip.title}-${i}`} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ice">{tip.title}</p>
                  <p className="mt-0.5 text-xs text-fog">{tip.body}</p>
                </div>
                {tip.skill ? (
                  <button
                    onClick={() => onDrill(tip.skill as string)}
                    className="btn-primary shrink-0 !px-3 !py-1.5 text-xs"
                  >
                    Drill this
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
