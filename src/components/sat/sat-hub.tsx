"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { DRILL_COUNT_DEFAULT, type AssignmentView, type PracticeTestInfo, type SessionSummary } from "@/lib/sat/client-types";
import { formatPk } from "@/lib/portal/pk-time";
import { ScoreBadge } from "./score-badge";
import { SatAssign } from "./sat-assign";
import { DrillFields, type DifficultyFilter, type SectionFilter } from "./drill-fields";

type SessionsPayload = {
  sessions: SessionSummary[];
  practiceTests: PracticeTestInfo[];
  conversionTables: boolean;
  routingDisclosure: string;
};

function statusLabel(s: SessionSummary): string {
  return s.finishedAt === null ? "In progress" : `${s.correct}/${s.total}`;
}

export function SatHub({ isStaff }: { isStaff: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<SessionsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [drillSection, setDrillSection] = useState<SectionFilter>("");
  const [drillDomain, setDrillDomain] = useState("");
  const [drillDifficulty, setDrillDifficulty] = useState<DifficultyFilter>("");
  const [drillCount, setDrillCount] = useState(DRILL_COUNT_DEFAULT);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/sat/sessions", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "The SAT Lab couldn't be loaded.");
      setData(j as SessionsPayload);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  // Staff are never assigned SAT work themselves, so this never runs for them.
  useEffect(() => {
    if (isStaff) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/sat/assignments?mine=1", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Your assignments couldn't be loaded.");
        if (alive) setAssignments((j.items ?? []) as AssignmentView[]);
      } catch (e) {
        if (alive) setAssignmentsError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [isStaff]);

  async function start(key: string, body: Record<string, unknown>) {
    setBusyKey(key); setActionError(null);
    try {
      const res = await fetch("/api/sat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Please try again.");
      router.push(`/portal/sat-lab/${j.id}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusyKey(null);
    }
  }

  // Fix round 1 ruling: the client sends ONLY kind + assignmentId -- never
  // testNo/filter/count, even for a practice/drill assignment whose values
  // it already knows. The server takes those from the caller's OWN stored
  // assignment (never trusting the body), so sending them here would be
  // dead weight at best and a misleading (ignored) value at worst.
  function startAssignment(a: AssignmentView) {
    void start(`assign-${a.id}`, { kind: a.kind, assignmentId: a.id });
  }

  if (loadError && !data) {
    return (
      <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
        {loadError} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button>
      </p>
    );
  }
  if (!data) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading the SAT Lab…</p>;

  return (
    <div className="space-y-6">
      {actionError ? <p className="rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-fog">{actionError}</p> : null}

      {isStaff ? <SatAssign practiceTests={data.practiceTests} /> : null}

      {!isStaff && assignments.length ? (
        <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
          <h2 className="font-display text-lg text-ice">Assigned to you</h2>
          <ul className="mt-3 space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ice">{a.title}</p>
                  <p className="truncate text-xs text-dust">{a.dueAt ? `Due ${formatPk(a.dueAt)}` : "No due date"} · {a.assignedByName}</p>
                </div>
                <span className="ml-auto shrink-0 text-xs text-dust">
                  {a.status === "assigned" ? "Not started" : a.status === "in_progress" ? "In progress" : "Done"}
                </span>
                {a.status === "assigned" ? (
                  <button disabled={busyKey === `assign-${a.id}`} onClick={() => startAssignment(a)} className="btn-primary shrink-0 !px-3 !py-1.5 text-xs disabled:opacity-40">Start</button>
                ) : a.status === "in_progress" && a.sessionId ? (
                  <button onClick={() => router.push(`/portal/sat-lab/${a.sessionId}`)} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Resume</button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {assignmentsError ? <p className="text-xs text-signal">{assignmentsError}</p> : null}

      <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="font-display text-lg text-ice">Adaptive mock exam</h2>
        <p className="mt-2 text-sm text-fog">
          98 questions in four modules — Reading and Writing: 27 questions × 32 minutes per module; Math: 22 questions × 35 minutes per module — with a 10-minute break between sections. Module 2 of each section adapts to your Module 1 performance.
        </p>
        {!data.conversionTables ? <p className="mt-2 text-xs text-amber-200">Scores for mock exams appear once the official conversion tables are loaded.</p> : null}
        <p className="mt-3 flex gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-dust"><Info size={14} className="mt-0.5 shrink-0" />{data.routingDisclosure}</p>
        <button disabled={busyKey === "adaptive"} onClick={() => void start("adaptive", { kind: "adaptive" })} className="btn-primary mt-4 !px-4 !py-2 text-sm disabled:opacity-40">
          {busyKey === "adaptive" ? <Loader2 size={14} className="animate-spin" /> : "Start adaptive mock"}
        </button>
      </section>

      <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="font-display text-lg text-ice">Official practice tests</h2>
        {data.practiceTests.length ? (
          <ul className="mt-3 space-y-2">
            {data.practiceTests.map((t) => {
              const key = `practice-${t.testNo}`;
              return (
                <li key={t.testNo} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-fog">
                    Practice Test {t.testNo} · {t.questions} questions · {t.minutes ? `R&W ${t.minutes.rw[0]}+${t.minutes.rw[1]} min, Math ${t.minutes.math[0]}+${t.minutes.math[1]} min` : "Timings not loaded yet"}
                  </span>
                  <button disabled={!t.minutes || busyKey === key} onClick={() => void start(key, { kind: "practice", testNo: t.testNo })} className="btn-primary ml-auto shrink-0 !px-3 !py-1.5 text-xs disabled:opacity-40">
                    {busyKey === key ? <Loader2 size={14} className="animate-spin" /> : "Start"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-2 text-sm text-fog">Official practice tests are being prepared.</p>}
      </section>

      <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="font-display text-lg text-ice">Drill</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <DrillFields
            section={drillSection} domain={drillDomain} difficulty={drillDifficulty} count={drillCount}
            onSectionChange={setDrillSection} onDomainChange={setDrillDomain}
            onDifficultyChange={setDrillDifficulty} onCountChange={setDrillCount}
          />
        </div>
        <button
          disabled={busyKey === "drill"}
          onClick={() => void start("drill", { kind: "drill", filter: { section: drillSection || undefined, domain: drillDomain || undefined, difficulty: drillDifficulty || undefined }, count: drillCount })}
          className="btn-primary mt-4 !px-4 !py-2 text-sm disabled:opacity-40"
        >
          {busyKey === "drill" ? <Loader2 size={14} className="animate-spin" /> : "Start drill"}
        </button>
      </section>

      <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="font-display text-lg text-ice">History</h2>
        {data.sessions.length ? (
          <ul className="mt-3 space-y-2">
            {data.sessions.map((s) => {
              const finished = s.finishedAt !== null;
              return (
                <li key={s.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-ice">{s.title}</p>
                    <p className="text-xs text-dust">{formatPk(s.createdAt)}</p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-xs text-dust">{statusLabel(s)}</span>
                  {finished && s.score ? <ScoreBadge score={s.score} /> : null}
                  <button onClick={() => router.push(`/portal/sat-lab/${s.id}`)} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">{finished ? "Report" : "Resume"}</button>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-2 text-sm text-fog">Nothing started yet.</p>}
      </section>
    </div>
  );
}
