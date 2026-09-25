"use client";
import type { SessionSummary } from "@/lib/sat/client-types";

/**
 * A finished sitting's score range with its authority label -- shared by the
 * student's own history (sat-hub.tsx) and the staff results list
 * (sat-results.tsx) so the markup and copy can never drift between them.
 * Never a bare number: always the range, with "Official score range" for a
 * real practice-test conversion or "Estimated score" for the adaptive
 * mock's estimate.
 */
export function ScoreBadge({ score }: { score: NonNullable<SessionSummary["score"]> }) {
  const official = score.authority === "official";
  return (
    <span className={"shrink-0 rounded-full border px-2 py-0.5 text-[11px] " + (official ? "border-emerald2/30 text-emerald2" : "border-amber-300/30 text-amber-200")}>
      {score.lower}–{score.upper} · {official ? "Official score range" : "Estimated score"}
    </span>
  );
}
