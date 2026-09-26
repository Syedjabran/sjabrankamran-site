"use client";
// The student's SAT Progress page body (SAT Coach spec 7.4): scores,
// section accuracy, the 8-domain mastery grid, weakest skills with "Drill
// this", skills without enough data yet, and pacing. Reads GET
// /api/sat/analytics (finished work only). Bars are plain CSS in one accent
// (cyan on a lighter cyan track) with every value also written as text
// beside its bar, so nothing depends on colour or hover.
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Loader2, Minus } from "lucide-react";
import { DOMAIN_LABEL, DRILL_COUNT_DEFAULT, SECTION_LABEL, type MasteryRow, type SATAnalytics } from "@/lib/sat/client-types";
import type { SATSection } from "@/lib/sat/types";
import { formatPk } from "@/lib/portal/pk-time";
import { ScoreBadge } from "@/components/sat/score-badge";
import { Meter } from "./meter";

type Sitting = SATAnalytics["scores"]["history"][number];
type WeakSkill = SATAnalytics["weakSkills"][number];

const SECTIONS: SATSection[] = ["rw", "math"];
// A mastery change smaller than this (in 0..1 units) reads as "steady".
const TREND_STEADY = 0.01;

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const count = (n: number) => n.toLocaleString("en-GB");
const day = (ms: number) => formatPk(ms, { day: "numeric", month: "short", year: "numeric" });

export function ProgressView() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<SATAnalytics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/sat/analytics", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Your progress couldn't be loaded. Please try again.");
      setAnalytics((j as { analytics: SATAnalytics }).analytics);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  // Same start as the hub's drill form: POST the drill, then open it.
  async function drill(skill: WeakSkill) {
    setBusyKey(skill.key); setDrillError(null);
    const filter = { section: skill.section, domain: Object.hasOwn(DOMAIN_LABEL, skill.domain) ? skill.domain : undefined, skill: skill.label };
    try {
      const res = await fetch("/api/sat/sessions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "drill", filter, count: DRILL_COUNT_DEFAULT }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "The drill couldn't be started. Please try again.");
      router.push(`/portal/sat-lab/${j.id}`);
    } catch (e) {
      setDrillError((e as Error).message);
      setBusyKey(null);
    }
  }

  if (loadError && !analytics) {
    return (
      <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
        {loadError} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button>
      </p>
    );
  }
  if (!analytics) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading your progress…</p>;
  if (analytics.totals.answered === 0 && analytics.scores.history.length === 0) return <EmptyProgress />;

  return (
    <div className="space-y-6">
      <Overview totals={analytics.totals} generatedAt={analytics.generatedAt} />
      <ScoresCard scores={analytics.scores} />
      <SectionsCard sections={analytics.sections} />
      <DomainsCard domains={analytics.domains} />
      <SkillsCard weakSkills={analytics.weakSkills} notEnoughData={analytics.notEnoughData} busyKey={busyKey} error={drillError} onDrill={(s) => void drill(s)} />
      <PacingCard pacing={analytics.pacing} flags={analytics.pacingFlags} />
    </div>
  );
}

