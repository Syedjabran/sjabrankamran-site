"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { DOMAIN_LABEL, DOMAIN_SECTIONS, type PracticeTestInfo } from "@/lib/sat/client-types";
// course-labels.ts is pure and isomorphic (no server imports, no `@/lib/sat/*`
// answer-key modules) -- safe here even though course-access.ts (which
// re-exports it) is not. See scripts/test-sat-access.mjs for the same split.
import { courseFromYear } from "@/lib/portal/course-labels";

type Kind = "adaptive" | "practice" | "drill";
type Mode = "class" | "students";
type SectionFilter = "" | "rw" | "math";
type DifficultyFilter = "" | "E" | "M" | "H";

type ClassRow = { id: string; name: string; school: string; year: string | null; students: number; active: boolean };
type StudentRow = { uid: string; name: string; className: string };

// Server enforces the same 5–30 bound (drills.ts DRILL_MIN/DRILL_MAX) and the
// same domain/difficulty literals -- kept as plain values here rather than
// imported, since drills.ts/bank.ts pull in the question bank and must never
// reach a client bundle (same convention as sat-hub.tsx's drill filter).
const DRILL_COUNT_MIN = 5;
const DRILL_COUNT_MAX = 30;
const DRILL_COUNT_DEFAULT = 10;
const DIFFICULTY_LABEL: Record<"E" | "M" | "H", string> = { E: "Easy", M: "Medium", H: "Hard" };

const FIELD = "mt-1 w-full min-w-0 rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none";
const LABEL = "block min-w-0 text-xs text-fog";

function drillTitle(section: SectionFilter, domain: string, difficulty: DifficultyFilter): string {
  const parts = [
    section ? (section === "rw" ? "Reading and Writing" : "Math") : "Mixed",
    domain ? (DOMAIN_LABEL[domain] ?? domain) : null,
    difficulty ? DIFFICULTY_LABEL[difficulty] : null,
  ].filter(Boolean);
  return `${parts.join(" · ")} drill`;
}

/**
 * Staff-only "Assign" panel in the SAT Lab hub (Task 9). Class choices come
 * from the caller's own SAT class scope: GET /api/portal/admin/classes
 * (every class visible to the caller) filtered here to SAT-track classes by
 * `courseFromYear`; the server independently re-derives and enforces the
 * same scope (`satClassScope`) on POST, so this filter is a UI convenience,
 * never the actual gate. The student picker reuses GET /api/sat/results
 * (already scoped to the caller's SAT students, staff excluded) rather than
 * a new endpoint.
 */
