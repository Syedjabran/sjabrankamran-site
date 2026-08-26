"use client";

import { useMemo, useState } from "react";
import { FileText, Layers, Play } from "lucide-react";
import { IMAGE_BANK, IMAGE_PAPERS, type ImgQuestion } from "@/lib/exam-lab/image-bank";
import { PaperRunner } from "./paper-runner";

const SESS: Record<string, string> = { s: "May/June", w: "Oct/Nov", m: "Feb/March" };
const PAPER_NAME: Record<string, string> = { P1: "Paper 1 · Multiple Choice", P2: "Paper 2 · AS Structured", P4: "Paper 4 · A2 Structured" };

function label(code: string) {
  const m = code.match(/9702_([smw])(\d\d)_(\d\d)/);
  if (!m) return code;
  const [, s, yy, v] = m;
  return `${SESS[s] || s} 20${yy} · variant ${v[1]}`;
}

const TOPICS_AS = ["Physical quantities & units","Kinematics","Dynamics","Forces, density & pressure","Work, energy & power","Deformation of solids","Waves","Superposition","Electricity","D.C. circuits","Particle physics"];
const TOPICS_A2 = ["Circular motion","Gravitational fields","Thermal physics","Ideal gases","Oscillations","Electric fields","Capacitance","Magnetic fields","Alternating currents","Quantum physics","Nuclear physics","Astronomy & cosmology"];

export function PapersHub() {
  const [tab, setTab] = useState<"papers" | "drill">("papers");
  const [active, setActive] = useState<{ questions: ImgQuestion[]; title: string; subtitle?: string; duration: number; timed: boolean; logMeta: { mode: "paper" | "drill"; code?: string; ref?: string; paperType: "P1" | "P2" | "P4" | "mixed" } } | null>(null);

  // drill state
  const [pType, setPType] = useState<"P1" | "P2" | "P4">("P1");
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Set<"LOT" | "HOT">>(new Set(["LOT", "HOT"]));
  const [count, setCount] = useState(8);

  const grouped = useMemo(() => {
    // IMAGE_PAPERS is already sorted chronologically (year → session → variant).
    const g: Record<string, typeof IMAGE_PAPERS> = { P1: [], P2: [], P4: [] };
    IMAGE_PAPERS.forEach((p) => g[p.paperType]?.push(p));
    return g;
  }, []);

  function startPaper(code: string) {
    const qs = IMAGE_BANK.filter((q) => q.code === code).sort((a, b) => a.qnum - b.qnum);
    const meta = IMAGE_PAPERS.find((p) => p.code === code)!;
    setActive({ questions: qs, title: `${PAPER_NAME[meta.paperType]}`, subtitle: `${meta.ref} · ${label(code)}`, duration: meta.duration, timed: true, logMeta: { mode: "paper", code, ref: meta.ref, paperType: meta.paperType } });
  }

  const drillPool = useMemo(() => {
    return IMAGE_BANK.filter((q) => q.paperType === pType && (!topics.size || (q.topic && topics.has(q.topic))) && levels.has(q.level));
  }, [pType, topics, levels]);

  function startDrill() {
    const pool = [...drillPool];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const qs = pool.slice(0, count);
    setActive({ questions: qs, title: `Topic drill · ${PAPER_NAME[pType].split(" · ")[0]}`, subtitle: `${qs.length} questions`, duration: Math.max(10, qs.length * (pType === "P1" ? 2 : 8)), timed: false, logMeta: { mode: "drill", paperType: pType } });
  }

  if (active) {
    return <PaperRunner {...active} onExit={() => setActive(null)} />;
  }

  const availTopics = pType === "P1" ? TOPICS_AS : pType === "P2" ? TOPICS_AS : TOPICS_A2;

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab("papers")} className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (tab === "papers" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}><FileText size={15} /> Sit a real paper</button>
        <button onClick={() => setTab("drill")} className={"inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (tab === "drill" ? "border-cyan bg-cyan text-space font-semibold" : "border-white/15 text-fog hover:border-cyan")}><Layers size={15} /> Topic drill</button>
      </div>

      {tab === "papers" ? (
        <div className="space-y-6">
          {(["P1", "P2", "P4"] as const).map((pt) => (
            <div key={pt}>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fog">{PAPER_NAME[pt]}</p>
              {grouped[pt].length === 0 ? (
                <p className="text-xs text-dust">More {pt} papers are being added…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped[pt].map((p) => (
                    <button key={p.code} onClick={() => startPaper(p.code)} className="card card-hover group p-4 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm text-ice">{label(p.code)}</span>
                        <Play size={16} className="text-cyan opacity-70 transition group-hover:opacity-100" />
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-dust">{p.ref}</p>
                      <p className="mt-2 font-mono text-[11px] text-fog">{p.count} Q · {p.marks} marks · {p.duration} min</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-5">
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
