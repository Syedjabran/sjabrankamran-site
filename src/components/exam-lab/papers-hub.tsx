"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Layers, Play, Zap, Library, Coffee, ShieldAlert, Video, ClipboardList, Lock, CheckCircle2, Send, Loader2, Clock } from "lucide-react";
import { IMAGE_BANK, IMAGE_PAPERS, FULL_BANK, type ImgQuestion } from "@/lib/exam-lab/image-bank";
import { PaperRunner, type AttemptKind } from "./paper-runner";
import type { GuardMode } from "./use-exam-guard";

const SESS: Record<string, string> = { s: "May/June", w: "Oct/Nov", m: "Feb/March" };
const PAPER_NAME: Record<string, string> = { P1: "Paper 1 · Multiple Choice", P2: "Paper 2 · AS Structured", P4: "Paper 4 · A2 Structured" };
const PT_ACCENT: Record<string, string> = { P1: "#3DE1F0", P2: "#12D48C", P4: "#8B5CF6" };

function yearOf(code: string) { const m = code.match(/9702_[smw](\d\d)_/); return m ? 2000 + parseInt(m[1]) : 0; }
function label(code: string) {
  const m = code.match(/9702_([smw])(\d\d)_(\d\d)/);
  if (!m) return code;
  const [, s, yy, v] = m;
  return `${SESS[s] || s} 20${yy} · variant ${v[1]}`;
}

const TOPICS_AS = ["Physical quantities & units","Kinematics","Dynamics","Forces, density & pressure","Work, energy & power","Deformation of solids","Waves","Superposition","Electricity","D.C. circuits","Particle physics"];
const TOPICS_A2 = ["Circular motion","Gravitational fields","Thermal physics","Ideal gases","Oscillations","Electric fields","Capacitance","Magnetic fields","Alternating currents","Quantum physics","Nuclear physics","Astronomy & cosmology"];

type ActiveMeta = { mode: "paper" | "drill"; code?: string; ref?: string; paperType: "P1" | "P2" | "P4" | "mixed" };
type Active = { questions: ImgQuestion[]; title: string; subtitle?: string; duration: number; timed: boolean; logMeta: ActiveMeta; integrity: GuardMode; kind: AttemptKind; help: boolean; attemptId?: string; allocationId?: string | null };

type DrillSpec = { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number } | { type: "daily" };
// `drillref` = a drill whose paper was frozen at allocation time. `drill` and
// `daily` are the legacy randomised specs still carried by allocations saved
// before freezing existed; they keep their original per-sitting behaviour.
type AllocContent = { type: "paper"; code: string } | DrillSpec | { type: "custom"; ids: string[] } | { type: "drillref"; drillId: string; ref: string; ids: string[]; spec: DrillSpec };
type Allocation = { id: string; attemptId: string; mode: "assignment_help" | "assignment_nohelp" | "test"; content: AllocContent; title: string; instructions: string | null; durationMin: number | null; dueAt: string | null; startsAt: string | null; className: string | null; status: string };
function allocCfg(mode: Allocation["mode"]): { integrity: GuardMode; kind: AttemptKind; help: boolean } {
  if (mode === "test") return { integrity: "strict", kind: "test", help: false };
  if (mode === "assignment_nohelp") return { integrity: "standard", kind: "assignment", help: false };
  return { integrity: "off", kind: "assignment", help: true };
}
const ALLOC_LABEL: Record<Allocation["mode"], string> = { assignment_help: "Assignment · help allowed", assignment_nohelp: "Assignment · no help", test: "Proctored test" };

// Self-serve sit modes. "test" (strict camera proctor that LOCKS on violation)
// is staff-only here so a student can never lock themselves out; real tests
// reach students via a staff allocation.
type SitMode = "practice" | "exam" | "test";
function modeCfg(m: SitMode): { integrity: GuardMode; kind: AttemptKind; help: boolean } {
  if (m === "test") return { integrity: "strict", kind: "test", help: false };
  if (m === "exam") return { integrity: "standard", kind: "practice", help: true };
  return { integrity: "off", kind: "practice", help: true };
}

