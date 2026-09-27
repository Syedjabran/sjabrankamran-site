"use client";
// "Coach says" (SAT Coach spec 8.2): the headline, two-sentence summary and
// up to 3 tips built from the student's analytics + plan status. Purely
// presentational -- coach-home.tsx fetches the InsightsView from
// GET /api/sat/coach/insights (after the plan, so the plan never waits on
// the AI) and passes it in, with what a "Drill this" tap should do and
// whether a start is already under way (`busy`: the buttons wait) and
// whether a newer view is on its way (`updating`: this one stays meanwhile).
import { Loader2 } from "lucide-react";
import type { InsightsView } from "@/lib/sat/client-types";

export function CoachSays({ view, onDrill, busy = false, updating = false }: { view: InsightsView; onDrill: (skill: string) => void; busy?: boolean; updating?: boolean }) {
  return (
    <section aria-busy={updating} className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ice">Coach says</h2>
        <div className="flex shrink-0 items-center gap-2">
          {updating ? <span role="status" className="flex items-center gap-1 text-[11px] text-dust"><Loader2 size={12} className="animate-spin" /> Updating…</span> : null}
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-dust">
            {view.source === "ai" ? "AI" : "Coach"}
          </span>
        </div>
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
                    disabled={busy}
                    onClick={() => onDrill(tip.skill as string)}
                    className="btn-primary shrink-0 !px-3 !py-1.5 text-xs disabled:opacity-40"
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

/** Holds Coach says' place while GET /api/sat/coach/insights is on its way. */
export function CoachSaysSkeleton() {
  return (
    <section aria-busy="true" aria-label="Coach says is loading" className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice">Coach says</h2>
      <div aria-hidden className="mt-3 space-y-2 motion-safe:animate-pulse">
        <div className="h-4 w-2/3 rounded bg-white/10" />
        <div className="h-3 w-full rounded bg-white/[0.07]" />
        <div className="h-3 w-5/6 rounded bg-white/[0.07]" />
      </div>
    </section>
  );
}
