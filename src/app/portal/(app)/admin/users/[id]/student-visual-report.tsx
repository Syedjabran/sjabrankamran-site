"use client";

import { BarChart3, CalendarCheck, Clock3, Target, TrendingUp, Trophy } from "lucide-react";

type Topic = { topic: string; attempted: number; earned: number; available: number; accuracy: number };
type Paper = { paperType: string; attempts: number; accuracy: number };
type TimeTopic = { topic: string; tracked: number; spent: number; expected: number; ratio: number };

export type StudentVisualData = {
  totalAttempts: number;
  papersSat: number;
  scoredQuestions: number;
  overallAccuracy: number;
  level: number;
  levelLabel: string;
  byTopic: Topic[];
  byPaper: Paper[];
  byLevel: { LOT: number; HOT: number };
  timeline: { ts: number; accuracy: number; label: string }[];
  recommendations: string[];
  timeManagement: {
    tracked: number;
    spent: number;
    expected: number;
    withinTargetPct: number | null;
    efficiencyPct: number | null;
    byTopic: TimeTopic[];
  };
  rank: {
    overall: number;
    school: number;
    class: number;
    score: number;
    totalStudents: number;
    schoolStudents: number;
    classStudents: number;
  } | null;
};

type Attendance = { total: number; present: number; late: number; absent: number; pct: number } | null;

function colour(value: number) {
  return value >= 75 ? "#12D48C" : value >= 55 ? "#3DE1F0" : value >= 40 ? "#FFB347" : "#F05D7A";
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}m${s ? ` ${s}s` : ""}` : `${s}s`;
}

function Trend({ points }: { points: StudentVisualData["timeline"] }) {
  if (points.length < 2) return <Empty text="The accuracy trend appears after two scored attempts." />;
  const w = 620, h = 150, padX = 18, padY = 18;
  const px = (i: number) => padX + i * ((w - 2 * padX) / Math.max(1, points.length - 1));
  const py = (v: number) => h - padY - (Math.max(0, Math.min(100, v)) / 100) * (h - 2 * padY);
  const coords = points.map((p, i) => [px(i), py(p.accuracy)] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const area = `${line} L${coords.at(-1)?.[0]},${h - padY} L${coords[0][0]},${h - padY} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Accuracy trend">
        <defs><linearGradient id="student-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3DE1F0" stopOpacity=".34"/><stop offset="1" stopColor="#3DE1F0" stopOpacity="0"/></linearGradient></defs>
        {[25, 50, 75, 100].map((v) => <line key={v} x1={padX} x2={w - padX} y1={py(v)} y2={py(v)} stroke="rgba(255,255,255,.08)" strokeDasharray="4 6" />)}
        <path d={area} fill="url(#student-trend-fill)" />
        <path d={line} fill="none" stroke="#3DE1F0" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {coords.map(([x, y], i) => <circle key={points[i].ts} cx={x} cy={y} r="4" fill={colour(points[i].accuracy)} stroke="#0a1024" strokeWidth="2"><title>{points[i].label}: {points[i].accuracy}%</title></circle>)}
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-dust"><span>{new Date(points[0].ts).toLocaleDateString()}</span><span>Latest {points.at(-1)?.accuracy}%</span><span>{new Date(points.at(-1)?.ts || 0).toLocaleDateString()}</span></div>
    </div>
  );
}