function AssignedBoard({ allocations, onStart }: { allocations: Allocation[]; onStart: (a: Allocation) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  async function requestReview(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/exam-lab/allocations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "unlock-request" }) });
      if (r.ok) setSent((s) => ({ ...s, [id]: true }));
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  const accent: Record<Allocation["mode"], string> = { test: "border-red-400/30 text-red-200", assignment_nohelp: "border-amber-400/30 text-amber-200", assignment_help: "border-emerald2/30 text-emerald2" };

  return (
    <div className="mb-6 rounded-2xl border border-cyan/25 bg-cyan/[0.04] p-4">
      <p className="mb-3 flex items-center gap-2 font-display text-sm text-ice"><ClipboardList size={16} className="text-cyan" /> Assigned to you</p>
      <ul className="space-y-2">
        {allocations.map((al) => {
          const launchable = ["assigned", "unlocked", "cancelled"].includes(al.status);
          const due = al.dueAt ? new Date(al.dueAt) : null;
          const opens = al.startsAt ? new Date(al.startsAt) : null;
          const scheduled = !!opens && opens.getTime() > Date.now();
          return (
            <li key={al.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-space/60 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ice">{al.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-dust">
                  <span className={"rounded-full border px-2 py-0.5 uppercase " + accent[al.mode]}>{ALLOC_LABEL[al.mode]}</span>
                  {al.content?.type === "drillref" && al.content.ref ? <span className="rounded-full border border-lime2/40 px-2 py-0.5 text-lime2">{al.content.ref}</span> : null}
                  {al.className ? <span>{al.className}</span> : null}
                  {opens ? <span>opens {opens.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : null}
                  {due ? <span>due {due.toLocaleDateString("en-GB")}</span> : null}
                </div>
              </div>
              {al.status === "submitted" ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald2"><CheckCircle2 size={14} /> Submitted</span>
              ) : al.status === "locked" ? (
                sent[al.id] ? <span className="inline-flex items-center gap-1 text-xs text-amber-300"><Lock size={13} /> Review requested</span>
                : <button onClick={() => requestReview(al.id)} disabled={busy === al.id} className="btn-ghost !px-3 !py-1.5 text-xs">{busy === al.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Locked — request review</button>
              ) : scheduled ? (
                <span className="inline-flex items-center gap-1 text-xs text-dust"><Clock size={13} /> Opens {opens!.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              ) : (
                <button onClick={() => onStart(al)} disabled={!launchable} className={"!px-3.5 !py-1.5 text-xs " + (al.mode === "test" ? "btn-primary" : "btn-primary")}>
                  {al.mode === "test" ? <Video size={13} /> : <Play size={13} />} {al.status === "unlocked" ? "Re-sit" : al.mode === "test" ? "Begin test" : "Start"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PapersHub({ canTest = false, canPause = false }: { canTest?: boolean; canPause?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run") === "1";
  const allocationParam = searchParams.get("allocation");
  const focusParam = searchParams.get("focus");
  const focusHandled = useRef<string | null>(null);

  const [tab, setTab] = useState<"papers" | "drill">("papers");
  const [sitMode, setSitMode] = useState<SitMode>("practice");
  const [active, setActive] = useState<Active | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [launchError, setLaunchError] = useState("");
  const deepLinkHandled = useRef<string | null>(null);
  // Have we actually observed ?run=1 for the current open paper yet? Guards the
  // transient first render (active set, but the pushed ?run=1 hasn't landed) so
  // we never clear `active` before it has even shown.
  const runObserved = useRef(false);

  // The runner renders off `active`; the URL (?run=1) is only used so the browser
  // Back button AND the "Exam Lab" nav tab both CLOSE an open paper (a real
  // backward/away navigation drops ?run=1) without a page refresh.
  useEffect(() => {
    if (runParam) {
      runObserved.current = true;
      if (!active) router.replace(pathname, { scroll: false }); // stray ?run=1, nothing open
    } else if (active && runObserved.current) {
      runObserved.current = false;
      setActive(null);
    }
  }, [runParam, active, pathname, router]);

  function enter(a: Active) {
    runObserved.current = false;
    setActive(a);
    router.push(`${pathname}?run=1`, { scroll: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }
  function exit() {
    router.back();
  }
  const [pType, setPType] = useState<"P1" | "P2" | "P4">("P1");
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Set<"LOT" | "HOT">>(new Set(["LOT", "HOT"]));
  const [count, setCount] = useState(8);

  // Load the student's staff-set allocations (assignments / tests).
  useEffect(() => {
    let alive = true;
    fetch("/api/exam-lab/allocations").then((r) => r.ok ? r.json() : { items: [] }).then((j) => { if (alive) setAllocations(j.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, [active]);

  /**
   * The historic per-sitting resolution of a randomised drill/daily spec.
   * Still used verbatim by allocations stored before drills were frozen, and
   * as the last-resort fallback when a frozen id no longer exists in the bank.
   */
  function legacyDrillQuestions(spec: DrillSpec): ImgQuestion[] {
    if (spec.type === "daily") return shuffle(IMAGE_BANK.filter((q) => q.paperType === "P1")).slice(0, 10);
    const { paperType, topics, levels, count } = spec;
    const tset = new Set(topics); const lset = new Set(levels);
    // Old automated allocations may contain a retired topic label or an
    // over-restrictive level combination. Fall back within the assigned
    // paper instead of silently doing nothing when Start is pressed.
    const exact = IMAGE_BANK.filter((q) => q.paperType === paperType && (!tset.size || (q.topic && tset.has(q.topic))) && lset.has(q.level));
    const topicAnyLevel = IMAGE_BANK.filter((q) => q.paperType === paperType && (!tset.size || (q.topic && tset.has(q.topic))));
    const paperAndLevel = IMAGE_BANK.filter((q) => q.paperType === paperType && lset.has(q.level));
    const pool = exact.length ? exact : topicAnyLevel.length ? topicAnyLevel : paperAndLevel.length ? paperAndLevel : IMAGE_BANK.filter((q) => q.paperType === paperType);
    return shuffle([...pool]).slice(0, count);
  }

  function startAllocation(al: Allocation) {
    setLaunchError("");
    const cfg = allocCfg(al.mode);
    const common = { ...cfg, timed: true, attemptId: al.attemptId, allocationId: al.id };
    if (al.content.type === "paper") {
      const code = al.content.code;
      const qs = IMAGE_BANK.filter((q) => q.code === code).sort((a, b) => a.qnum - b.qnum);
      const meta = IMAGE_PAPERS.find((p) => p.code === code);
      if (!qs.length || !meta) return;
      enter({ questions: qs, title: al.title || PAPER_NAME[meta.paperType], subtitle: `${meta.ref} · ${label(code)}`, duration: al.durationMin || meta.duration, logMeta: { mode: "paper", code, ref: meta.ref, paperType: meta.paperType }, ...common });
    } else if (al.content.type === "drillref") {
      // DETERMINISTIC DRILL. The paper was frozen once, at allocation time, and
      // its exact question ids travel with the allocation — so every student in
      // the class sits the same paper in the same order, and closing and
      // reopening replays that identical paper instead of reshuffling.
      const { ids, ref, spec } = al.content;
      const byId = new Map(FULL_BANK.map((q) => [q.id, q] as const));
      let qs = ids.map((qid) => byId.get(qid)).filter((q): q is ImgQuestion => !!q);
      // Only if the bank has lost every frozen id do we degrade to the original
      // randomised spec, so a bank change can never leave a student stranded.
      if (!qs.length) qs = legacyDrillQuestions(spec);
      if (!qs.length) {
        setLaunchError(`No questions are available for “${al.title}”. The assignment has been reported for repair.`);
        return;
      }
      // A proctored TEST still shuffles the ORDER per student to deter copying
      // (marking is keyed by question id, so the key follows each student's own
      // arrangement). The question SET stays identical for the whole class.
      if (al.mode === "test") qs = shuffle([...qs]);
      const pts = new Set(qs.map((q) => q.paperType));
      const pt: "P1" | "P2" | "P4" | "mixed" = pts.size === 1 ? qs[0].paperType : "mixed";
      const mins = al.durationMin || Math.max(5, Math.round(qs.length * (pt === "P1" ? 1.5 : 9)));
      const title = al.title || (pt === "mixed" ? "Drill" : `Topic drill · ${PAPER_NAME[pt].split(" · ")[0]}`);
      enter({ questions: qs, title, subtitle: `${qs.length} questions · ${mins} min${ref ? ` · Ref ${ref}` : ""}`, duration: mins, logMeta: { mode: "drill", ref: ref || undefined, paperType: pt }, ...common });
    } else if (al.content.type === "drill") {
      // LEGACY spec-based drill (allocations saved before freezing existed).
      // Left exactly as it was: re-resolved per sitting.
      const qs = legacyDrillQuestions(al.content);
      if (!qs.length) {
        setLaunchError(`No questions are available for “${al.title}”. The assignment has been reported for repair.`);
        return;
      }
      const paperType = al.content.paperType;
      const mins = al.durationMin || Math.max(5, Math.round(qs.length * (paperType === "P1" ? 1.5 : 9)));
      enter({ questions: qs, title: al.title || `Topic drill · ${PAPER_NAME[paperType].split(" · ")[0]}`, subtitle: `${qs.length} questions · ${mins} min`, duration: mins, logMeta: { mode: "drill", paperType }, ...common });
    } else if (al.content.type === "custom") {
      const idset = new Set(al.content.ids);
      // Custom allocations may reference the secure (allocation-only) bank.
      // Tests are shuffled per student per sitting; marking is keyed by
      // question id, so the auto-check key always follows each student's own
      // question arrangement.
      let qs = FULL_BANK.filter((q) => idset.has(q.id));
      if (al.mode === "test") qs = shuffle([...qs]);
      if (!qs.length) return;
      const pts = new Set(qs.map((q) => q.paperType));
      const pt: "P1" | "P2" | "P4" | "mixed" = pts.size === 1 ? qs[0].paperType : "mixed";
      const mins = al.durationMin || Math.max(5, Math.round(qs.reduce((s, q) => s + (q.paperType === "P1" ? 1.5 : 9), 0)));
      enter({ questions: qs, title: al.title || "Selected questions", subtitle: `${qs.length} hand-picked questions · ${mins} min`, duration: mins, logMeta: { mode: "drill", paperType: pt }, ...common });
    } else {
      const p1 = shuffle(IMAGE_BANK.filter((q) => q.paperType === "P1")).slice(0, 10);
      enter({ questions: p1, title: al.title || "Daily Challenge", subtitle: "10 mixed Paper-1 questions", duration: al.durationMin || 15, logMeta: { mode: "drill", paperType: "P1" }, ...common });
    }
  }

  // A task link opens its exact Exam Lab allocation rather than dropping the
  // student at the generic hub. The normal status/time checks still apply.
  useEffect(() => {
    if (!allocationParam || active || !allocations.length || deepLinkHandled.current === allocationParam) return;
    const allocation = allocations.find((a) => a.id === allocationParam);
    if (!allocation) {
      deepLinkHandled.current = allocationParam;
      setLaunchError("This assigned activity is no longer available. Ask your teacher to reassign it.");
      return;
    }
    deepLinkHandled.current = allocationParam;
    const scheduled = allocation.startsAt && new Date(allocation.startsAt).getTime() > Date.now();
    if (scheduled) {
      setLaunchError(`This activity opens ${new Date(allocation.startsAt!).toLocaleString("en-GB")}.`);
      return;
    }
    if (!["assigned", "unlocked", "cancelled"].includes(allocation.status)) return;
    startAllocation(allocation);
    // startAllocation deliberately stays local to this component; the ref
    // prevents repeated launches when allocation state refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationParam, allocations, active]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof IMAGE_PAPERS> = { P1: [], P2: [], P4: [] };
    IMAGE_PAPERS.forEach((p) => g[p.paperType]?.push(p));
    return g;
  }, []);

  const stats = useMemo(() => ({
    papers: IMAGE_PAPERS.length,
    questions: IMAGE_BANK.length,
    years: new Set(IMAGE_PAPERS.map((p) => yearOf(p.code))).size,
  }), []);

  function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function startPaper(code: string) {
    const qs = IMAGE_BANK.filter((q) => q.code === code).sort((a, b) => a.qnum - b.qnum);
    const meta = IMAGE_PAPERS.find((p) => p.code === code)!;
    enter({ questions: qs, title: PAPER_NAME[meta.paperType], subtitle: `${meta.ref} · ${label(code)}`, duration: meta.duration, timed: true, logMeta: { mode: "paper", code, ref: meta.ref, paperType: meta.paperType }, ...modeCfg(sitMode) });
  }

  // Focus Drill deep-link: /portal/exam-lab?focus=<topic,topic> launches a
  // relaxed practice drill built from the student's weak topics across ANY
  // paper (P1/P2/P4). One tap from My Progress → targeted revision.
  useEffect(() => {
    if (!focusParam || active || focusHandled.current === focusParam) return;
    focusHandled.current = focusParam;
    const want = new Set(focusParam.split(",").map((s) => s.trim()).filter(Boolean));
    if (!want.size) return;
    const pool = IMAGE_BANK.filter((q) => q.topic && want.has(q.topic));
    if (!pool.length) { setLaunchError("No practice questions are available for those topics yet."); router.replace(pathname, { scroll: false }); return; }
    const qs = shuffle([...pool]).slice(0, 10);
    const kinds = new Set(qs.map((q) => q.paperType));
    const pt = (kinds.size === 1 ? [...kinds][0] : "mixed") as ActiveMeta["paperType"];
    const mins = Math.max(5, Math.round(qs.length * (pt === "P1" ? 1.5 : 6)));
    const names = [...want];
    enter({
      questions: qs,
      title: "Focus drill · your weak topics",
      subtitle: `${qs.length} questions on ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`,
      duration: mins, timed: true, logMeta: { mode: "drill", paperType: pt }, ...modeCfg("practice"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusParam, active]);

  const drillPool = useMemo(() => IMAGE_BANK.filter((q) => q.paperType === pType && (!topics.size || (q.topic && topics.has(q.topic))) && levels.has(q.level)), [pType, topics, levels]);

  function startDrill() {
    const qs = shuffle([...drillPool]).slice(0, count);
    // Timed drill: P1 ~1.5 min/Q, structured ~1.8 min/mark-weighted question.
    const mins = Math.max(5, Math.round(qs.length * (pType === "P1" ? 1.5 : 9)));
    enter({ questions: qs, title: `Topic drill · ${PAPER_NAME[pType].split(" · ")[0]}`, subtitle: `${qs.length} questions · ${mins} min`, duration: mins, timed: true, logMeta: { mode: "drill", paperType: pType }, ...modeCfg(sitMode) });
  }

  function dailyChallenge() {
    const p1 = shuffle(IMAGE_BANK.filter((q) => q.paperType === "P1")).slice(0, 10);
    enter({ questions: p1, title: "Daily Challenge", subtitle: "10 mixed Paper-1 questions · 15 min", duration: 15, timed: true, logMeta: { mode: "drill", paperType: "P1" }, ...modeCfg(sitMode) });
  }

  if (active) return <PaperRunner {...active} canPause={canPause} onExit={exit} />;

  const availTopics = pType === "P4" ? TOPICS_A2 : TOPICS_AS;

  const modeOpts: { id: SitMode; label: string; icon: typeof Coffee; hint: string }[] = [
    { id: "practice", label: "Practice", icon: Coffee, hint: "Relaxed — no timer lock, switch tabs freely. Nothing is cancelled." },
    { id: "exam", label: "Exam self-test", icon: ShieldAlert, hint: "Timed & proctored — leaving the window cancels the drill (no camera)." },
    ...(canTest ? [{ id: "test" as SitMode, label: "Proctored test", icon: Video, hint: "Strict: camera on + AI proctor. Violations lock the test (super-admin unlock). Staff preview." }] : []),
  ];
  const activeHint = modeOpts.find((o) => o.id === sitMode)?.hint || "";

  return (
    <div>
      {launchError ? <p className="mb-4 rounded-xl border border-signal/35 bg-signal/[0.06] px-4 py-3 text-sm text-signal">{launchError}</p> : null}
      {allocations.length ? <AssignedBoard allocations={allocations} onStart={startAllocation} /> : null}

      {/* sit-mode selector */}
      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">How do you want to sit this?</p>
        <div className="flex flex-wrap gap-2">
          {modeOpts.map((o) => (
            <button key={o.id} onClick={() => setSitMode(o.id)} className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (sitMode === o.id ? (o.id === "test" ? "border-red-400 bg-red-400/15 text-red-200 font-semibold" : o.id === "exam" ? "border-amber-400 bg-amber-400/15 text-amber-200 font-semibold" : "border-emerald2 bg-emerald2/15 text-emerald2 font-semibold") : "border-white/15 text-fog hover:border-cyan")}>
              <o.icon size={15} /> {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-dust">{activeHint}</p>
        <p className="mt-1 text-[11px] text-dust/80">Tests and assignments set by your teacher appear above and always run in their required mode.</p>
      </div>

      {/* coverage summary + daily challenge */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2">
          <Library size={15} className="text-cyan" />
          <span className="font-mono text-xs text-fog"><b className="text-ice">{stats.papers}</b> papers · <b className="text-ice">{stats.questions}</b> exact questions · <b className="text-ice">{stats.years}</b> years</span>
        </div>
        <button onClick={dailyChallenge} className="inline-flex items-center gap-2 rounded-xl border border-signal/30 bg-signal/[0.06] px-4 py-2 text-sm text-signal transition hover:bg-signal/[0.12]">
          <Zap size={15} /> Daily Challenge
        </button>
      </div>

      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab("papers")} className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (tab === "papers" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}><FileText size={15} /> Sit a real paper</button>
        <button onClick={() => setTab("drill")} className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (tab === "drill" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}><Layers size={15} /> Topic drill</button>
      </div>

      {tab === "papers" ? (
        <div className="space-y-8">
          {(["P1", "P2", "P4"] as const).map((pt) => {
            const papers = grouped[pt];
            const years = Array.from(new Set(papers.map((p) => yearOf(p.code)))).sort((a, b) => b - a);
            return (
              <div key={pt}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full" style={{ background: PT_ACCENT[pt] }} />
                  <p className="font-display text-sm text-ice">{PAPER_NAME[pt]}</p>
                  <span className="font-mono text-[11px] text-dust">· {papers.length} papers</span>
                </div>
                {papers.length === 0 ? (
                  <p className="text-xs text-dust">More {pt} papers are being added…</p>
                ) : (
                  <div className="space-y-4">
                    {years.map((yr) => (
                      <div key={yr}>
                        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-dust">{yr}</p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {papers.filter((p) => yearOf(p.code) === yr).map((p) => (
                            <button key={p.code} onClick={() => startPaper(p.code)} className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan/40 hover:bg-white/[0.04]">
                              <div className="flex items-center justify-between">
                                <span className="font-display text-sm text-ice">{label(p.code).replace(` 20${String(yr).slice(2)}`, "")}</span>
                                <span className="grid h-7 w-7 place-items-center rounded-full transition group-hover:scale-110" style={{ background: PT_ACCENT[pt] + "22" }}>
                                  <Play size={14} style={{ color: PT_ACCENT[pt] }} />
                                </span>
                              </div>
                              <p className="mt-1 font-mono text-[11px] text-dust">{p.ref}</p>
                              <p className="mt-2 font-mono text-[11px] text-fog">{p.count} Q · {p.marks} marks · {p.duration} min</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Paper</p>
              <div className="flex gap-2">
                {(["P1", "P2", "P4"] as const).map((pt) => (
                  <button key={pt} onClick={() => { setPType(pt); setTopics(new Set()); }} className={"rounded-full border px-3.5 py-1.5 text-xs transition " + (pType === pt ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>{pt}</button>
                ))}
              </div>
              <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-widest text-fog">Topics <span className="normal-case text-dust">(none = all)</span></p>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-auto">
                {availTopics.map((t) => {
                  const on = topics.has(t);
                  return <button key={t} onClick={() => setTopics((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })} className={"rounded-full border px-2.5 py-1 text-xs transition " + (on ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}>{t}</button>;
                })}
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Thinking level</p>
                <div className="flex gap-2">
                  {(["LOT", "HOT"] as const).map((l) => (
                    <button key={l} onClick={() => setLevels((s) => { const n = new Set(s); if (n.has(l) && n.size === 1) return n; if (n.has(l)) n.delete(l); else n.add(l); return n; })} className={"rounded-full border px-3.5 py-1.5 text-xs transition " + (levels.has(l) ? (l === "LOT" ? "border-emerald2 bg-emerald2 text-space font-semibold" : "border-magenta bg-magenta text-space font-semibold") : "border-white/15 text-fog")}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">Number of questions</p>
                <div className="flex items-center gap-4">
                  <input type="range" min={1} max={Math.max(1, Math.min(40, drillPool.length))} value={Math.min(count, Math.max(1, drillPool.length))} onChange={(e) => setCount(+e.target.value)} className="flex-1 accent-cyan" />
                  <span className="w-10 text-center font-display text-2xl text-cyan">{Math.min(count, Math.max(1, drillPool.length))}</span>
                </div>
                <p className="mt-1 text-xs text-dust">{drillPool.length} matching questions in the bank</p>
              </div>
              <button onClick={startDrill} disabled={drillPool.length === 0} className="btn-primary disabled:opacity-50"><Play size={16} /> Start drill</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
