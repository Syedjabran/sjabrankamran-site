"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Loader2, School, Globe2, Info, AlertTriangle } from "lucide-react";

type ClassChoice = { id: string; name: string; school: string; section?: string | null; students?: number; active: boolean };
type TopicInfo = { name: string; group: string; bankCount: number };
type CoverageRow = {
  id: string; course: string; topic: string;
  scope_type: "class" | "school" | "network";
  scope_id: string; scope_label: string;
  covered_at: string; covered_by_name: string | null; note: string | null;
};

type Scope = { type: "class" | "school" | "network"; id: string; label: string };

/** Syllabus coverage recorder — staff tick topics completed per class/school. */
export function SyllabusCoverageClient({ isAdmin }: { isAdmin: boolean }) {
  const [classes, setClasses] = useState<ClassChoice[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [scope, setScope] = useState<Scope | null>(null);
  const [course] = useState("9702");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTopic, setBusyTopic] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/portal/admin/classes").then((r) => (r.ok ? r.json() : { classes: [], schools: [] })),
      fetch(`/api/portal/admin/syllabus-coverage?course=${course}`).then((r) => (r.ok ? r.json() : { rows: [], topics: [] })),
    ]).then(([c, cov]) => {
      if (!alive) return;
      setClasses((c.classes || []) as ClassChoice[]);
      setSchools((c.schools || []) as string[]);
      setRows((cov.rows || []) as CoverageRow[]);
      setTopics((cov.topics || []) as TopicInfo[]);
      const firstClass = (c.classes || [])[0] as ClassChoice | undefined;
      if (firstClass) setScope({ type: "class", id: firstClass.id, label: classLabel(firstClass) });
      else if ((c.schools || [])[0]) setScope({ type: "school", id: (c.schools || [])[0], label: (c.schools || [])[0] });
      setLoading(false);
    }).catch(() => { if (alive) { setError("Could not load coverage data."); setLoading(false); } });
    return () => { alive = false; };
  }, [course]);

  const classLabel = (c: ClassChoice) => `${c.name}${c.section ? ` · ${c.section}` : ""} (${c.school})`;

  const covered = useMemo(() => {
    if (!scope) return new Map<string, CoverageRow>();
    const direct = new Map(rows.filter((r) => r.scope_type === scope.type && r.scope_id === scope.id).map((r) => [r.topic, r] as const));
    // A class view also shows school + network coverage as read-only context.
    if (scope.type === "class") {
      for (const r of rows) {
        if ((r.scope_type === "school" && classes.some((c) => c.id === scope.id && c.school === r.scope_id)) || r.scope_type === "network") {
          if (!direct.has(r.topic)) direct.set(r.topic, r);
        }
      }
    }
    return direct;
  }, [rows, scope, classes]);

  const inherited = useCallback((topic: string) => {
    if (!scope) return false;
    const row = covered.get(topic);
    if (!row) return false;
    return !(row.scope_type === scope.type && row.scope_id === scope.id);
  }, [covered, scope]);

  const toggle = async (topic: string, mark: boolean) => {
    if (!scope || busyTopic) return;
    setBusyTopic(topic);
    setError("");
    try {
      const r = await fetch("/api/portal/admin/syllabus-coverage", {
        method: mark ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course, topic, scope_type: scope.type, scope_id: scope.id, scope_label: scope.label }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save.");
      setRows((prev) =>
        mark
          ? [j.row as CoverageRow, ...prev.filter((x) => !(x.topic === topic && x.scope_type === scope.type && x.scope_id === scope.id))]
          : prev.filter((x) => !(x.topic === topic && x.scope_type === scope.type && x.scope_id === scope.id)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyTopic(null);
    }
  };

  if (loading) {
    return <p className="flex items-center gap-2 rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-dust"><Loader2 size={15} className="animate-spin" /> Loading your classes and coverage…</p>;
  }

  if (!scope) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-6 text-sm text-fog">
        <p className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle size={16} /> No classes in your scope</p>
        <p className="mt-2">Ask an administrator to map your classes first. Until coverage is recorded here, drills and daily challenges cannot be assigned to your students.</p>
      </div>
    );
  }

  const groups = ["AS", "A2", "Other"].filter((g) => topics.some((t) => t.group === g));
  const coveredCount = topics.filter((t) => covered.has(t.name)).length;

  return (
    <div className="space-y-5">
      {/* scope picker */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Who is this coverage for?</p>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => {
            const on = scope.type === "class" && scope.id === c.id;
            return (
              <button key={c.id} onClick={() => setScope({ type: "class", id: c.id, label: classLabel(c) })}
                className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition " + (on ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>
                <BookOpen size={12} /> {classLabel(c)}
              </button>
            );
          })}
          {schools.map((s) => {
            const on = scope.type === "school" && scope.id === s;
            return (
              <button key={s} onClick={() => setScope({ type: "school", id: s, label: s })}
                className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition " + (on ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>
                <School size={12} /> {s} · whole school
              </button>
            );
          })}
          {isAdmin && (
            <button onClick={() => setScope({ type: "network", id: "*", label: "Whole network" })}
              className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition " + (scope.type === "network" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>
              <Globe2 size={12} /> Whole network
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-dust">
          Class ticks apply to that class only. A school tick covers every class in the school. CAIE 9702 taxonomy shown; other courses coming as their banks land.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-signal/35 bg-signal/[0.06] px-4 py-2.5 text-sm text-signal">{error}</p> : null}

      {/* progress */}
      <div className="rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fog">
            <b className="text-ice">{scope.label}</b> — <b className="text-emerald2">{coveredCount}</b> of <b className="text-ice">{topics.length}</b> 9702 topics marked complete
          </p>
          {coveredCount === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-300"><AlertTriangle size={13} /> Nothing marked yet — drills & daily challenges are refused for this scope until you tick at least one topic.</p>
          ) : null}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald2 to-cyan transition-all" style={{ width: `${topics.length ? Math.round((coveredCount / topics.length) * 100) : 0}%` }} />
        </div>
      </div>

      {/* topic checklist */}
      {groups.map((g) => (
        <section key={g} className="rounded-2xl border border-white/10 bg-space/60 p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-fog">{g === "AS" ? "AS Level (Year 1)" : g === "A2" ? "A2 (Year 2)" : "Other topics in the bank"}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topics.filter((t) => t.group === g).map((t) => {
              const row = covered.get(t.name);
              const on = !!row;
              const isInherited = on && inherited(t.name);
              const busy = busyTopic === t.name;
              return (
                <button key={t.name} type="button" disabled={busy} onClick={() => void toggle(t.name, !(on && !isInherited))}
                  title={row ? `Covered ${new Date(row.covered_at).toLocaleDateString("en-GB")}${row.covered_by_name ? ` by ${row.covered_by_name}` : ""}${isInherited ? ` (via ${row.scope_type === "network" ? "network" : row.scope_label})` : ""}` : `${t.bankCount} questions in the bank`}
                  className={"flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 " +
                    (on ? "border-emerald2/50 bg-emerald2/[0.07]" : "border-white/10 bg-abyss/40 hover:border-white/25")}>
                  <span className={"mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border " + (on ? "border-emerald2 bg-emerald2 text-space" : "border-white/25 text-transparent")}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                  </span>
                  <span className="min-w-0">
                    <span className={"block text-sm " + (on ? "text-ice" : "text-fog")}>{t.name}</span>
                    <span className="block text-[11px] text-dust">
                      {t.bankCount} questions in bank
                      {isInherited ? " · covered at " + (row!.scope_type === "network" ? "network level" : row!.scope_label) : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <p className="flex items-start gap-2 text-xs text-dust">
        <Info size={14} className="mt-0.5 flex-none" />
        Ticks save immediately. To remove one of your own ticks, click it again. Topics covered at school or network level apply everywhere under them and are shown here for context — remove them from that scope first if needed.
      </p>
    </div>
  );
}
