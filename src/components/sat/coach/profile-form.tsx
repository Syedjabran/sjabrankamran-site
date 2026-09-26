"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus } from "lucide-react";
import { formatPk } from "@/lib/portal/pk-time";
import {
  DAY_PRESETS, DEFAULT_MINUTES, DEFAULT_TARGET, PRACTICE_MINUTES, SCORE_STEP, TARGET_MAX, TARGET_MIN,
  addDays, addMonths, isCalendarDate, presetOf, previewLine, targetFromScore, targetMonthOptions, validateProfileInput,
  HORIZON_MONTHS, type DayPreset, type PracticeMinutes, type ProfileField, type SATProfile,
} from "@/lib/sat/coach/profile";
import { DIAGNOSTIC_SIZE } from "@/lib/sat/coach/diagnostic";

type StartKind = "diagnostic" | "score" | "skip";
type Block = "when" | "target" | "start" | "days" | "minutes";

type Draft = {
  booked: boolean;
  examDate: string;
  targetMonth: string;
  targetScore: number;
  /** Set once the student picks a target, so a past score no longer moves it. */
  targetTouched: boolean;
  start: StartKind;
  source: "SAT" | "PSAT";
  total: string;
  rw: string;
  math: string;
  takenOn: string;
  preset: DayPreset;
  days: number[];
  minutes: PracticeMinutes;
};
type SetDraft = (patch: Partial<Draft>) => void;

const FIELD = "mt-1 w-full min-w-0 rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice [color-scheme:dark] focus:border-cyan focus:outline-none";
const BLOCK_OF: Record<ProfileField, Block> = { examDate: "when", targetMonth: "when", targetScore: "target", start: "start", days: "days", minutes: "minutes" };
const WEEK: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const PRESETS: [DayPreset, string][] = [["every", "Every day"], ["weekdays", "Weekdays"], ["weekends", "Weekends"], ["once", "Once a week"], ["custom", "Custom"]];

function draftOf(p: SATProfile | null): Draft {
  const score = p?.start.kind === "score" ? p.start : null;
  const days = p?.days ?? [...DAY_PRESETS.every];
  return {
    booked: p ? p.examDate !== null : true,
    examDate: p?.examDate ?? "",
    targetMonth: p?.targetMonth ?? "",
    targetScore: p?.targetScore ?? DEFAULT_TARGET,
    targetTouched: !!p,
    start: p?.start.kind ?? "diagnostic",
    source: score?.source ?? "SAT",
    total: score ? String(score.total) : "",
    rw: score?.rw !== undefined ? String(score.rw) : "",
    math: score?.math !== undefined ? String(score.math) : "",
    takenOn: score?.date ?? "",
    preset: presetOf(days),
    days,
    minutes: p?.minutes ?? DEFAULT_MINUTES,
  };
}

const numberOrNone = (v: string) => (v.trim() === "" ? undefined : Number(v));

/** The request body the draft stands for; the shared rules judge it. */
function inputOf(d: Draft) {
  const start = d.start !== "score" ? { kind: d.start } : {
    kind: "score" as const, source: d.source, total: numberOrNone(d.total),
    ...(d.rw.trim() ? { rw: numberOrNone(d.rw) } : {}),
    ...(d.math.trim() ? { math: numberOrNone(d.math) } : {}),
    ...(d.takenOn ? { date: d.takenOn } : {}),
  };
  return {
    examDate: d.booked ? d.examDate || null : null,
    targetMonth: d.booked ? null : d.targetMonth || null,
    targetScore: d.targetScore, start, days: d.days, minutes: d.minutes,
  };
}

const monthLabel = (month: string) => formatPk(`${month}-01T12:00:00+05:00`, { month: "long", year: "numeric" });

export function ProfileUnavailable() {
  return <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">Your SAT settings couldn&rsquo;t be loaded just now. Please refresh.</p>;
}

