"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Users, User, Search, Check, Loader2, Send, Printer, GraduationCap } from "lucide-react";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";

type ClassChoice = { id: string; name: string; school: string; section?: string | null; students?: number; active: boolean };
type StudentChoice = { id: string; name: string; email: string; classes: string[] };
type Mode = "classes" | "students";

/** Assign the paper on screen, not a recipe that would generate another paper. */
export function ClassDrillAssign({ questions, title, duration, onAssigned }: {
  questions: ImgQuestion[]; title: string; duration: number; onAssigned: (ref: string) => void;
}) {
  const preferredClass = useSearchParams().get("class");
  const [mode, setMode] = useState<Mode>("classes");
  const [classes, setClasses] = useState<ClassChoice[]>([]);
  const [selClasses, setSelClasses] = useState<Set<string>>(new Set());
  const [students, setStudents] = useState<StudentChoice[]>([]);
  const [selStudents, setSelStudents] = useState<Set<string>>(new Set());
  const [rosterLoading, setRosterLoading] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ ref: string; students: number } | null>(null);

  // Load the classes the staff member may reach.
  useEffect(() => {
    let alive = true;
    fetch("/api/portal/admin/classes").then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load classes.");
      if (!alive) return;
      const choices: ClassChoice[] = (j.classes || []).filter((c: ClassChoice) => c.active);
      setClasses(choices);
      if (preferredClass && choices.some((c) => c.id === preferredClass)) setSelClasses(new Set([preferredClass]));
    }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [preferredClass]);

  // In students mode, load the roster for the chosen classes.
  useEffect(() => {
    if (mode !== "students") return;
    const ids = [...selClasses];
    if (!ids.length) { setStudents([]); return; }
    let alive = true;
    setRosterLoading(true);
    fetch(`/api/portal/admin/drill-students?class_ids=${encodeURIComponent(ids.join(","))}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load students.");
      if (!alive) return;
      setStudents(j.students || []);
      // Drop any selected student no longer in the loaded roster.
      setSelStudents((prev) => new Set([...prev].filter((id) => (j.students || []).some((s: StudentChoice) => s.id === id))));
    }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setRosterLoading(false); });
    return () => { alive = false; };
  }, [mode, selClasses]);

  const filteredClasses = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return classes;
    return classes.filter((c) => `${c.name} ${c.school} ${c.section || ""}`.toLowerCase().includes(t));
  }, [classes, q]);
  const filteredStudents = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) => `${s.name} ${s.email} ${s.classes.join(" ")}`.toLowerCase().includes(t));
  }, [students, q]);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const canAssign = !loading && !busy && (mode === "classes" ? selClasses.size > 0 : selStudents.size > 0);

  async function assign() {
    setBusy(true); setError("");
    try {
      let body: Record<string, unknown>;
      if (mode === "classes") {
        const chosen = classes.filter((c) => selClasses.has(c.id));
        body = {
          target_type: chosen.length === 1 ? "class" : "group",
          class_ids: chosen.map((c) => c.id),
          scope_label: chosen.map((c) => c.name).join(", "),
        };
      } else {
        const chosen = students.filter((s) => selStudents.has(s.id));
        body = {
          target_type: "individual",
          student_ids: chosen.map((s) => s.id),
          scope_label: chosen.length === 1 ? chosen[0].name : `${chosen.length} students`,
        };
      }
      const r = await fetch("/api/portal/admin/exam-allocate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, mode: "assignment_help", title, content: { type: "custom", ids: questions.map((x) => x.id) }, duration_min: duration, notify: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not assign the drill. Please retry.");
      setResult({ ref: j.drillRef, students: j.students }); onAssigned(j.drillRef);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const tab = (m: Mode, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => { setMode(m); setQ(""); }}
      className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition " + (mode === m ? "bg-cyan text-abyss shadow-sm" : "text-dust hover:text-ice")}>
      {icon} {label}
    </button>
  );

  return (
    <section className="el-noprint mb-4 overflow-hidden rounded-2xl border border-white/10 bg-space/80 shadow-lg shadow-black/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan/15 text-cyan"><GraduationCap size={16} /></span>
          <div>
            <h2 className="font-semibold leading-tight text-ice">Assign this exact drill</h2>
            <p className="text-xs text-dust">{questions.length} questions · same paper &amp; order for everyone</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-abyss/60 p-1">
          {tab("classes", "Class / group", <Users size={14} />)}
          {tab("students", "Specific students", <User size={14} />)}
        </div>
      </header>

      {result ? (
        <div className="px-4 py-4">
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald2/30 bg-emerald2/5 px-3 py-2.5 text-sm text-emerald2">
            <Check size={16} /> Assigned to {result.students} {result.students === 1 ? "student" : "students"} · Reference <b className="font-mono">{result.ref}</b>
            <a className="ml-auto inline-flex items-center gap-1 rounded-lg border border-emerald2/40 px-2.5 py-1 text-xs hover:bg-emerald2/10" href={`/portal/admin/drills/${result.ref}/print`}><Printer size={12} /> Print / Save as PDF</a>
          </p>
        </div>
      ) : (
        <div className="px-4 py-4">
          {mode === "students" && (
            <p className="mb-2.5 text-xs text-dust">First tick the class(es) to pull a roster from, then choose the exact students below.</p>
          )}

          {/* class picker (always shown; drives roster in students mode) */}
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading your classes…</p>
          ) : !classes.length ? (
            <p className="rounded-xl border border-white/10 bg-abyss/40 px-3 py-2.5 text-sm text-fog">No classes are mapped to your account. Ask an administrator to assign your class.</p>
          ) : (
            <>
              {(classes.length > 6 || students.length > 8) && (
                <div className="relative mb-3">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dust" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "classes" ? "Search classes…" : "Search students…"}
                    className="w-full rounded-xl border border-white/10 bg-abyss/60 py-2 pl-9 pr-3 text-sm text-ice placeholder:text-dust/70 outline-none focus:border-cyan/50" />
                </div>
              )}

              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-dust">{mode === "students" ? "Roster source" : "Choose classes"}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filteredClasses.map((c) => {
                  const on = selClasses.has(c.id);
                  return (
                    <button key={c.id} type="button" disabled={busy} onClick={() => toggle(setSelClasses, c.id)}
                      className={"flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition " + (on ? "border-cyan/60 bg-cyan/10" : "border-white/10 bg-abyss/40 hover:border-white/25")}>
                      <span className={"grid h-5 w-5 shrink-0 place-items-center rounded-md border " + (on ? "border-cyan bg-cyan text-abyss" : "border-white/25 text-transparent")}><Check size={13} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ice">{c.name}</span>
                        <span className="block truncate text-xs text-dust">{c.school}{c.section ? ` · ${c.section}` : ""}{typeof c.students === "number" ? ` · ${c.students} students` : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* student picker */}
              {mode === "students" && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-dust">Students {selStudents.size ? `· ${selStudents.size} selected` : ""}</span>
                    {students.length > 0 && (
                      <div className="flex gap-2 text-xs">
                        <button type="button" className="text-cyan hover:underline" onClick={() => setSelStudents(new Set(filteredStudents.map((s) => s.id)))}>Select all</button>
                        <button type="button" className="text-dust hover:text-ice hover:underline" onClick={() => setSelStudents(new Set())}>Clear</button>
                      </div>
                    )}
                  </div>
                  {rosterLoading ? (
                    <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading roster…</p>
                  ) : !selClasses.size ? (
                    <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-dust">Pick a class above to see its students.</p>
                  ) : !students.length ? (
                    <p className="rounded-xl border border-white/10 bg-abyss/40 px-3 py-2.5 text-sm text-fog">No active students in the selected class(es).</p>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-abyss/40 p-2">
                      {filteredStudents.map((s) => {
                        const on = selStudents.has(s.id);
                        return (
                          <button key={s.id} type="button" disabled={busy} onClick={() => toggle(setSelStudents, s.id)}
                            className={"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition " + (on ? "bg-cyan/10" : "hover:bg-white/[0.04]")}>
                            <span className={"grid h-5 w-5 shrink-0 place-items-center rounded-md border " + (on ? "border-cyan bg-cyan text-abyss" : "border-white/25 text-transparent")}><Check size={13} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-ice">{s.name}</span>
                              <span className="block truncate text-xs text-dust">{s.email}{s.classes.length ? ` · ${s.classes.join(", ")}` : ""}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-primary inline-flex items-center gap-2 disabled:opacity-40" disabled={!canAssign} onClick={assign}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {busy ? "Assigning…" : mode === "classes" ? "Assign to selected classes" : `Assign to ${selStudents.size || ""} ${selStudents.size === 1 ? "student" : "students"}`.trim()}
            </button>
            <span className="text-xs text-dust">Students open it from “Assigned to you” in Exam Lab. Your copy is saved in Drill Records.</span>
          </div>
        </div>
      )}
      {error && <p role="alert" className="border-t border-signal/20 bg-signal/5 px-4 py-2.5 text-sm text-signal">{error}</p>}
    </section>
  );
}
