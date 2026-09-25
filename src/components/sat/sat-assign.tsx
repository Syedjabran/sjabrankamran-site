"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import { Loader2, Send } from "lucide-react";
import { DIFFICULTY_LABEL, DOMAIN_LABEL, type PracticeTestInfo } from "@/lib/sat/client-types";
import { DrillFields, type DifficultyFilter, type SectionFilter } from "./drill-fields";
// course-labels.ts is pure and isomorphic (no server imports, no `@/lib/sat/*`
// answer-key modules) -- safe here even though course-access.ts (which
// re-exports it) is not. See scripts/test-sat-access.mjs for the same split.
import { courseFromYear } from "@/lib/portal/course-labels";

type Kind = "adaptive" | "practice" | "drill";
type Mode = "class" | "students";

type ClassRow = { id: string; name: string; school: string; year: string | null; students: number; active: boolean };
type StudentRow = { uid: string; name: string; className: string };

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
  // Fix round 1 minor: only a practice test whose timings are actually
  // loaded can be started at all (sat-hub.tsx's own list disables the
  // untimed ones the same way) -- never offer staff a test nobody could sit.
  const timedTests = useMemo(() => practiceTests.filter((t) => t.minutes), [practiceTests]);

  const [kind, setKind] = useState<Kind>("adaptive");
  const [testNo, setTestNo] = useState<number | null>(timedTests[0]?.testNo ?? null);
  const [drillSection, setDrillSection] = useState<SectionFilter>("");
  const [drillDomain, setDrillDomain] = useState("");
  const [drillDifficulty, setDrillDifficulty] = useState<DifficultyFilter>("");
  const [drillCount, setDrillCount] = useState(10);

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
  // One key per DISTINCT assignment: reused across a retry of that exact
  // payload (a network failure, or -- fix round 1 ruling 2 -- a partial
  // failure's "Retry the N that failed"), so the server recognises it as
  // the same assignment and, since a same-id entry is now left untouched
  // rather than rewritten, the retry only ever reaches students who don't
  // already have it. Only rotated after a FULLY successful send, or the
  // moment the payload actually changes (markDirty below) -- never mid-retry.
  const idemKey = useRef(crypto.randomUUID());
  // The exact payload last sent, kept only while a retry of it is still
  // possible (a partial failure); cleared on a full success (nothing left
  // to retry) or the moment anything changes (a stale payload must never
  // be resent under a key that no longer describes it).
  const lastPayloadRef = useRef<Record<string, unknown> | null>(null);

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

  // Fix round 1 ruling 1/2: any change to what would actually be sent
  // invalidates a pending retry -- rotate to a fresh key and drop the old
  // result/payload so a stale "Retry" can never fire under the wrong key
  // (or resend a payload the visible form no longer matches).
  function markDirty() {
    if (lastPayloadRef.current) {
      idemKey.current = crypto.randomUUID();
      lastPayloadRef.current = null;
      setResult(null);
    }
  }

  function switchMode(m: Mode) {
    markDirty();
    setMode(m);
    setSelectedClassIds([]);
    setSelectedUids([]);
  }

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    markDirty();
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

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

  function buildPayload(): Record<string, unknown> {
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
    return payload;
  }

  async function send(payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/sat/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Please try again.");
      const added = Number(j.added ?? 0);
      const failed = Number(j.failed ?? 0);
      setResult({ added, failed });
      if (failed > 0) {
        // Partial failure: keep the key AND the exact payload so "Retry
        // the N that failed" resends it unchanged -- now that a same-id
        // entry is left untouched (fix round 1 ruling 1), that retry only
        // ever reaches the students who are still missing it.
        lastPayloadRef.current = payload;
      } else {
        // Fully successful: nothing left to retry. Rotate the key so the
        // NEXT Assign (a genuinely different assignment) never reuses it.
        idemKey.current = crypto.randomUUID();
        lastPayloadRef.current = null;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function assign() {
    if (!canAssign) return;
    void send(buildPayload());
  }

  function retryFailed() {
    if (lastPayloadRef.current) void send(lastPayloadRef.current);
  }

  function assignAnother() {
    setResult(null);
    lastPayloadRef.current = null;
    idemKey.current = crypto.randomUUID();
  }

  return (
    <section className="min-w-0 rounded-2xl border border-cyan/20 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice">Assign SAT work</h2>
      <p className="mt-1 text-xs text-dust">Students see it under &ldquo;Assigned to you&rdquo; and it&rsquo;s marked in progress / done as they sit it.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={LABEL}>
          What
          <select value={kind} onChange={(e) => { markDirty(); setKind(e.target.value as Kind); }} className={FIELD}>
            <option value="adaptive">Adaptive mock exam</option>
            <option value="practice">Official practice test</option>
            <option value="drill">Drill</option>
          </select>
        </label>

        {kind === "practice" ? (
          <label className={LABEL}>
            Test
            {timedTests.length ? (
              <select value={testNo ?? ""} onChange={(e) => { markDirty(); setTestNo(e.target.value ? Number(e.target.value) : null); }} className={FIELD}>
                {timedTests.map((t) => <option key={t.testNo} value={t.testNo}>Practice Test {t.testNo}</option>)}
              </select>
            ) : <p className="mt-1 text-xs text-fog">Official practice tests are being prepared.</p>}
          </label>
        ) : null}

        {kind === "drill" ? (
          <DrillFields
            section={drillSection} domain={drillDomain} difficulty={drillDifficulty} count={drillCount}
            onSectionChange={(v) => { markDirty(); setDrillSection(v); }}
            onDomainChange={(v) => { markDirty(); setDrillDomain(v); }}
            onDifficultyChange={(v) => { markDirty(); setDrillDifficulty(v); }}
            onCountChange={(v) => { markDirty(); setDrillCount(v); }}
            labelClassName={LABEL}
          />
        ) : null}

        <label className={LABEL}>
          Due (optional · Pakistan time)
          <input type="datetime-local" value={dueAt} onChange={(e) => { markDirty(); setDueAt(e.target.value); }} className={FIELD} />
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
                  <span className="max-w-[45%] shrink-0 truncate text-xs text-dust">{s.className}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {result && result.failed > 0 ? (
        // Partial failure: KEEP the key and the exact payload (fix round 1
        // ruling 2) -- "Assign another" is deliberately not offered here,
        // since it only rotates the key after a FULLY successful send.
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/5 px-3 py-2.5 text-sm text-amber-200">
          <span className="min-w-0">Assigned to {result.added} {result.added === 1 ? "student" : "students"} · {result.failed} couldn&rsquo;t be reached.</span>
          <button type="button" disabled={busy} onClick={retryFailed} className="ml-auto shrink-0 text-xs text-amber-200 underline disabled:opacity-40">
            {busy ? "Retrying…" : `Retry the ${result.failed} that failed`}
          </button>
        </div>
      ) : result ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald2/30 bg-emerald2/5 px-3 py-2.5 text-sm text-emerald2">
          <span className="min-w-0">Assigned to {result.added} {result.added === 1 ? "student" : "students"}.</span>
          <button type="button" onClick={assignAnother} className="ml-auto shrink-0 text-xs text-emerald2 underline">Assign another</button>
        </div>
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