export function ProfileForm({ mode, today, initial }: { mode: "setup" | "settings"; today: string; initial: SATProfile | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [errors, setErrors] = useState<Partial<Record<Block, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ diagnosticId: string | null } | null>(null);

  const set: SetDraft = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
    setFormError(null);
    setSaved(null);
  };

  const preview = useMemo(() => {
    if (!draft.days.length) return null;
    const examDate = draft.booked && isCalendarDate(draft.examDate) ? draft.examDate : null;
    const targetMonth = !draft.booked && draft.targetMonth ? draft.targetMonth : null;
    return previewLine({ examDate, targetMonth, days: draft.days, minutes: draft.minutes }, today);
  }, [draft.booked, draft.examDate, draft.targetMonth, draft.days, draft.minutes, today]);

  async function save() {
    const checked = validateProfileInput(inputOf(draft), today);
    if (!checked.ok) {
      if (checked.field) setErrors({ [BLOCK_OF[checked.field]]: checked.error });
      else setFormError(checked.error);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sat/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(checked.value) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Your SAT settings couldn't be saved. Please try again.");
      const diagnosticId = typeof j.diagnosticId === "string" ? j.diagnosticId : null;
      if (mode === "setup") {
        router.replace(diagnosticId ? `/portal/sat-lab/${diagnosticId}` : "/portal/sat-lab");
        router.refresh();
        return;
      }
      setSaved({ diagnosticId });
      router.refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = mode === "settings" ? "Save changes" : draft.start === "diagnostic" ? "Save and start the diagnostic" : "Save and open the SAT Lab";

  return (
    <div className="space-y-4">
      <WhenBlock draft={draft} set={set} today={today} error={errors.when} />
      <TargetBlock draft={draft} set={set} error={errors.target} />
      <StartBlock draft={draft} set={set} today={today} error={errors.start} />
      <DaysBlock draft={draft} set={set} error={errors.days} />
      <MinutesBlock draft={draft} set={set} error={errors.minutes} />

      <div className="min-w-0 space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
        {preview ? <p className="font-display text-sm text-cyan">{preview}</p> : null}
        {mode === "settings" ? <p className="text-xs text-dust">Changes to your date or days rebuild your future plan; completed work is kept.</p> : null}
        {formError ? <p className="text-sm text-signal">{formError}</p> : null}
        {saved ? (
          <p className="text-sm text-emerald2">
            Saved.{saved.diagnosticId ? <> <Link href={`/portal/sat-lab/${saved.diagnosticId}`} className="text-cyan underline">Start your diagnostic</Link></> : null}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}{saveLabel}
          </button>
          {mode === "settings" ? <Link href="/portal/sat-lab" className="btn-ghost !px-4 !py-2 text-sm">Back to the SAT Lab</Link> : null}
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, error, children }: { n: number; title: string; error?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice"><span className="mr-2 text-dust">{n}.</span>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
      {error ? <p role="alert" className="mt-3 text-sm text-signal">{error}</p> : null}
    </section>
  );
}

function Choice({ on, onClick, children, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className={`min-w-0 rounded-xl border px-3 py-2 text-sm transition-colors ${on ? "border-cyan bg-cyan/10 text-ice" : "border-white/10 text-fog hover:border-white/25"} ${className}`}
    >
      {children}
    </button>
  );
}

function WhenBlock({ draft, set, today, error }: { draft: Draft; set: SetDraft; today: string; error?: string }) {
  const months = useMemo(() => targetMonthOptions(today), [today]);
  return (
    <Section n={1} title="When is your SAT?" error={error}>
      <div className="flex flex-wrap gap-2">
        <Choice on={draft.booked} onClick={() => set({ booked: true })}>I&rsquo;ve booked it</Choice>
        <Choice on={!draft.booked} onClick={() => set({ booked: false })}>Not booked yet</Choice>
      </div>
      {draft.booked ? (
        <label className="block min-w-0 text-xs text-fog">
          Exam date
          <input type="date" value={draft.examDate} min={addDays(today, 1)} max={addMonths(today, HORIZON_MONTHS)} onChange={(e) => set({ examDate: e.target.value })} className={FIELD} />
        </label>
      ) : (
        <label className="block min-w-0 text-xs text-fog">
          Which month are you aiming for?
          <select value={draft.targetMonth} onChange={(e) => set({ targetMonth: e.target.value })} className={FIELD}>
            <option value="">Choose a month</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      )}
    </Section>
  );
}

function TargetBlock({ draft, set, error }: { draft: Draft; set: SetDraft; error?: string }) {
  const pick = (score: number) => set({ targetScore: Math.min(TARGET_MAX, Math.max(TARGET_MIN, score)), targetTouched: true });
  return (
    <Section n={2} title="Target score" error={error}>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Lower target" onClick={() => pick(draft.targetScore - SCORE_STEP)} className="btn-ghost !p-2"><Minus size={14} /></button>
        <span className="min-w-[4ch] text-center font-display text-2xl text-ice" aria-live="polite">{draft.targetScore}</span>
        <button type="button" aria-label="Raise target" onClick={() => pick(draft.targetScore + SCORE_STEP)} className="btn-ghost !p-2"><Plus size={14} /></button>
      </div>
      <input
        type="range" aria-label="Target score" min={TARGET_MIN} max={TARGET_MAX} step={SCORE_STEP} value={draft.targetScore}
        onChange={(e) => pick(Number(e.target.value))} className="w-full accent-cyan"
      />
      <p className="text-xs text-dust">{TARGET_MIN}–{TARGET_MAX}</p>
    </Section>
  );
}

function StartBlock({ draft, set, today, error }: { draft: Draft; set: SetDraft; today: string; error?: string }) {
  // Until the student picks a target, it follows a past score (+150).
  const follow = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    const total = next.start === "score" ? numberOrNone(next.total) : undefined;
    set(draft.targetTouched ? patch : { ...patch, targetScore: targetFromScore(total ?? null) });
  };
  return (
    <Section n={3} title="Where are you starting?" error={error}>
      <div className="grid grid-cols-1 gap-2">
        <Choice on={draft.start === "diagnostic"} onClick={() => follow({ start: "diagnostic" })} className="text-left">
          Take a short diagnostic <span className="block text-xs text-dust">{DIAGNOSTIC_SIZE} questions, about 30 minutes</span>
        </Choice>
        <Choice on={draft.start === "score"} onClick={() => follow({ start: "score" })} className="text-left">I have a past SAT or PSAT score</Choice>
        <Choice on={draft.start === "skip"} onClick={() => follow({ start: "skip" })} className="text-left">Skip for now</Choice>
      </div>
      {draft.start === "score" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["SAT", "PSAT"] as const).map((source) => <Choice key={source} on={draft.source === source} onClick={() => set({ source })}>{source}</Choice>)}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScoreField label="Total" value={draft.total} onChange={(total) => follow({ total })} />
            <label className="block min-w-0 text-xs text-fog">
              Date taken (optional)
              <input type="date" value={draft.takenOn} max={today} onChange={(e) => set({ takenOn: e.target.value })} className={FIELD} />
            </label>
            <ScoreField label="Reading and Writing (optional)" value={draft.rw} onChange={(rw) => set({ rw })} />
            <ScoreField label="Math (optional)" value={draft.math} onChange={(math) => set({ math })} />
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0 text-xs text-fog">
      {label}
      <input type="number" inputMode="numeric" step={SCORE_STEP} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} />
    </label>
  );
}