// --- building blocks ---------------------------------------------------------

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice">{title}</h2>
      {note ? <p className="mt-1 text-xs text-dust">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One labelled bar: label left, value at the bar's end, detail below. */
function MeterRow({ label, value, fraction, marker, detail }: { label: string; value: string; fraction: number; marker?: number; detail?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words text-ice">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-fog">{value}</span>
      </div>
      <div className="mt-1.5"><Meter fraction={fraction} marker={marker} /></div>
      {detail ? <div className="mt-1 text-xs text-dust">{detail}</div> : null}
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wide text-dust">{children}</h3>;
}

// --- sections of the page ----------------------------------------------------

function EmptyProgress() {
  return (
    <div className="rounded-2xl border border-white/10 bg-space/60 px-6 py-10 text-center">
      <p className="mx-auto max-w-md font-display text-lg text-ice">Your progress shows up here</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-fog">Finish a drill, an official practice test or an adaptive mock and you&rsquo;ll see your scores, accuracy and strongest and weakest skills.</p>
      <Link href="/portal/sat-lab" className="btn-primary mt-5 !px-4 !py-2 text-sm">Go to the SAT Lab</Link>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-xs text-dust">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ice">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-dust">{detail}</p> : null}
    </div>
  );
}

function Overview({ totals, generatedAt }: { totals: SATAnalytics["totals"]; generatedAt: number }) {
  const accuracy = totals.answered > 0 ? pct(totals.correct / totals.answered) : "—";
  const week = totals.last7;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Questions answered" value={count(totals.answered)} />
        <Stat label="Correct" value={accuracy} />
        <Stat label="Last 7 days" value={count(week.answered)} detail={week.answered > 0 ? `${pct(week.correct / week.answered)} correct` : undefined} />
      </div>
      <p className="text-xs text-dust">Updated {formatPk(generatedAt)}</p>
    </div>
  );
}

function ScoreTile({ title, sitting, label, empty }: { title: string; sitting: Sitting | null; label: string; empty: string }) {
  const score = sitting?.score ?? null;
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs text-dust">{title}</p>
      {sitting && score ? (
        <>
          <p className="mt-1 text-2xl font-semibold text-ice">{score.lower}–{score.upper}</p>
          <p className="mt-1 text-xs text-fog">{label}</p>
          <p className="mt-0.5 break-words text-xs text-dust">{sitting.title} · {day(sitting.finishedAt)}</p>
          {score.authority === "estimated" ? <p className="mt-2 text-xs text-dust">{score.basis}</p> : null}
        </>
      ) : <p className="mt-1 text-sm text-fog">{empty}</p>}
    </div>
  );
}

function ScoresCard({ scores }: { scores: SATAnalytics["scores"] }) {
  const shown = [scores.latestOfficial, scores.latestEstimate].filter(Boolean).length;
  const history = [...scores.history].reverse().slice(0, 10);
  return (
    <Card title="Scores" note="Only real scores: official practice-test ranges, and the adaptive mock's labelled estimate.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ScoreTile title="Latest official practice test" sitting={scores.latestOfficial} label="Official score range" empty="Finish an official practice test to see an official score range." />
        <ScoreTile title="Latest adaptive mock" sitting={scores.latestEstimate} label="Estimated score range — not an official SAT score" empty="Finish an adaptive mock to see an estimated score." />
      </div>
      {scores.history.length > shown ? (
        <div className="mt-5 space-y-2">
          <SubHeading>Score history</SubHeading>
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 px-3 py-2 text-sm">
                <span className="min-w-0 break-words text-ice">{s.title}</span>
                <span className="text-xs text-dust">{day(s.finishedAt)}</span>
                {s.score ? <span className="ml-auto"><ScoreBadge score={s.score} /></span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function SectionsCard({ sections }: { sections: SATAnalytics["sections"] }) {
  return (
    <Card title="Accuracy by section" note="Every finished question, practice tests included.">
      <div className="space-y-4">
        {SECTIONS.map((section) => {
          const s = sections[section];
          return s.accuracy === null
            ? <MeterRow key={section} label={SECTION_LABEL[section]} value="—" fraction={0} detail="No answers yet" />
            : <MeterRow key={section} label={SECTION_LABEL[section]} value={pct(s.accuracy)} fraction={s.accuracy} detail={`${count(s.correct)} of ${count(s.answered)} correct`} />;
        })}
      </div>
    </Card>
  );
}

function Trend({ trend }: { trend: number }) {
  // trend is exactly 0 when one of the two 14-day windows has no answers.
  if (trend === 0) return null;
  const points = Math.round(trend * 100);
  const title = "Mastery change: the last 14 days against the 14 days before";
  if (Math.abs(trend) < TREND_STEADY || points === 0) {
    return <span title={title} className="inline-flex items-center gap-0.5 text-fog"><Minus size={12} /> steady</span>;
  }
  const Icon = trend > 0 ? ArrowUpRight : ArrowDownRight;
  return <span title={title} className="inline-flex items-center gap-0.5 text-fog"><Icon size={12} /> {points > 0 ? "+" : "−"}{Math.abs(points)} pts</span>;
}

function DomainRow({ row }: { row: MasteryRow }) {
  if (row.attempts === 0) return <MeterRow label={row.label} value="—" fraction={0} detail="Not started yet" />;
  return (
    <MeterRow
      label={row.label} value={pct(row.mastery)} fraction={row.mastery}
      detail={<span className="inline-flex flex-wrap items-center gap-x-2">{count(row.attempts)} answered <Trend trend={row.trend} /></span>}
    />
  );
}

function DomainsCard({ domains }: { domains: MasteryRow[] }) {
  return (
    <Card title="Mastery by domain" note="Recency-weighted accuracy: recent answers count most, and a few answers can't read as 100%. Practice-test questions carry no domain, so they aren't included.">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section} className="min-w-0 space-y-3">
            <SubHeading>{SECTION_LABEL[section]}</SubHeading>
            {domains.filter((d) => d.section === section).map((d) => <DomainRow key={d.key} row={d} />)}
          </div>
        ))}
      </div>
    </Card>
  );
}

function WeakSkillRow({ skill, busyKey, onDrill }: { skill: WeakSkill; busyKey: string | null; onDrill: (s: WeakSkill) => void }) {
  const place = `${DOMAIN_LABEL[skill.domain] ?? skill.domain} · ${SECTION_LABEL[skill.section]}`;
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 basis-48">
        <MeterRow label={skill.label} value={pct(skill.mastery)} fraction={skill.mastery} detail={place} />
      </div>
      <button disabled={busyKey !== null} onClick={() => onDrill(skill)} className="btn-primary shrink-0 !px-3 !py-1.5 text-xs disabled:opacity-40">
        {busyKey === skill.key ? <Loader2 size={14} className="animate-spin" /> : "Drill this"}
      </button>
    </li>
  );
}

