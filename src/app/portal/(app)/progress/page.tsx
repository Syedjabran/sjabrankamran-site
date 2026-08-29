import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp, Target, FileText, ListChecks, Trophy, ArrowRight, Sparkles, CalendarCheck, GraduationCap } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse, type TopicStat } from "@/lib/exam-lab/analytics";
import { getMyPerformance } from "@/lib/edu/performance";

export const metadata = { title: "My Progress — Exam Lab", robots: { index: false } };

function accColor(a: number) {
  return a >= 75 ? "#12D48C" : a >= 55 ? "#3DE1F0" : a >= 40 ? "#FF7A2F" : "#F03Dce";
}

function Bar({ s, max = 100 }: { s: TopicStat; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-xs text-fog" title={s.topic}>{s.topic}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${(s.accuracy / max) * 100}%`, background: accColor(s.accuracy) }} />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs" style={{ color: accColor(s.accuracy) }}>{s.accuracy}%</span>
    </div>
  );
}

function Timeline({ points }: { points: { accuracy: number; label: string }[] }) {
  if (points.length < 2) return <p className="text-sm text-dust">Sit a few papers to see your trend.</p>;
  const W = 640, H = 120, pad = 8;
  const step = (W - pad * 2) / (points.length - 1);
  const pts = points.map((p, i) => [pad + i * step, H - pad - (p.accuracy / 100) * (H - pad * 2)]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pts[0][0].toFixed(1)},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
      <defs>
        <linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DE1F0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3DE1F0" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((y) => (
        <line key={y} x1={pad} x2={W - pad} y1={H - pad - (y / 100) * (H - pad * 2)} y2={H - pad - (y / 100) * (H - pad * 2)} stroke="rgba(255,255,255,0.06)" />
      ))}
      <path d={area} fill="url(#tlg)" />
      <path d={d} fill="none" stroke="#3DE1F0" strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#3DE1F0" />)}
    </svg>
  );
}