function DaysBlock({ draft, set, error }: { draft: Draft; set: SetDraft; error?: string }) {
  const choosePreset = (preset: DayPreset) => {
    if (preset === "once") set({ preset, days: [draft.days[0] ?? 6] });
    else if (preset === "custom") set({ preset });
    else set({ preset, days: [...DAY_PRESETS[preset]] });
  };
  const toggle = (day: number) => {
    if (draft.preset === "once") return set({ days: [day] });
    set({ days: draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day].sort((a, b) => a - b) });
  };
  return (
    <Section n={4} title="Which days will you practise?" error={error}>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(([preset, label]) => <Choice key={preset} on={draft.preset === preset} onClick={() => choosePreset(preset)}>{label}</Choice>)}
      </div>
      {draft.preset === "once" || draft.preset === "custom" ? (
        <div className="flex flex-wrap gap-2">
          {WEEK.map(([day, label]) => <Choice key={day} on={draft.days.includes(day)} onClick={() => toggle(day)} className="!px-2.5">{label}</Choice>)}
        </div>
      ) : null}
    </Section>
  );
}

function MinutesBlock({ draft, set, error }: { draft: Draft; set: SetDraft; error?: string }) {
  return (
    <Section n={5} title="How long per session?" error={error}>
      <div className="grid grid-cols-4 gap-2">
        {PRACTICE_MINUTES.map((minutes) => (
          <Choice key={minutes} on={draft.minutes === minutes} onClick={() => set({ minutes })} className="!px-1">{minutes} min</Choice>
        ))}
      </div>
    </Section>
  );
}
