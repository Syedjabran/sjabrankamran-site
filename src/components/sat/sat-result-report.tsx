"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DrillState, SessionState } from "@/lib/sat/client-types";
import { ScoreReport } from "./score-report";

// GET /api/sat/sessions/<id>?uid=<uid> already serves this same union to the
// owner's own runner (sat-runner.tsx / sat-drill.tsx) -- this is the
// read-only staff view of it: no answers can be entered, no save/submit is
// ever posted back.
type SittingState = SessionState | DrillState;

export function SatResultReport({ uid, id }: { uid: string; id: string }) {
  const [state, setState] = useState<SittingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/sat/sessions/${encodeURIComponent(id)}?uid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "This sitting couldn't be loaded.");
      setState(j as SittingState);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, [uid, id]);

  if (error && !state) {
    return (
      <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
        {error} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button>
      </p>
    );
  }
  if (!state) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading the report…</p>;

  if ("status" in state && state.status === "finished" && state.report) {
    return <ScoreReport report={state.report} />;
  }
  // Drills carry no SATReport/status shape at all (only adaptive/practice
  // sittings do) -- a finished one must never fall into the "still in
  // progress" branch below, so it's handled on its own, regardless of
  // whether it's finished or not.
  if (state.kind === "drill") {
    return <p className="rounded-2xl border border-white/10 bg-space/60 p-5 text-sm text-fog">Drill results are shown in the list — drills have no score report.</p>;
  }
  return <p className="rounded-2xl border border-white/10 bg-space/60 p-5 text-sm text-fog">This sitting is still in progress.</p>;
}