function SkillsCard({ weakSkills, notEnoughData, busyKey, error, onDrill }: {
  weakSkills: WeakSkill[]; notEnoughData: SATAnalytics["notEnoughData"]; busyKey: string | null; error: string | null; onDrill: (s: WeakSkill) => void;
}) {
  return (
    <Card title="Weakest skills" note="Ranked by what they could add to your score: low mastery in a heavily tested domain comes first.">
      {error ? <p className="mb-3 rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-fog">{error}</p> : null}
      {weakSkills.length ? (
        <ul className="space-y-4">
          {weakSkills.map((s) => <WeakSkillRow key={s.key} skill={s} busyKey={busyKey} onDrill={onDrill} />)}
        </ul>
      ) : <p className="text-sm text-fog">No skill has 3 answers yet — keep practising and your weakest skills appear here.</p>}
      {notEnoughData.length ? (
        <div className="mt-5 space-y-2">
          <SubHeading>Not enough data yet</SubHeading>
          <p className="text-xs text-dust">Fewer than 3 answers so far — mastery shows after 3.</p>
          <ul className="flex flex-wrap gap-2">
            {notEnoughData.map((s) => (
              <li key={s.key} className="max-w-full break-words rounded-full border border-white/10 px-2.5 py-1 text-xs text-fog">
                {s.label} · {s.attempts} answered
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function PaceRow({ section, pace }: { section: SATSection; pace: SATAnalytics["pacing"][SATSection] }) {
  if (pace.medianSec === null) {
    return <MeterRow label={SECTION_LABEL[section]} value="—" fraction={0} detail="No timing yet — time per question is recorded on new work." />;
  }
  const scale = Math.max(pace.medianSec, pace.targetSec) * 1.25;
  const slow = pace.medianSec > pace.targetSec;
  return (
    <MeterRow
      label={SECTION_LABEL[section]} value={`${Math.round(pace.medianSec)} s`}
      fraction={pace.medianSec / scale} marker={pace.targetSec / scale}
      detail={`${slow ? "Slower than" : "Within"} the real test's ${pace.targetSec} s per question (the tick) · ${count(pace.samples)} timed answers`}
    />
  );
}

function PacingCard({ pacing, flags }: { pacing: SATAnalytics["pacing"]; flags: SATAnalytics["pacingFlags"] }) {
  return (
    <Card title="Pacing" note="Median time per question, against the real digital SAT's pace.">
      <div className="space-y-4">
        {SECTIONS.map((section) => <PaceRow key={section} section={section} pace={pacing[section]} />)}
      </div>
      {flags.length ? (
        <div className="mt-5 space-y-2">
          <SubHeading>Slow and often wrong</SubHeading>
          <ul className="space-y-1.5">
            {flags.map((f) => (
              <li key={f.skill} className="break-words text-sm text-fog">
                <span className="text-ice">{f.label}</span> — median {Math.round(f.medianSec)} s, {pct(f.accuracy)} correct
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
