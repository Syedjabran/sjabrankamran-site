"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BellRing, CheckCheck, Target, Trophy, ClipboardList, FlaskConical,
  Megaphone, Mail, BookOpen, CheckSquare, CalendarX2, TrendingUp, AlarmClock,
  CalendarPlus, Smartphone, Copy, Check, ChevronDown,
} from "lucide-react";

type Notif = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const KIND_ICON: Record<string, React.ReactNode> = {
  task: <Target size={15} className="text-cyan" />,
  challenge: <Trophy size={15} className="text-amber-300" />,
  assignment: <ClipboardList size={15} className="text-cyan" />,
  test: <FlaskConical size={15} className="text-magenta" />,
  announcement: <Megaphone size={15} className="text-emerald2" />,
  mail: <Mail size={15} className="text-cyan" />,
  resource: <BookOpen size={15} className="text-emerald2" />,
  marks: <CheckSquare size={15} className="text-amber-300" />,
  attendance: <CalendarX2 size={15} className="text-signal" />,
  rank: <TrendingUp size={15} className="text-cyan" />,
  reminder: <AlarmClock size={15} className="text-amber-300" />,
};

const FILTERS: { id: string; label: string; kinds: string[] | null }[] = [
  { id: "all", label: "All", kinds: null },
  { id: "work", label: "Tests & tasks", kinds: ["test", "assignment", "task", "challenge"] },
  { id: "reminder", label: "Reminders", kinds: ["reminder"] },
  { id: "marks", label: "Marks", kinds: ["marks"] },
  { id: "announcement", label: "Announcements", kinds: ["announcement"] },
  { id: "resource", label: "Resources", kinds: ["resource"] },
  { id: "rank", label: "Ranking", kinds: ["rank"] },
  { id: "attendance", label: "Attendance", kinds: ["attendance"] },
  { id: "mail", label: "Mail", kinds: ["mail"] },
];

