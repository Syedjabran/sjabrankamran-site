"use client";
// This week's goals on the home (SAT Coach spec 8.3): computed by rules
// (goals.ts), each with its progress bar and the numbers behind it. A score
// range (a goal with a `band`) shows no percentage: its detail line gives
// the real range and the target.
import type { CoachPayload } from "@/lib/sat/client-types";
import { Meter } from "./meter";

export function GoalsCard({ goals }: { goals: CoachPayload["goals"] }) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice">This week&rsquo;s goals</h2>
      <ul className="mt-4 space-y-4">
        {goals.map((goal) => (
          <li key={goal.id} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-ice">{goal.title}</span>
              {goal.band === undefined ? <span className="shrink-0 font-mono text-xs tabular-nums text-fog">{Math.round(goal.progress * 100)}%</span> : null}
            </div>
            <div className="mt-1.5"><Meter fraction={goal.progress} band={goal.band} /></div>
            <p className="mt-1 text-xs text-dust">{goal.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
