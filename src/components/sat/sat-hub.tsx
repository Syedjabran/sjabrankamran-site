"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import type { AssignmentView, PracticeTestInfo, SessionSummary } from "@/lib/sat/client-types";
import { formatPk } from "@/lib/portal/pk-time";

type SessionsPayload = {
  sessions: SessionSummary[];
  practiceTests: PracticeTestInfo[];
  conversionTables: boolean;
  routingDisclosure: string;
};

// String-literal unions kept local (not imported from lib/sat/types.ts) so
// this client component never reaches past client-types.ts into the
// answer-key-carrying side of src/lib/sat/.
type SectionFilter = "" | "rw" | "math";
type DifficultyFilter = "" | "E" | "M" | "H";

const DOMAINS: { value: string; label: string; section: "rw" | "math" }[] = [
  { value: "information-ideas", label: "Information and Ideas", section: "rw" },
  { value: "craft-structure", label: "Craft and Structure", section: "rw" },
  { value: "expression-ideas", label: "Expression of Ideas", section: "rw" },
  { value: "standard-english", label: "Standard English Conventions", section: "rw" },
  { value: "algebra", label: "Algebra", section: "math" },
  { value: "advanced-math", label: "Advanced Math", section: "math" },
  { value: "psda", label: "Problem-Solving and Data Analysis", section: "math" },
  { value: "geometry-trig", label: "Geometry and Trigonometry", section: "math" },
];

// Server enforces the same 5–30 bound (drills.ts DRILL_MIN/DRILL_MAX); kept
// as plain numbers here rather than imported, since drills.ts pulls in
// bank.ts (the answer key) and must never reach a client bundle.
const DRILL_COUNT_MIN = 5;
const DRILL_COUNT_MAX = 30;
const DRILL_COUNT_DEFAULT = 10;

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

  // Task 9 adds GET /api/sat/assignments?mine=1 -- until then this always
  // 404s, which is treated as "no assignments" rather than an error. Staff
  // are never assigned SAT work themselves, so this never runs for them.
  useEffect(() => {
    if (isStaff) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/sat/assignments?mine=1", { cache: "no-store" });
        if (res.status === 404) { if (alive) setAssignments([]); return; }
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

  function startAssignment(a: AssignmentView) {
    const key = `assign-${a.id}`;
    if (a.kind === "adaptive") void start(key, { kind: "adaptive", assignmentId: a.id });
    else if (a.kind === "practice") void start(key, { kind: "practice", testNo: a.testNo, assignmentId: a.id });
    else void start(key, { kind: "drill", count: DRILL_COUNT_DEFAULT, assignmentId: a.id });
  }

  if (loadError && !data) {
    return (
      <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
        {loadError} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button>
      </p>
    );
  }
  if (!data) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading the SAT Lab…</p>;

  const domainOptions = DOMAINS.filter((d) => !drillSection || d.section === drillSection);

  return (
    <div className="space-y-6">
      {actionError ? <p className="rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-fog">{actionError}</p> : null}

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
                    Practice Test {t.testNo} · 120 questions · {t.minutes ? `R&W ${t.minutes.rw[0]}+${t.minutes.rw[1]} min, Math ${t.minutes.math[0]}+${t.minutes.math[1]} min` : "Timings not loaded yet"}
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
          <label className="block min-w-0 text-xs text-fog">
            Section
            <select value={drillSection} onChange={(e) => { setDrillSection(e.target.value as SectionFilter); setDrillDomain(""); }} className="mt-1 w-full rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none">
              <option value="">Any</option>
              <option value="rw">Reading and Writing</option>
              <option value="math">Math</option>
            </select>
          </label>
          <label className="block min-w-0 text-xs text-fog">
            Domain
            <select value={drillDomain} onChange={(e) => setDrillDomain(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none">
              <option value="">Any domain</option>
              {domainOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-xs text-fog">
            Difficulty
            <select value={drillDifficulty} onChange={(e) => setDrillDifficulty(e.target.value as DifficultyFilter)} className="mt-1 w-full rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none">
              <option value="">Any</option>
              <option value="E">Easy</option>
              <option value="M">Medium</option>
              <option value="H">Hard</option>
            </select>
          </label>
          <label className="block min-w-0 text-xs text-fog">
            Questions
            <input
              type="number" min={DRILL_COUNT_MIN} max={DRILL_COUNT_MAX} step={1} value={drillCount}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                setDrillCount(Number.isFinite(n) ? Math.min(DRILL_COUNT_MAX, Math.max(DRILL_COUNT_MIN, n)) : DRILL_COUNT_DEFAULT);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none"
            />
          </label>
        </div>
        <button
          disabled={busyKey === "drill"}
          onClick={() => void start("drill", { kind: "drill", section: drillSection || undefined, domain: drillDomain || undefined, difficulty: drillDifficulty || undefined, count: drillCount })}
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
                  {finished && s.score ? (
                    <span className={"shrink-0 rounded-full border px-2 py-0.5 text-[11px] " + (s.score.authority === "official" ? "border-emerald2/30 text-emerald2" : "border-amber-300/30 text-amber-200")}>
                      {s.score.lower}–{s.score.upper} · {s.score.authority === "official" ? "Official score range" : "Estimated score"}
                    </span>
                  ) : null}
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