function rel(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function AlertsSetup() {
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<"unknown" | "unsupported" | "unavailable" | "off" | "on" | "busy">("unknown");
  const [cal, setCal] = useState<{ subscribeUrl: string; googleSubscribeUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) { setPushState("unsupported"); return; }
        const r = await fetch("/api/portal/push");
        const j = await r.json();
        if (!j.enabled || !j.publicKey) { setPushState("unavailable"); return; }
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setPushState(sub ? "on" : "off");
      } catch { setPushState("unavailable"); }
    })();
    fetch("/api/portal/calendar").then((r) => r.json()).then((j) => setCal({ subscribeUrl: j.subscribeUrl, googleSubscribeUrl: j.googleSubscribeUrl })).catch(() => {});
  }, []);

  async function enablePush() {
    try {
      setPushState("busy");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState("off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/portal/push")).json();
      // Drop any stale/rotated subscription first so a key change can't throw.
      const old = await reg.pushManager.getSubscription();
      if (old) { try { await old.unsubscribe(); } catch { /* ignore */ } }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch("/api/portal/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "subscribe", subscription: sub.toJSON() }) });
      setPushState("on");
    } catch { setPushState("off"); }
  }
  async function disablePush() {
    try {
      setPushState("busy");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) { await fetch("/api/portal/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "unsubscribe", endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setPushState("off");
    } catch { setPushState("on"); }
  }
  function copyFeed() { if (cal?.subscribeUrl) { navigator.clipboard?.writeText(cal.subscribeUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); } }

  return (
    <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.04]">
      <button onClick={() => setOpen((s) => !s)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-ice"><BellRing size={16} className="text-cyan" /> Alerts &amp; calendar sync</span>
        <ChevronDown size={16} className={"text-dust transition " + (open ? "rotate-180" : "")} />
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-space/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ice"><Smartphone size={15} className="text-cyan" /> Push notifications</p>
            <p className="mt-1 text-xs text-dust">Get alerts on this device for tests, assignments, reminders and class timings — even when the app is closed. Install the portal to your home screen first for the best results.</p>
            <div className="mt-3">
              {pushState === "on" ? <button onClick={disablePush} className="rounded-lg border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyan">Alerts on · turn off</button>
                : pushState === "off" || pushState === "busy" ? <button disabled={pushState === "busy"} onClick={enablePush} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan disabled:opacity-60">{pushState === "busy" ? "Working…" : "Enable push on this device"}</button>
                : pushState === "unsupported" ? <p className="text-xs text-dust/80">This browser doesn’t support push. On iPhone, add the app to your Home Screen first.</p>
                : pushState === "unavailable" ? <p className="text-xs text-dust/80">In-app alerts are active. Device push isn’t enabled on the server yet.</p>
                : <p className="text-xs text-dust/80">Checking…</p>}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-space/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ice"><CalendarPlus size={15} className="text-emerald2" /> Google Calendar sync</p>
            <p className="mt-1 text-xs text-dust">Subscribe once and your tests, due dates, class timings and extra classes stay in your calendar with reminders.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {cal?.googleSubscribeUrl ? <a href={cal.googleSubscribeUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald2/40 bg-emerald2/10 px-3 py-1.5 text-xs font-semibold text-emerald2">Add to Google Calendar</a> : null}
              <button onClick={copyFeed} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan">{copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy feed URL</>}</button>
            </div>
            <p className="mt-2 text-[10px] text-dust/70">Apple Calendar / Outlook: use the copied URL as a subscribed calendar.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationsClient() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/notifications?limit=100&sync=1");
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.items || []); setUnread(j.unread || 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    let list = items;
    if (f?.kinds) list = list.filter((n) => f.kinds!.includes(n.kind));
    if (unreadOnly) list = list.filter((n) => !n.read_at);
    return list;
  }, [items, filter, unreadOnly]);

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
    if (n.link) router.push(n.link);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ice">
            <BellRing size={22} className="text-cyan" /> Notifications
          </h1>
          <p className="mt-1 text-sm text-fog">
            Everything that matters — tests, assignments, marks, announcements and reminders.
            {unread > 0 ? <span className="ml-2 rounded-full bg-cyan/15 px-2 py-0.5 text-xs font-semibold text-cyan">{unread} unread</span> : null}
          </p>
        </div>
        {unread > 0 ? (
          <button onClick={markAll} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-xs text-fog transition hover:border-cyan/40 hover:text-cyan">
            <CheckCheck size={14} /> Mark all read
          </button>
        ) : null}
      </div>

      <AlertsSetup />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={"rounded-full border px-3 py-1.5 text-xs transition " +
              (filter === f.id ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-white/10 bg-space/60 text-fog hover:border-cyan/30 hover:text-ice")}>
            {f.label}
          </button>
        ))}
        <button onClick={() => setUnreadOnly((s) => !s)}
          className={"ml-auto rounded-full border px-3 py-1.5 text-xs transition " +
            (unreadOnly ? "border-amber-300/50 bg-amber-300/10 text-amber-300" : "border-white/10 bg-space/60 text-fog hover:border-amber-300/30")}>
          Unread only
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-space/60">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-dust">Loading…</p>
        ) : shown.length ? (
          <ul>
            {shown.map((n) => (
              <li key={n.id}>
                <button onClick={() => openNotif(n)}
                  className={"flex w-full items-start gap-3 border-b border-white/5 px-5 py-4 text-left transition hover:bg-white/[0.03] " + (n.read_at ? "" : "bg-cyan/[0.04]")}>
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10">
                    {KIND_ICON[n.kind] || <Bell size={15} className="text-dust" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={"text-sm " + (n.read_at ? "text-fog" : "font-semibold text-ice")}>{n.title}</span>
                      {!n.read_at ? <span className="h-2 w-2 shrink-0 rounded-full bg-cyan" /> : null}
                    </span>
                    {n.body ? <span className="mt-0.5 block text-xs leading-relaxed text-dust">{n.body}</span> : null}
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-dust/70">{n.kind} · {rel(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-dust">
            {unreadOnly || filter !== "all" ? "Nothing matches this filter." : "No notifications yet — they'll appear here as things happen."}
          </p>
        )}
      </div>
    </div>
  );
}