function Bar({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate text-fog" title={label}>{label}</span><span className="shrink-0 font-mono" style={{ color: colour(value) }}>{value}%{note ? ` · ${note}` : ""}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: colour(value) }} /></div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-xs text-dust">{text}</p>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-abyss/35 p-5"><h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust">{icon}{title}</h3>{children}</section>;
}

export function StudentVisualReport({ progress, attendance }: { progress: StudentVisualData; attendance: Attendance }) {
  const rank = progress.rank;
  return (
    <section className="overflow-hidden rounded-3xl border border-cyan/20 bg-gradient-to-br from-cyan/[0.06] via-space/80 to-violet2/[0.06] p-5 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">Student intelligence report</p><h2 className="mt-1 text-xl font-semibold text-ice">Visual performance dashboard</h2><p className="mt-1 text-xs text-dust">Live evidence from Exam Lab, attendance and ecosystem rankings.</p></div>
        <div className="flex gap-2">
          <div className="rounded-xl border border-white/10 bg-abyss/50 px-4 py-2 text-center"><p className="font-display text-xl text-cyan">{progress.level}<span className="text-xs text-dust">/10</span></p><p className="text-[9px] uppercase tracking-widest text-dust">{progress.levelLabel}</p></div>
          <div className="rounded-xl border border-white/10 bg-abyss/50 px-4 py-2 text-center"><p className="font-display text-xl" style={{ color: colour(progress.overallAccuracy) }}>{progress.scoredQuestions ? `${progress.overallAccuracy}%` : "—"}</p><p className="text-[9px] uppercase tracking-widest text-dust">Accuracy</p></div>
        </div>
      </div>

      {rank ? <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Class rank", `#${rank.class}`, `of ${rank.classStudents}`],
          ["School rank", `#${rank.school}`, `of ${rank.schoolStudents}`],
          ["Overall rank", `#${rank.overall}`, `of ${rank.totalStudents}`],
          ["Composite score", `${rank.score}`, "accuracy · level · attendance"],
        ].map(([label, value, sub], i) => <div key={label} className="rounded-2xl border border-white/10 bg-space/55 p-4"><div className="flex items-center justify-between"><Trophy size={14} className={i < 3 ? "text-amber-300" : "text-cyan"}/><span className="font-display text-2xl text-ice">{value}</span></div><p className="mt-2 text-[10px] uppercase tracking-widest text-dust">{label}</p><p className="text-[10px] text-fog">{sub}</p></div>)}
      </div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Accuracy over time" icon={<TrendingUp size={14} className="text-cyan"/>}><Trend points={progress.timeline}/></Panel>
        <Panel title="Topic mastery" icon={<Target size={14} className="text-cyan"/>}>
          {progress.byTopic.length ? <div className="space-y-3">{progress.byTopic.slice(0, 8).map((t) => <Bar key={t.topic} label={t.topic} value={t.accuracy} note={`${t.attempted} Q`} />)}</div> : <Empty text="Topic mastery appears after scored questions."/>}
        </Panel>
        <Panel title="Paper & thinking-level performance" icon={<BarChart3 size={14} className="text-cyan"/>}>
          <div className="space-y-3">
            <Bar label="LOT · foundational questions" value={progress.byLevel.LOT}/>
            <Bar label="HOT · analysis/evaluation" value={progress.byLevel.HOT}/>
            {progress.byPaper.map((p) => <Bar key={p.paperType} label={`${p.paperType} performance`} value={p.accuracy} note={`${p.attempts} attempts`}/>) }
          </div>
        </Panel>
        <Panel title="Attendance composition" icon={<CalendarCheck size={14} className="text-cyan"/>}>
          {attendance ? <div className="flex flex-wrap items-center gap-6">
            <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#12D48C 0 ${(attendance.present / attendance.total) * 100}%, #FFB347 0 ${((attendance.present + attendance.late) / attendance.total) * 100}%, #F05D7A 0)` }}><div className="grid h-[98px] w-[98px] place-items-center rounded-full bg-abyss text-center"><div><p className="font-display text-2xl text-ice">{attendance.pct}%</p><p className="text-[9px] uppercase text-dust">attended</p></div></div></div>
            <div className="grid flex-1 grid-cols-3 gap-2 text-center">{[["Present", attendance.present, "text-emerald2"],["Late", attendance.late, "text-amber-300"],["Absent", attendance.absent, "text-signal"]].map(([l,v,c]) => <div key={String(l)} className="rounded-xl border border-white/10 p-3"><p className={`font-display text-xl ${c}`}>{v}</p><p className="text-[9px] uppercase tracking-widest text-dust">{l}</p></div>)}</div>
          </div> : <Empty text="No attendance has been recorded yet."/>}
        </Panel>
        <Panel title="Time-management efficiency" icon={<Clock3 size={14} className="text-cyan"/>}>
          {progress.timeManagement.tracked ? <div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">{[["Tracked", progress.timeManagement.tracked],["Within target", `${progress.timeManagement.withinTargetPct}%`],["Spent / target", `${fmt(progress.timeManagement.spent)} / ${fmt(progress.timeManagement.expected)}`]].map(([l,v]) => <div key={String(l)} className="rounded-xl border border-white/10 px-2 py-3"><p className="font-mono text-sm text-ice">{v}</p><p className="mt-1 text-[9px] uppercase text-dust">{l}</p></div>)}</div>
            <div className="space-y-3">{progress.timeManagement.byTopic.slice(0,6).map((t) => <div key={t.topic}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="min-w-0 truncate text-fog">{t.topic}</span><span className={"shrink-0 font-mono " + (t.ratio <= 100 ? "text-emerald2" : t.ratio <= 125 ? "text-amber-300" : "text-signal")}>{t.ratio}% of target</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={"h-full rounded-full " + (t.ratio <= 100 ? "bg-emerald2" : t.ratio <= 125 ? "bg-amber-300" : "bg-signal")} style={{ width: `${Math.min(100, t.ratio)}%` }}/></div></div>)}</div>
          </div> : <Empty text="Per-question time analytics will appear after the student completes a newly timed paper or drill."/>}
        </Panel>
        <Panel title="Recommended strategy" icon={<Target size={14} className="text-cyan"/>}>
          <ol className="space-y-2">{progress.recommendations.map((r, i) => <li key={r} className="flex gap-3 rounded-xl border border-white/[0.07] bg-space/50 px-3 py-2.5 text-xs text-fog"><span className="font-mono text-cyan">{String(i + 1).padStart(2,"0")}</span><span>{r}</span></li>)}</ol>
        </Panel>
      </div>
    </section>
  );
}
