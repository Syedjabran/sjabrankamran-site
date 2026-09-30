"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { SessionSummary } from "@/lib/sat/client-types";
import { formatPk } from "@/lib/portal/pk-time";
import { OvertimeTag, ScoreBadge } from "./score-badge";

// The shape GET /api/sat/results returns. Composed locally from
// client-types.ts's SessionSummary (never imported from store.ts/access.ts,
// which carry the answer key / DB access) -- same convention as
// SessionsPayload in sat-hub.tsx.
type ResultsStudent = { uid: string; name: string; className: string; sessions: SessionSummary[] | null };
type ResultsPayload = { students: ResultsStudent[] };

/** Most recently finished sitting that carries a score (drills never do). */
function latestScored(sessions: SessionSummary[]): SessionSummary | null {
  let best: SessionSummary | null = null;
  for (const s of sessions) {
    if (s.finishedAt === null || !s.score) continue;
    if (!best || s.finishedAt > (best.finishedAt as number)) best = s;
  }
  return best;
}

function lastActivity(sessions: SessionSummary[]): number | null {
  let latest: number | null = null;
  for (const s of sessions) {
    const t = s.finishedAt ?? s.createdAt;
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

function SittingRow({ uid, s }: { uid: string; s: SessionSummary }) {
  const finished = s.finishedAt !== null;
  const isDrill = s.kind === "drill";
  // Drills have no score report (score is always null for them -- see
  // summaryOf in serve.ts) -- the per-sitting report route has nothing to
  // render for one, so a finished drill shows its result inline here
  // instead of linking there. Only a finished adaptive/practice sitting
  // links to the report.
  const status = !finished
    ? <span className="text-dust">In progress</span>
    : isDrill
      ? <span className="text-dust">{s.correct}/{s.total} correct</span>
      : s.score
        ? <ScoreBadge score={s.score} />
        : <span className="text-dust">Finished</span>;
  const inner = (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
      <span className="min-w-0 truncate text-fog">{s.title}</span>
      <span className="shrink-0 text-dust">{formatPk(s.createdAt)}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">{status}{s.overtime ? <OvertimeTag /> : null}</span>
    </div>
  );
  if (!finished || isDrill) return <div className="min-w-0 rounded-lg px-2 py-1.5">{inner}</div>;
  return (
    <Link href={`/portal/sat-lab/results/${uid}/${s.id}`} className="block min-w-0 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      {inner}
    </Link>
  );
}

function StudentRow({ s }: { s: ResultsStudent }) {
  if (s.sessions === null) {
    return (
      <li className="min-w-0 rounded-xl border border-signal/30 bg-signal/5 px-3 py-2.5 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-ice">{s.name}</p>
          <span className="shrink-0 text-xs text-dust">{s.className}</span>
        </div>
        <p className="mt-1 text-xs text-fog">Couldn&rsquo;t load — refresh</p>
      </li>
    );
  }
  const finishedCount = s.sessions.filter((x) => x.finishedAt !== null).length;
  const latest = latestScored(s.sessions);
  const last = lastActivity(s.sessions);
  return (
    <li className="min-w-0 rounded-xl border border-white/10 px-3 py-2.5 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-ice">{s.name}</p>
          <p className="truncate text-xs text-dust">
            {s.className} · {finishedCount} finished · {last !== null ? formatPk(last) : "No activity yet"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {latest?.score ? <ScoreBadge score={latest.score} /> : <span className="text-xs text-dust">No scored sittings yet</span>}
          {latest?.overtime ? <OvertimeTag /> : null}
        </div>
      </div>
      {s.sessions.length ? (
        <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
          {s.sessions.map((sess) => (
            <li key={sess.id} className="min-w-0">
              <SittingRow uid={s.uid} s={sess} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-fog">No sittings yet.</p>
      )}
    </li>
  );
}

export function SatResults() {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/sat/results", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "The results couldn't be loaded.");
      setData(j as ResultsPayload);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  if (error && !data) {
    return (
      <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
        {error} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button>
      </p>
    );
  }
  if (!data) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading results…</p>;

  if (!data.students.length) {
    return <p className="rounded-2xl border border-white/10 bg-space/60 p-5 text-sm text-fog">No SAT students in your classes yet.</p>;
  }

  return (
    <ul className="min-w-0 space-y-2">
      {data.students.map((s) => <StudentRow key={s.uid} s={s} />)}
    </ul>
  );
}
