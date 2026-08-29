"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Radio, CalendarClock, Activity } from "lucide-react";

type Item = { when: string | null; ts: number | null; kind: string; title: string; detail: string; status?: string };
type Data = { hasStudent: boolean; past: Item[]; present: Item[]; future: Item[] };

const KIND_COLOR: Record<string, string> = {
  practice: "text-cyan", attendance: "text-emerald2", result: "text-magenta",
  submission: "text-cyan", assignment: "text-amber-300", lesson: "text-ice",
  test: "text-magenta", schedule: "text-dust",
};

function Row({ it }: { it: Item }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-white/10 bg-abyss/40 px-3 py-2">
      <span className={"mt-0.5 w-16 shrink-0 font-mono text-[10px] uppercase tracking-widest " + (KIND_COLOR[it.kind] || "text-dust")}>{it.kind}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-fog">{it.title}</p>
        <p className="truncate text-[11px] text-dust">{it.detail}</p>
      </div>
      {it.when ? <span className="shrink-0 whitespace-nowrap text-[10px] text-dust">{new Date(it.when).toLocaleDateString()}</span> : null}
    </li>
  );
}

export function ActivityTimeline({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"past" | "present" | "future">("present");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/admin/users/${id}/activity`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const tabs: [typeof tab, string, React.ReactNode][] = [
    ["past", "Past", <History key="p" size={13} />],
    ["present", "Present", <Radio key="n" size={13} />],
    ["future", "Future", <CalendarClock key="f" size={13} />],
  ];
  const items = data ? data[tab] : [];

  return (
    <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust"><Activity size={13} className="text-cyan" /> Activity</h2>
        <div className="flex gap-1">
          {tabs.map(([v, l, icon]) => (
            <button key={v} onClick={() => setTab(v)}
              className={"inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] " + (tab === v ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
              {icon} {l}{data ? ` (${data[v].length})` : ""}
            </button>
          ))}
        </div>
      </div>
      {err ? <p className="text-xs text-signal">{err}</p> : !data ? <p className="text-xs text-dust">Loading…</p> : items.length ? (
        <ul className="space-y-1.5">{items.map((it, i) => <Row key={i} it={it} />)}</ul>
      ) : (
        <p className="text-xs text-dust">{tab === "future" ? "No upcoming lessons, tests or deadlines." : tab === "present" ? "Nothing in progress right now." : "No past activity recorded yet."}</p>
      )}
    </section>
  );
}
