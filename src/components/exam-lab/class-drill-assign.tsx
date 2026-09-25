"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Users, User, Search, Check, Loader2, Send, Printer, GraduationCap, ListChecks, RotateCcw } from "lucide-react";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";
import { courseOfQuestion } from "@/lib/exam-lab/bank-all";
import { pkDateTimeToIso } from "@/lib/portal/pk-time";
import { QuestionPicker, selectionSummary } from "./question-picker";

type ClassChoice = { id: string; name: string; school: string; section?: string | null; students?: number; active: boolean };
type StudentChoice = { id: string; name: string; email: string; classes: string[] };
type Mode = "classes" | "students";
type AllocMode = "assignment_help" | "assignment_nohelp" | "test";

// Mirrors the allocate route: only these roles may set a proctored test.
const TEST_ROLES = ["super_admin", "admin", "teaching_assistant"];
const ALLOC_MODES: { id: AllocMode; label: string; hint: string; on: string }[] = [
  { id: "assignment_help", label: "Assignment · help allowed", hint: "Open practice; students may use the mark scheme freely (logged).", on: "border-emerald2/60 bg-emerald2/10 text-emerald2" },
  { id: "assignment_nohelp", label: "Assignment · no help", hint: "Guarded like a mini-exam; mark-scheme reveals are logged.", on: "border-amber-400/60 bg-amber-400/10 text-amber-200" },
  { id: "test", label: "Proctored test", hint: "Strict: students must switch on the camera; violations lock the test (super-admin unlock).", on: "border-red-400/60 bg-red-400/10 text-red-200" },
];
const FIELD = "w-full min-w-0 rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust/70 outline-none focus:border-cyan/50";
const LABEL = "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-dust";

/**
 * Assign the paper on screen, not a recipe that would generate another paper.
 * The teacher may edit the question list first; `duration` from the caller is
 * no longer used, as the editable duration defaults to the picker's estimate.
 */
