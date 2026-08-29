"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, School, Users, Globe, Crown, Flame } from "lucide-react";

type Row = { name: string; isMe: boolean; score: number; accuracy: number | null; level: number; attempts: number; rankInClass: number; rankInSchool: number; rankOverall: number; hasData: boolean };
type Me = { name: string; school: string; className: string; section: string | null; score: number; accuracy: number | null; level: number; attempts: number; rankInClass: number; outOfClass: number; rankInSchool: number; outOfSchool: number; rankOverall: number; outOfOverall: number };
type Data = { hasData: boolean; message?: string; me?: Me; classBoard?: Row[]; schoolBoard?: Row[]; overallBoard?: Row[] };

function medal(rank: number) {
  if (rank === 1) return { icon: "🥇", cls: "text-amber-300" };
  if (rank === 2) return { icon: "🥈", cls: "text-dust" };
  if (rank === 3) return { icon: "🥉", cls: "" };
  return { icon: `#${rank}`, cls: "text-dust" };
}

function RankCard({ label, icon, rank, outOf, accent }: { label: string; icon: React.ReactNode; rank: number; outOf: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-space/60 p-4 text-center">
      <div className={"mx-auto mb-1 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-widest " + accent}>{icon}{label}</div>
      <p className="font-display text-3xl font-semibold text-ice">#{rank}</p>
      <p className="text-[11px] text-dust">of {outOf}</p>
    </div>
  );
}

function Board({ title, icon, rows, rankKey }: { title: string; icon: React.ReactNode; rows: Row[]; rankKey: "rankInClass" | "rankInSchool" | "rankOverall" }) {
  const max = Math.max(1, ...rows.map((r) => r.score));
  return (
    <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ice">{icon}{title}</h2>
      {rows.length ? (
        <ul className="space-y-1">
          {rows.map((r, i) => {
            const rank = r[rankKey];
            const m = medal(rank);
            return (
              <li key={i} className={"flex items-center gap-3 rounded-lg px-2.5 py-2 " + (r.isMe ? "border border-cyan/40 bg-cyan/[0.06]" : "hover:bg-white/[0.03]")}>
                <span className={"w-8 shrink-0 text-center font-mono text-xs " + m.cls} style={rank === 3 ? { color: "#C6A55A" } : undefined}>{m.icon}</span>
                <span className={"min-w-0 flex-1 truncate text-sm " + (r.isMe ? "font-semibold text-cyan" : "text-fog")}>{r.name}</span>
                <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                  <div className="h-full rounded-full bg-cyan/70" style={{ width: `${Math.round((r.score / max) * 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-ice">{r.hasData ? r.score : "—"}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-dust">No one on this board yet.</p>}
    </section>
  );
}

export function LeaderboardClient() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/portal/leaderboard").then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    }).catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-fog">{err}</p>;
  if (!data) return <p className="text-sm text-dust">Loading the leaderboard…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/30 text-amber-300"><Trophy size={18} /></span>
        <div>
          <h1 className="text-2xl font-semibold text-ice">Leaderboard</h1>
          <p className="text-xs text-dust">Climb your class, your school, and the whole network. Practise in Exam Lab to rise.</p>
        </div>
      </div>

      {!data.hasData ? (
        <div className="rounded-2xl border border-cyan/20 bg-space/60 p-6 text-center">
          <Flame size={22} className="mx-auto text-cyan" />
          <p className="mt-3 text-sm text-fog">{data.message}</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-space/80 to-abyss/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-dust">Your standing</p>
                <p className="font-display text-lg font-semibold text-ice">{data.me!.className}</p>
                <p className="text-xs text-dust">{data.me!.school} · Level {data.me!.level} · Score {data.me!.score}{data.me!.accuracy != null ? ` · ${data.me!.accuracy}% accuracy` : ""}</p>
              </div>
              <Crown size={26} className="text-amber-300" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <RankCard label="Class" icon={<Users size={12} />} rank={data.me!.rankInClass} outOf={data.me!.outOfClass} accent="text-cyan" />
              <RankCard label="School" icon={<School size={12} />} rank={data.me!.rankInSchool} outOf={data.me!.outOfSchool} accent="text-emerald2" />
              <RankCard label="Network" icon={<Globe size={12} />} rank={data.me!.rankOverall} outOf={data.me!.outOfOverall} accent="text-magenta" />
            </div>
          </div>

          <Board title="My class" icon={<Users size={15} className="text-cyan" />} rows={data.classBoard || []} rankKey="rankInClass" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Board title="Across my school (all sections)" icon={<School size={15} className="text-emerald2" />} rows={data.schoolBoard || []} rankKey="rankInSchool" />
            <Board title="Whole network" icon={<Globe size={15} className="text-magenta" />} rows={data.overallBoard || []} rankKey="rankOverall" />
          </div>
          <p className="text-center text-[11px] text-dust">Ranking = accuracy 60% · level 25% · attendance 15%. Keep practising to climb. 🚀</p>
        </>
      )}
    </div>
  );
}