export default async function ProgressPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  // "My Progress" is a student-only surface. Staff/owner are sent to the admin
  // dashboard (they view any student's progress via Users → the 360/activity).
  if (!user.roles.includes("student")) redirect("/portal");
  const [attempts, perf] = await Promise.all([getAttempts(user!.id), getMyPerformance()]);
  const a = analyse(attempts);
  const first = (user?.fullName || user?.email || "").split(" ")[0];

  if (a.totalAttempts === 0 && !perf.hasData) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ice">My Progress</h1>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <Trophy size={28} className="mx-auto text-cyan" />
          <p className="mt-4 text-fog">No attempts yet{first ? `, ${first}` : ""}. Sit a past paper or a topic drill and your progress, strengths and weaknesses will appear here.</p>
          <Link href="/portal/exam-lab" className="btn-primary mt-5 inline-flex"><FileText size={16} /> Go to Exam Lab</Link>
        </div>
        {perf.hasData ? <AcademicsSection perf={perf} /> : null}
      </div>
    );
  }

  const stat = [
    { icon: Target, label: "Overall accuracy", value: `${a.overallAccuracy}%`, color: accColor(a.overallAccuracy) },
    { icon: FileText, label: "Papers sat", value: a.papersSat, color: "#EEF2FF" },
    { icon: ListChecks, label: "Questions done", value: a.questionsAttempted, color: "#EEF2FF" },
    { icon: TrendingUp, label: "Attempts", value: a.totalAttempts, color: "#EEF2FF" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ice">My Progress</h1>
          <p className="text-sm text-dust">Your CAIE 9702 performance{first ? ` · ${first}` : ""}</p>
        </div>
        <Link href="/portal/exam-lab" className="btn-ghost !px-3.5 !py-1.5 text-xs">Exam Lab <ArrowRight size={13} /></Link>
      </div>

      {/* Level + stats */}
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan/10 to-violet2/10 p-5">
          <div className="grid h-28 w-28 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(#3DE1F0 ${a.level * 10}%, rgba(255,255,255,.08) 0)` }}>
            <div className="grid h-[92px] w-[92px] place-items-center rounded-full bg-abyss text-center">
              <div>
                <span className="block font-mono text-[9px] uppercase tracking-widest text-dust">Level</span>
                <b className="font-display text-3xl text-ice">{a.level}</b>
                <span className="block font-mono text-[9px] text-cyan">/ 10</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-display text-lg text-ice">{a.levelLabel}</p>
            <p className="mt-1 max-w-xs text-xs text-fog">{a.nextLevelHint}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <s.icon size={16} className="text-cyan" />
              <p className="mt-2 font-display text-2xl" style={{ color: s.color }}>{s.value}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-dust">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-fog"><TrendingUp size={13} className="text-cyan" /> Accuracy over recent attempts</p>
        <Timeline points={a.timeline} />
      </div>

      {/* Strengths / Weaknesses */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald2/20 bg-emerald2/[0.03] p-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-emerald2">💪 Strengths</p>
          {a.strengths.length ? <div className="space-y-2.5">{a.strengths.map((s) => <Bar key={s.topic} s={s} />)}</div> : <p className="text-sm text-dust">Keep practising to reveal your strengths.</p>}
        </div>
        <div className="rounded-2xl border border-magenta/20 bg-magenta/[0.03] p-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-magenta">🎯 Focus areas</p>
          {a.weaknesses.length ? <div className="space-y-2.5">{a.weaknesses.map((s) => <Bar key={s.topic} s={s} />)}</div> : <p className="text-sm text-dust">No weak spots yet — nice.</p>}
        </div>
      </div>

      {/* LOT/HOT + by paper + recommendations */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-fog">Thinking level</p>
          <div className="space-y-3">
            <div><div className="flex justify-between text-xs"><span className="text-emerald2">LOT · recall/apply</span><span className="font-mono">{a.byLevel.LOT}%</span></div><div className="mt-1 h-2 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald2" style={{ width: `${a.byLevel.LOT}%` }} /></div></div>
            <div><div className="flex justify-between text-xs"><span className="text-magenta">HOT · analyse/evaluate</span><span className="font-mono">{a.byLevel.HOT}%</span></div><div className="mt-1 h-2 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-magenta" style={{ width: `${a.byLevel.HOT}%` }} /></div></div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-fog">By paper</p>
          <div className="space-y-2.5">
            {a.byPaper.length ? a.byPaper.map((p) => (
              <div key={p.paperType} className="flex items-center gap-3">
                <span className="w-8 font-mono text-xs text-fog">{p.paperType}</span>
                <div className="h-2 flex-1 rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${p.accuracy}%`, background: accColor(p.accuracy) }} /></div>
                <span className="w-10 text-right font-mono text-xs" style={{ color: accColor(p.accuracy) }}>{p.accuracy}%</span>
              </div>
            )) : <p className="text-sm text-dust">—</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-5">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-cyan"><Sparkles size={13} /> Improvement plan</p>
          <ul className="space-y-2">
            {a.recommendations.map((r, i) => <li key={i} className="flex gap-2 text-sm text-fog"><span className="text-cyan">→</span><span>{r}</span></li>)}
          </ul>
        </div>
      </div>

      {/* Academics: attendance + class results (real school data, RLS-scoped) */}
      {perf.hasData ? <AcademicsSection perf={perf} /> : null}

      {/* Recent attempts */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-fog">Recent attempts</p>
        <div className="space-y-1.5">
          {a.recentAttempts.map((at, i) => {
            const pct = at.total ? Math.round((at.score / at.total) * 100) : null;
            return (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.05] px-3 py-2 text-sm">
                <span className="font-mono text-xs text-dust">{new Date(at.ts).toLocaleDateString("en-GB")}</span>
                <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] text-fog">{at.paperType}</span>
                <span className="text-fog">{at.ref || (at.mode === "drill" ? "Topic drill" : "Paper")}</span>
                <span className="ml-auto font-mono text-xs" style={{ color: pct == null ? "#AEB8D8" : accColor(pct) }}>
                  {pct == null ? `${at.qCount} Q` : `${at.score}/${at.total} · ${pct}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AcademicsSection({ perf }: { perf: Awaited<ReturnType<typeof getMyPerformance>> }) {
  const att = perf.attendance;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {att && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-fog"><CalendarCheck size={13} className="text-cyan" /> Attendance</p>
          <div className="flex items-center gap-4">
            <div className="grid h-20 w-20 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(${accColor(att.pct)} ${att.pct}%, rgba(255,255,255,.08) 0)` }}>
              <div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-abyss"><b className="font-display text-lg" style={{ color: accColor(att.pct) }}>{att.pct}%</b></div>
            </div>
            <div className="font-mono text-xs text-fog">
              <p><span className="text-emerald2">{att.present}</span> present</p>
              <p><span className="text-signal">{att.late}</span> late</p>
              <p><span className="text-magenta">{att.absent}</span> absent</p>
              <p className="mt-1 text-dust">of {att.total} lessons</p>
            </div>
          </div>
        </div>
      )}
      <div className={"rounded-2xl border border-white/10 bg-white/[0.02] p-5 " + (att ? "md:col-span-2" : "md:col-span-3")}>
        <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-fog"><GraduationCap size={13} className="text-cyan" /> Class results {perf.averagePct != null && <span className="text-dust">· avg {perf.averagePct}%</span>}</p>
        {perf.results.length ? (
          <div className="space-y-1.5">
            {perf.results.slice(0, 8).map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.05] px-3 py-2 text-sm">
                {r.date && <span className="font-mono text-xs text-dust">{new Date(r.date).toLocaleDateString("en-GB")}</span>}
                <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase text-fog">{r.kind}</span>
                <span className="text-fog">{r.title}</span>
                <span className="ml-auto font-mono text-xs" style={{ color: r.pct == null ? "#AEB8D8" : accColor(r.pct) }}>
                  {r.grade ? `${r.grade} · ` : ""}{r.score != null && r.total != null ? `${r.score}/${r.total}` : "—"}{r.pct != null ? ` · ${r.pct}%` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-dust">No class results recorded yet.</p>}
      </div>
    </div>
  );
}