export function ClassDrillAssign({ questions, title, onAssigned }: {
  questions: ImgQuestion[]; title: string; duration?: number; onAssigned: (ref: string) => void;
}) {
  const preferredClass = useSearchParams().get("class");
  const seedIds = useMemo(() => questions.map((x) => x.id), [questions]);
  const course = courseOfQuestion(seedIds[0] ?? "") ?? "all";
  const [ids, setIds] = useState<string[]>(seedIds);
  const [editing, setEditing] = useState(false);
  const [allocMode, setAllocMode] = useState<AllocMode>("assignment_help");
  const [canTest, setCanTest] = useState(false);
  const [durationInput, setDurationInput] = useState<string | null>(null);
  const [opensAt, setOpensAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
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
  const [result, setResult] = useState<{ ref: string; students: number; warning?: string } | null>(null);
  // One key per assignment: a retry after a timeout reuses it, so the server
  // resumes the same allocation instead of creating a duplicate.
  const idemKey = useRef(crypto.randomUUID());

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

  // Offer "Proctored test" only to the roles the allocate route accepts it from.
  useEffect(() => {
    let alive = true;
    fetch("/api/portal/me").then((r) => (r.ok ? r.json() : null)).then((j: { roles?: unknown } | null) => {
      if (alive && Array.isArray(j?.roles)) setCanTest(j.roles.some((r) => typeof r === "string" && TEST_ROLES.includes(r)));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // In students mode, load the roster for the chosen classes.
  useEffect(() => {
    if (mode !== "students") return;
    const classIds = [...selClasses];
    if (!classIds.length) { setStudents([]); return; }
    let alive = true;
    setRosterLoading(true);
    fetch(`/api/portal/admin/drill-students?class_ids=${encodeURIComponent(classIds.join(","))}`).then(async (r) => {
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

  const summary = useMemo(() => selectionSummary(ids), [ids]);
  const edited = ids.length !== seedIds.length || ids.some((id, i) => id !== seedIds[i]);
  const estimate = String(Math.max(1, summary.minutes));
  const durationValue = durationInput ?? estimate;
  const durationMin = Number(durationValue);
  const durationOk = durationValue.trim() !== "" && Number.isFinite(durationMin) && durationMin >= 1;
  const opensIso = pkDateTimeToIso(opensAt);
  const dueIso = pkDateTimeToIso(dueAt);
  const scheduleError = opensIso && dueIso && Date.parse(dueIso) <= Date.parse(opensIso) ? "The due time must be after the opening time." : "";
  const modeOptions = ALLOC_MODES.filter((m) => m.id !== "test" || canTest);
  const modeHint = ALLOC_MODES.find((m) => m.id === allocMode)?.hint ?? "";

  const canAssign = !loading && !busy && ids.length > 0 && durationOk && !scheduleError && (mode === "classes" ? selClasses.size > 0 : selStudents.size > 0);

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
        body: JSON.stringify({
          ...body, mode: allocMode, title,
          content: { type: "custom", ids },
          duration_min: Math.round(durationMin),
          starts_at: opensIso ?? undefined,
          due_at: dueIso ?? undefined,
          instructions: instructions.trim() || undefined,
          notify: true,
          idempotency_key: idemKey.current,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not assign the drill. Please retry.");
      setResult({ ref: j.drillRef, students: j.students, warning: j.partial ? j.warning : undefined }); onAssigned(j.drillRef);
      if (!j.partial) idemKey.current = crypto.randomUUID();
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
            <p className="text-xs text-dust">Same paper &amp; order for everyone</p>
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
          {result.warning ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-200">
              {result.warning}
              <button type="button" disabled={busy} onClick={assign} className="rounded-lg border border-amber-300/40 px-2 py-0.5 hover:bg-amber-300/10 disabled:opacity-40">
                {busy ? "Retrying…" : "Retry for the rest"}
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="px-4 py-4">
          {/* the paper itself: seeded with the drill on screen, editable before assigning */}
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-abyss/40 px-3 py-2.5">
            <ListChecks size={16} className="shrink-0 text-cyan" />
            <span className="min-w-0 text-sm text-ice">
              {summary.count} {summary.count === 1 ? "question" : "questions"}
              <span className="text-xs text-dust"> · {summary.marks} {summary.marks === 1 ? "mark" : "marks"} · ~{summary.minutes} min</span>
            </span>
            {edited ? <span className="text-xs text-amber-200">Edited · differs from the paper on screen</span> : null}
            <div className="ml-auto flex items-center gap-2">
              {edited ? (
                <button type="button" disabled={busy} onClick={() => setIds(seedIds)} className="inline-flex items-center gap-1 text-xs text-dust hover:text-ice hover:underline"><RotateCcw size={12} /> Reset</button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => setEditing((v) => !v)} aria-expanded={editing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-fog transition hover:border-cyan/40 hover:text-cyan">
                {editing ? <><Check size={13} /> Done</> : "Edit questions"}
              </button>
            </div>
          </div>
          {editing ? <div className="mb-4"><QuestionPicker value={ids} onChange={setIds} course={course} /></div> : null}

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

          {/* how students sit it */}
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="min-w-0">
                <span className={LABEL}>Mode</span>
                <div className="flex flex-wrap gap-2">
                  {modeOptions.map((m) => (
                    <button key={m.id} type="button" disabled={busy} onClick={() => setAllocMode(m.id)} aria-pressed={allocMode === m.id}
                      className={"rounded-xl border px-3 py-1.5 text-xs transition " + (allocMode === m.id ? m.on : "border-white/10 text-dust hover:text-ice")}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-dust">{modeHint}</p>
              </div>
              <label className="min-w-0">
                <span className={LABEL}>Duration (min)</span>
                <input type="number" inputMode="numeric" min={1} value={durationValue} disabled={busy}
                  onChange={(e) => setDurationInput(e.target.value)} className={FIELD} />
                {durationInput !== null && durationInput !== estimate ? (
                  <button type="button" onClick={() => setDurationInput(null)} className="mt-1 text-[11px] text-cyan hover:underline">Use estimate ({estimate})</button>
                ) : (
                  <span className="mt-1 block text-[11px] text-dust">Estimated from the questions</span>
                )}
              </label>
            </div>

            <details className="rounded-xl border border-white/10 bg-abyss/40 px-3 py-2.5">
              <summary className="cursor-pointer select-none text-xs text-fog">Schedule &amp; instructions <span className="text-dust">(optional · Pakistan time)</span></summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="min-w-0">
                  <span className={LABEL}>Opens</span>
                  <input type="datetime-local" value={opensAt} disabled={busy} onChange={(e) => setOpensAt(e.target.value)} className={FIELD} />
                </label>
                <label className="min-w-0">
                  <span className={LABEL}>Due</span>
                  <input type="datetime-local" value={dueAt} disabled={busy} onChange={(e) => setDueAt(e.target.value)} className={FIELD} />
                </label>
                <label className="min-w-0 sm:col-span-2">
                  <span className={LABEL}>Instructions</span>
                  <textarea value={instructions} disabled={busy} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={2000}
                    placeholder="Shown to students when they open it" className={FIELD + " resize-none"} />
                </label>
              </div>
            </details>
            {scheduleError ? <p className="text-xs text-signal">{scheduleError}</p> : null}
            {!ids.length ? <p className="text-xs text-signal">Add at least one question before assigning.</p> : null}
          </div>

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
