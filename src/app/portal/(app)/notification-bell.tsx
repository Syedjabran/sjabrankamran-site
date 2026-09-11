"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, CheckCheck, Target, Trophy, ClipboardList, FlaskConical, Megaphone, Mail, BookOpen, CheckSquare, CalendarX2, TrendingUp, AlarmClock } from "lucide-react";

type Notif = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const KIND_ICON: Record<string, React.ReactNode> = {
  task: <Target size={14} className="text-cyan" />,
  challenge: <Trophy size={14} className="text-amber-300" />,
  assignment: <ClipboardList size={14} className="text-cyan" />,
  test: <FlaskConical size={14} className="text-magenta" />,
  announcement: <Megaphone size={14} className="text-emerald2" />,
  mail: <Mail size={14} className="text-cyan" />,
  resource: <BookOpen size={14} className="text-emerald2" />,
  marks: <CheckSquare size={14} className="text-amber-300" />,
  attendance: <CalendarX2 size={14} className="text-signal" />,
  rank: <TrendingUp size={14} className="text-cyan" />,
  reminder: <AlarmClock size={14} className="text-amber-300" />,
};
function rel(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/notifications", { headers: { "content-type": "application/json" } });
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.items || []); setUnread(j.unread || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    // Refresh immediately when the PWA layer detects new alerts.
    const onAlerts = () => load();
    window.addEventListener("sjak:alerts", onAlerts);
    return () => { clearInterval(t); window.removeEventListener("sjak:alerts", onAlerts); };
  }, [load]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function markAll() {
    setUnread(0); setItems((s) => s.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    await fetch("/api/portal/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "read_all" }) }).catch(() => {});
  }
  async function openNotif(n: Notif) {
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((s) => s.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      fetch("/api/portal/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "read", id: n.id }) }).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((s) => !s)} aria-label="Notifications"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-fog transition hover:border-cyan/40 hover:text-cyan">
        <Bell size={15} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-signal px-1 text-[9px] font-bold leading-[15px] text-white">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-2xl border border-white/10 bg-space shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <p className="text-sm font-semibold text-ice">Notifications</p>
            {unread > 0 ? (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-[11px] text-cyan hover:underline"><CheckCheck size={12} /> Mark all read</button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-auto">
            {items.length ? items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openNotif(n)} className={"flex w-full items-start gap-2.5 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/[0.03] " + (n.read_at ? "" : "bg-cyan/[0.04]")}>
                  <span className="mt-0.5 shrink-0">{KIND_ICON[n.kind] || <Bell size={14} className="text-dust" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={"truncate text-xs " + (n.read_at ? "text-fog" : "font-semibold text-ice")}>{n.title}</span>
                      {!n.read_at ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" /> : null}
                    </span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-[11px] text-dust">{n.body}</span> : null}
                    <span className="mt-0.5 block text-[10px] text-dust">{rel(n.created_at)}</span>
                  </span>
                </button>
              </li>
            )) : (
              <li className="px-4 py-8 text-center text-xs text-dust">No notifications yet.</li>
            )}
          </ul>
          <div className="border-t border-white/10 px-4 py-2.5 text-center">
            <Link href="/portal/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-cyan hover:underline">
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
