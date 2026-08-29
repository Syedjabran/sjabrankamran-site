"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Circle } from "lucide-react";

type OnlineUser = { uid: string; name: string; role: string; label: string; secondsAgo: number };
type Data = { count: number; users: OnlineUser[]; byActivity: Record<string, number> };

const ROLE_DOT: Record<string, string> = {
  super_admin: "text-magenta", admin: "text-magenta", teacher: "text-cyan",
  teaching_assistant: "text-cyan", student: "text-emerald2", parent: "text-amber-300",
};

function ago(s: number) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`; }

/** Live "who's online" panel for staff — polls every 20s. */
export function OnlineNow() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/portal/admin/presence");
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (alive) { setData(j); setErr(false); }
      } catch { if (alive) setErr(true); }
    };
    load();
    const id = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice">
          <span className="relative flex h-2.5 w-2.5">
            <span className={"absolute inline-flex h-full w-full animate-ping rounded-full " + (data?.count ? "bg-emerald2/60" : "bg-dust/30")} />
            <span className={"relative inline-flex h-2.5 w-2.5 rounded-full " + (data?.count ? "bg-emerald2" : "bg-dust/50")} />
          </span>
          Online now
        </h2>
        <span className="font-mono text-lg font-semibold text-ice">{data ? data.count : "—"}</span>
      </div>

      {err ? (
        <p className="text-xs text-dust">Presence unavailable.</p>
      ) : !data ? (
        <p className="text-xs text-dust">Loading…</p>
      ) : data.users.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-abyss/40 p-3 text-xs text-dust">No one else is online right now.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.users.slice(0, 12).map((u) => (
            <li key={u.uid}>
              <Link href={`/portal/admin/users/${u.uid}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]">
                <Circle size={8} className={"shrink-0 fill-current " + (ROLE_DOT[u.role] || "text-fog")} />
                <span className="min-w-0 flex-1 truncate text-xs text-fog"><span className="text-ice">{u.name}</span></span>
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-dust">{u.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-dust">{ago(u.secondsAgo)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && Object.keys(data.byActivity).length ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
          {Object.entries(data.byActivity).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-dust">
              <Radio size={9} className="text-cyan" /> {k} <span className="text-ice">{v}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