export function SatAssign({ practiceTests }: { practiceTests: PracticeTestInfo[] }) {
  const [kind, setKind] = useState<Kind>("adaptive");
  const [testNo, setTestNo] = useState<number | null>(practiceTests[0]?.testNo ?? null);
  const [drillSection, setDrillSection] = useState<SectionFilter>("");
  const [drillDomain, setDrillDomain] = useState("");
  const [drillDifficulty, setDrillDifficulty] = useState<DifficultyFilter>("");
  const [drillCount, setDrillCount] = useState(DRILL_COUNT_DEFAULT);

  const [mode, setMode] = useState<Mode>("class");
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);

  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per assignment: a retry after a failure reuses it, so a retried
  // POST is recognised server-side as the same assignment (adds nothing
  // twice, re-notifies nobody who already had it) instead of creating a
  // second one. Only rotated after a successful Assign.
  const idemKey = useRef(crypto.randomUUID());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portal/admin/classes", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Classes couldn't be loaded.");
        const rows = ((j.classes ?? []) as ClassRow[]).filter((c) => c.active && courseFromYear(c.year || "") === "SAT");
        setClasses(rows);
      } catch (e) {
        setClassesError((e as Error).message);
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/sat/results", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Students couldn't be loaded.");
        type ResultsStudent = { uid: string; name: string; className: string };
        setStudents(((j.students ?? []) as ResultsStudent[]).map((s) => ({ uid: s.uid, name: s.name, className: s.className })));
      } catch (e) {
        setStudentsError((e as Error).message);
      }
    })();
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setSelectedClassIds([]);
    setSelectedUids([]);
  }

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  const domainOptions = DOMAIN_SECTIONS.filter((d) => !drillSection || d.section === drillSection);

  const title = useMemo(() => {
    if (kind === "adaptive") return "Adaptive mock exam";
    if (kind === "practice") return testNo ? `Practice Test ${testNo}` : null;
    return drillTitle(drillSection, drillDomain, drillDifficulty);
  }, [kind, testNo, drillSection, drillDomain, drillDifficulty]);

  const recipientCount = useMemo(() => {
    if (mode === "class") return (classes ?? []).filter((c) => selectedClassIds.includes(c.id)).reduce((n, c) => n + c.students, 0);
    return selectedUids.length;
  }, [mode, classes, selectedClassIds, selectedUids]);

  const scopeLabel = useMemo(() => {
    if (mode === "class") {
      const names = (classes ?? []).filter((c) => selectedClassIds.includes(c.id)).map((c) => c.name);
      if (!names.length) return null;
      return names.length === 1 ? `in ${names[0]}` : `in ${names.length} classes`;
    }
    return selectedUids.length ? "for the selected students" : null;
  }, [mode, classes, selectedClassIds, selectedUids]);

  const hasRecipients = mode === "class" ? selectedClassIds.length > 0 : selectedUids.length > 0;
  const canAssign = !busy && title !== null && hasRecipients && (kind !== "practice" || testNo !== null);

  async function assign() {
    if (!canAssign || !title) return;
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        kind,
        idempotencyKey: idemKey.current,
        dueAt: dueAt || undefined,
        classIds: mode === "class" ? selectedClassIds : undefined,
        studentUids: mode === "students" ? selectedUids : undefined,
      };
      if (kind === "practice") payload.testNo = testNo;
      if (kind === "drill") {
        payload.count = drillCount;
        payload.filter = { section: drillSection || undefined, domain: drillDomain || undefined, difficulty: drillDifficulty || undefined };
      }
      const res = await fetch("/api/sat/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Please try again.");
      setResult({ added: j.added ?? 0, failed: j.failed ?? 0 });
      idemKey.current = crypto.randomUUID();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border border-cyan/20 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice">Assign SAT work</h2>
      <p className="mt-1 text-xs text-dust">Students see it under &ldquo;Assigned to you&rdquo; and it&rsquo;s marked in progress / done as they sit it.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={LABEL}>
          What
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={FIELD}>
            <option value="adaptive">Adaptive mock exam</option>
            <option value="practice">Official practice test</option>
            <option value="drill">Drill</option>
          </select>
        </label>

        {kind === "practice" ? (
          <label className={LABEL}>
            Test
            {practiceTests.length ? (
              <select value={testNo ?? ""} onChange={(e) => setTestNo(e.target.value ? Number(e.target.value) : null)} className={FIELD}>
                {practiceTests.map((t) => <option key={t.testNo} value={t.testNo}>Practice Test {t.testNo}</option>)}
              </select>
            ) : <p className="mt-1 text-xs text-fog">Official practice tests are being prepared.</p>}
          </label>
        ) : null}

        {kind === "drill" ? (
          <>
            <label className={LABEL}>
              Section
              <select value={drillSection} onChange={(e) => { setDrillSection(e.target.value as SectionFilter); setDrillDomain(""); }} className={FIELD}>
                <option value="">Any</option>
                <option value="rw">Reading and Writing</option>
                <option value="math">Math</option>
              </select>
            </label>
            <label className={LABEL}>
              Domain
              <select value={drillDomain} onChange={(e) => setDrillDomain(e.target.value)} className={FIELD}>
                <option value="">Any domain</option>
                {domainOptions.map((d) => <option key={d.value} value={d.value}>{DOMAIN_LABEL[d.value] ?? d.value}</option>)}
              </select>
            </label>
            <label className={LABEL}>
              Difficulty
              <select value={drillDifficulty} onChange={(e) => setDrillDifficulty(e.target.value as DifficultyFilter)} className={FIELD}>
                <option value="">Any</option>
                <option value="E">Easy</option>
                <option value="M">Medium</option>
                <option value="H">Hard</option>
              </select>
            </label>
            <label className={LABEL}>
              Questions
              <input
                type="number" min={DRILL_COUNT_MIN} max={DRILL_COUNT_MAX} step={1} value={drillCount}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  setDrillCount(Number.isFinite(n) ? Math.min(DRILL_COUNT_MAX, Math.max(DRILL_COUNT_MIN, n)) : DRILL_COUNT_DEFAULT);
                }}
                className={FIELD}
              />
            </label>
          </>
        ) : null}

        <label className={LABEL}>
          Due (optional · Pakistan time)
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={FIELD} />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-1 rounded-xl border border-white/10 bg-void p-1 text-xs">
        <button type="button" onClick={() => switchMode("class")} className={"rounded-lg px-3 py-1.5 " + (mode === "class" ? "bg-cyan text-abyss" : "text-dust hover:text-ice")}>By class</button>
        <button type="button" onClick={() => switchMode("students")} className={"rounded-lg px-3 py-1.5 " + (mode === "students" ? "bg-cyan text-abyss" : "text-dust hover:text-ice")}>By student</button>
      </div>

      {mode === "class" ? (
        classesError ? <p className="mt-2 text-xs text-signal">{classesError}</p> :
        !classes ? <p className="mt-2 flex items-center gap-2 text-xs text-dust"><Loader2 size={12} className="animate-spin" /> Loading your classes…</p> :
        !classes.length ? <p className="mt-2 text-xs text-fog">No SAT classes are mapped to your account.</p> : (
          <div className="mt-2 grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-void p-2 sm:grid-cols-2">
            {classes.map((c) => {
              const on = selectedClassIds.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggle(selectedClassIds, setSelectedClassIds, c.id)}
                  className={"min-w-0 rounded-lg px-2.5 py-2 text-left text-sm transition " + (on ? "bg-cyan/15 text-ice" : "text-fog hover:bg-white/[0.04]")}>
                  <span className="block truncate">{c.name}</span>
                  <span className="block truncate text-xs text-dust">{c.school} · {c.students} students</span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        studentsError ? <p className="mt-2 text-xs text-signal">{studentsError}</p> :
        !students ? <p className="mt-2 flex items-center gap-2 text-xs text-dust"><Loader2 size={12} className="animate-spin" /> Loading students…</p> :
        !students.length ? <p className="mt-2 text-xs text-fog">No SAT students are in your classes.</p> : (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-void p-2">
            {students.map((s) => {
              const on = selectedUids.includes(s.uid);
              return (
                <button key={s.uid} type="button" onClick={() => toggle(selectedUids, setSelectedUids, s.uid)}
                  className={"flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition " + (on ? "bg-cyan/15 text-ice" : "text-fog hover:bg-white/[0.04]")}>
                  <span className="min-w-0 truncate">{s.name}</span>
                  <span className="shrink-0 text-xs text-dust">{s.className}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {result ? (
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald2/30 bg-emerald2/5 px-3 py-2.5 text-sm text-emerald2">
          <span className="min-w-0">
            Assigned to {result.added} {result.added === 1 ? "student" : "students"}{result.failed ? ` · ${result.failed} couldn't be reached, try again` : ""}.
          </span>
          <button type="button" onClick={() => setResult(null)} className="ml-auto shrink-0 text-xs text-emerald2 underline">Assign another</button>
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="min-w-0 text-sm text-fog">
            {title && scopeLabel ? `Assign ${title} to ${recipientCount || 0} ${recipientCount === 1 ? "student" : "students"} ${scopeLabel}?` : "Choose what to assign and who to."}
          </p>
          <button type="button" disabled={!canAssign} onClick={assign} className="btn-primary ml-auto inline-flex shrink-0 items-center gap-2 !px-4 !py-2 text-sm disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Assign
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-signal">{error}</p> : null}
    </section>
  );
}
