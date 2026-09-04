import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Gauge, TrendingUp, TrendingDown, Minus, Rocket, Trophy, School, Globe2, Info,
} from "lucide-react";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { effectiveRoles } from "@/lib/portal/view-as";
import { getKpiCached, KPI_WEIGHTS, PILLAR_INFO, type KpiStudent, type PillarKey } from "@/lib/portal/kpi";

export const metadata = { title: "My Ranking" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PILLAR_ORDER: PillarKey[] = ["mastery", "practice", "assignments", "contribution", "daily", "attendance"];

function bandOf(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: "Excellent", cls: "text-emerald2" };
  if (score >= 65) return { label: "Strong", cls: "text-cyan" };
  if (score >= 50) return { label: "Developing", cls: "text-amber-300" };
  return { label: "Needs focus", cls: "text-signal" };
}

function GaugeRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  const band = bandOf(score);
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
          className={band.cls} strokeDasharray={`${filled} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-display text-3xl font-bold text-ice">{score}</p>
          <p className={`text-[10px] font-mono uppercase tracking-widest ${band.cls}`}>{band.label}</p>
        </div>
      </div>
    </div>
  );
}

function Trend({ me }: { me: KpiStudent }) {
  if (!me.prev) return <p className="flex items-center gap-1.5 text-xs text-dust"><Minus size={13} /> First snapshot — trend appears after the next rebuild.</p>;
  const dScore = Math.round((me.composite - me.prev.composite) * 10) / 10;
  const dRank = me.prev.rankNetwork - me.rankNetwork; // positive = climbed
  if (dRank === 0 && dScore === 0) return <p className="flex items-center gap-1.5 text-xs text-dust"><Minus size={13} /> Holding steady vs the last snapshot.</p>;
  const up = dRank > 0 || (dRank === 0 && dScore > 0);
  return (
    <p className={`flex items-center gap-1.5 text-xs ${up ? "text-emerald2" : "text-signal"}`}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {dRank !== 0 ? `${dRank > 0 ? "Up" : "Down"} ${Math.abs(dRank)} network place${Math.abs(dRank) === 1 ? "" : "s"}` : "Rank unchanged"}
      {dScore !== 0 ? ` · index ${dScore > 0 ? "+" : ""}${dScore} pts` : ""} vs last snapshot
    </p>
  );
}

function RankBadge({ icon, label, rank, outOf }: { icon: React.ReactNode; label: string; rank: number; outOf: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan/30 text-cyan">{icon}</span>
      <div>
        <p className="font-display text-lg font-semibold text-ice">#{rank} <span className="text-sm font-normal text-dust">of {outOf}</span></p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-dust">{label}</p>
      </div>
    </div>
  );
}

function StudentView({ me, computedAt }: { me: KpiStudent; computedAt: string }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ice">
            <Gauge size={22} className="text-cyan" /> My Ranking
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fog">
            Your <b className="text-ice">Physics Performance Index</b> — a transparent 0–100 score across six pillars,
            weighted toward what improves real CAIE Physics outcomes.
          </p>
        </div>
        <Link href="/portal/leaderboard" className="rounded-xl border border-white/15 px-3.5 py-2 text-xs text-fog transition hover:border-cyan/40 hover:text-cyan">
          View the Leaderboard →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-space/60 p-6">
          <GaugeRing score={Math.round(me.composite)} />
          <p className="font-mono text-[10px] uppercase tracking-widest text-dust">Physics Performance Index</p>
          <Trend me={me} />
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <RankBadge icon={<Trophy size={16} />} label={`in your class · ${me.className}`} rank={me.rankClass} outOf={me.outOfClass} />
            <RankBadge icon={<School size={16} />} label={`in ${me.school}`} rank={me.rankSchool} outOf={me.outOfSchool} />
            <RankBadge icon={<Globe2 size={16} />} label="whole network" rank={me.rankNetwork} outOf={me.outOfNetwork} />
          </div>
          <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
            <div className="space-y-3.5">
              {PILLAR_ORDER.map((k) => {
                const p = me.pillars[k];
                const info = PILLAR_INFO[k];
                const band = bandOf(p.score);
                return (
                  <div key={k}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <p className="text-sm text-ice">
                        {info.label}
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-dust">weight {KPI_WEIGHTS[k]}</span>
                      </p>
                      <p className={`font-mono text-xs font-semibold ${band.cls}`}>{p.score}</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={`h-full rounded-full ${p.score >= 80 ? "bg-emerald2" : p.score >= 65 ? "bg-cyan" : p.score >= 50 ? "bg-amber-300" : "bg-signal"}`} style={{ width: `${p.score}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-dust">{p.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {me.advice.length ? (
        <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ice"><Rocket size={18} className="text-cyan" /> How to climb</h2>
          <p className="mt-1 text-xs text-dust">Your three biggest opportunities right now, with realistic index gains.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {me.advice.map((a, i) => (
              <Link key={i} href={a.href} className="group rounded-2xl border border-white/10 bg-space/60 p-4 transition hover:border-cyan/40">
                <p className="font-mono text-[10px] uppercase tracking-widest text-dust">{PILLAR_INFO[a.pillar].label}</p>
                <p className="mt-1.5 text-sm text-ice">{a.text}</p>
                <p className="mt-2 text-xs font-semibold text-emerald2">+{a.gain} pts</p>
                <p className="mt-2 text-[11px] text-cyan opacity-0 transition group-hover:opacity-100">Take me there →</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-2xl border border-white/10 bg-space/60 p-5 text-sm text-fog">
        <summary className="flex cursor-pointer items-center gap-2 text-ice"><Info size={15} className="text-cyan" /> How the index is calculated</summary>
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-dust">
          {PILLAR_ORDER.map((k) => (
            <li key={k}><b className="text-fog">{PILLAR_INFO[k].label} ({KPI_WEIGHTS[k]}%)</b> — {PILLAR_INFO[k].blurb}</li>
          ))}
          <li className="pt-1">Volume terms are log-scaled and capped, so grinding can never beat genuine mastery. Pillars with no assessable data yet score a neutral 50 (except Peer Contribution, which starts at 0 — it&apos;s fully in your hands).</li>
        </ul>
      </details>

      <p className="text-[11px] text-dust/70">Snapshot computed {new Date(computedAt).toLocaleString("en-GB")} · refreshes roughly every 15 minutes.</p>
    </div>
  );
}

function StaffView({ students, computedAt, school, classId }: { students: KpiStudent[]; computedAt: string; school: string; classId: string }) {
  const schools = [...new Set(students.map((s) => s.school))].sort();
  const classes = [...new Map(students.map((s) => [s.classId, { id: s.classId, label: `${s.school} · ${s.className}${s.section ? ` (${s.section})` : ""}` }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));
  let shown = students;
  if (school) shown = shown.filter((s) => s.school === school);
  if (classId) shown = shown.filter((s) => s.classId === classId);

  const qs = (s?: string, c?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("school", s);
    if (c) p.set("classId", c);
    const str = p.toString();
    return `/portal/my-ranking${str ? `?${str}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ice">
            <Gauge size={22} className="text-cyan" /> Physics Performance Index
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fog">
            The KPI ranking across the whole network — Mastery {KPI_WEIGHTS.mastery} · Practice {KPI_WEIGHTS.practice} · Assignments {KPI_WEIGHTS.assignments} · Daily {KPI_WEIGHTS.daily} · Attendance {KPI_WEIGHTS.attendance} · Contribution {KPI_WEIGHTS.contribution}.
            The legacy composite (accuracy/level/attendance) remains on <Link href="/portal/admin/analytics" className="text-cyan hover:underline">Rankings &amp; analytics</Link>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link href={qs()} className={`rounded-full border px-3 py-1.5 transition ${!school && !classId ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-white/10 bg-space/60 text-fog hover:border-cyan/30"}`}>All schools</Link>
        {schools.map((s) => (
          <Link key={s} href={qs(s)} className={`rounded-full border px-3 py-1.5 transition ${school === s && !classId ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-white/10 bg-space/60 text-fog hover:border-cyan/30"}`}>{s}</Link>
        ))}
        <span className="mx-1 text-dust">·</span>
        {classes.filter((c) => !school || c.label.startsWith(school)).slice(0, 12).map((c) => (
          <Link key={c.id} href={qs(undefined, c.id)} className={`rounded-full border px-3 py-1.5 transition ${classId === c.id ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-white/10 bg-space/60 text-fog hover:border-cyan/30"}`}>{c.label}</Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-space/60">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-widest text-dust">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">School · Class</th>
              <th className="px-4 py-3 text-right">PPI</th>
              {PILLAR_ORDER.map((k) => (
                <th key={k} className="px-3 py-3 text-right" title={`${PILLAR_INFO[k].label} (weight ${KPI_WEIGHTS[k]})`}>
                  {PILLAR_INFO[k].label.split(" ")[0]}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Class rank</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const band = bandOf(Math.round(s.composite));
              return (
                <tr key={s.uid} className="border-b border-white/5 text-fog transition hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5 font-mono text-xs text-dust">#{s.rankNetwork}</td>
                  <td className="px-4 py-2.5 text-ice">{s.name}{s.hasData ? "" : <span className="ml-2 font-mono text-[9px] uppercase text-dust">no data</span>}</td>
                  <td className="px-4 py-2.5 text-xs">{s.school} · {s.className}{s.section ? ` (${s.section})` : ""}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${band.cls}`}>{s.composite}</td>
                  {PILLAR_ORDER.map((k) => <td key={k} className="px-3 py-2.5 text-right font-mono text-xs">{s.pillars[k].score}</td>)}
                  <td className="px-4 py-2.5 text-right font-mono text-xs">#{s.rankClass}/{s.outOfClass}</td>
                </tr>
              );
            })}
            {!shown.length ? (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-dust">No students match this filter.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-dust/70">Snapshot computed {new Date(computedAt).toLocaleString("en-GB")} · refreshes roughly every 15 minutes.</p>
    </div>
  );
}

export default async function MyRankingPage({ searchParams }: { searchParams: Promise<{ school?: string; classId?: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const { roles } = await effectiveRoles(user);
  const student = roles.includes("student");
  const staff = isStaff(roles);
  if (!student && !staff) redirect("/portal");

  const table = await getKpiCached();

  if (student) {
    const me = table.students.find((s) => s.uid === user.id);
    if (!me) {
      return (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
          <h1 className="text-xl font-semibold text-ice">No ranking yet</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fog">
            Your Physics Performance Index appears once you&apos;re enrolled in a class. Meanwhile, work in the{" "}
            <Link href="/portal/exam-lab" className="text-cyan hover:underline">Exam Lab</Link> counts toward it from day one.
          </p>
        </div>
      );
    }
    return <StudentView me={me} computedAt={table.computed_at} />;
  }

  const sp = await searchParams;
  return <StaffView students={table.students} computedAt={table.computed_at} school={(sp.school || "").trim()} classId={(sp.classId || "").trim()} />;
}
