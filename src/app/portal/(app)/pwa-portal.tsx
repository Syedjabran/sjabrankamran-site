"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, X, Share, Bell } from "lucide-react";

/**
 * Portal PWA layer (client). Three jobs, all self-contained:
 *  1. Register the service worker so the portal is installable + can receive push.
 *  2. Show an install prompt/card (Android/desktop native prompt; iOS instructions)
 *     the first time a signed-in user opens the portal in a browser tab, and nudge
 *     them to enable alerts.
 *  3. Real-time alerts: while the portal is open, poll the notification feed and
 *     raise an OS/tab notification for anything new (announcements, scheduled
 *     class/test reminders, daily tasks and challenges) even before push is fully
 *     provisioned. Push (below) covers the closed-app case.
 */

const DISMISS_KEY = "sjak_pwa_install_dismissed_at";
const SEEN_KEY = "sjak_alert_seen_ids";
const POLL_MS = 60_000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaPortal() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  // 1) Register the service worker once.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => { swRef.current = reg; }).catch(() => {});
  }, []);

  // 2) Install prompt wiring.
  useEffect(() => {
    if (isStandalone()) return;
    const recentlyDismissed = (() => {
      try {
        const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
        return at && Date.now() - at < 7 * 24 * 3600_000; // re-ask after a week
      } catch { return false; }
    })();
    if (recentlyDismissed) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShowCard(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    // iOS never fires beforeinstallprompt — show the manual card there.
    if (isIos()) { setShowCard(true); setIosHelp(true); }
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = useCallback(() => {
    setShowCard(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  async function enableAlerts() {
    try {
      if (typeof Notification === "undefined") return;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const reg = swRef.current || (await navigator.serviceWorker.ready);
      const info = await fetch("/api/portal/push").then((r) => r.json()).catch(() => null);
      if (info?.enabled && info.publicKey && reg?.pushManager) {
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(info.publicKey),
        });
        await fetch("/api/portal/push", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "subscribe", subscription: sub.toJSON() }),
        }).catch(() => {});
      }
    } catch { /* best effort */ }
  }

  async function install() {
    if (isIos()) { setIosHelp(true); return; }
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") { await enableAlerts(); setShowCard(false); }
    setDeferred(null);
  }

  // 3) Real-time in-app/OS alerts for anything new while the portal is open.
  useEffect(() => {
    let stopped = false;
    let seen: Set<string>;
    try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { seen = new Set(); }
    let primed = false; // don't alert for the backlog on first load

    const persist = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300))); } catch { /* ignore */ } };

    async function poll() {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/portal/notifications?limit=15&sync=1", { headers: { "content-type": "application/json" } });
        if (!r.ok) return;
        const j = await r.json();
        const items: { id: string; title: string; body: string | null; link: string | null; read_at: string | null }[] = j.items || [];
        const fresh = items.filter((n) => !seen.has(n.id));
        for (const n of items) seen.add(n.id);
        persist();
        if (!primed) { primed = true; return; }
        // Raise an OS notification for genuinely new, unread items.
        for (const n of fresh.filter((x) => !x.read_at).slice(0, 4)) {
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && swRef.current) {
            swRef.current.showNotification(n.title, {
              body: n.body || undefined,
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
              tag: n.id,
              data: { url: n.link || "/portal/notifications" },
            }).catch(() => {});
          }
        }
        if (fresh.length) window.dispatchEvent(new CustomEvent("sjak:alerts", { detail: { count: fresh.length } }));
      } catch { /* ignore */ }
    }

    poll();
    const id = setInterval(() => { if (!stopped) poll(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!showCard) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-cyan/30 bg-abyss/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan/30 text-cyan"><Download size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ice">Install the Physics Portal app</p>
          <p className="mt-1 text-xs leading-relaxed text-fog">
            Add it to your home screen for instant, real-time alerts about announcements, scheduled classes, tests, daily tasks and challenges — even when the app is closed.
          </p>
          {iosHelp ? (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-space/60 px-2.5 py-2 text-[11px] text-dust">
              <Share size={13} className="text-cyan" /> On iPhone/iPad: tap <b className="text-ice">Share</b> → <b className="text-ice">Add to Home Screen</b>.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {!iosHelp ? (
              <button onClick={install} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/50 bg-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyan hover:bg-cyan/20">
                <Download size={13} /> Install app
              </button>
            ) : null}
            <button onClick={enableAlerts} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan">
              <Bell size={13} /> Enable alerts
            </button>
            <button onClick={dismiss} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-dust hover:text-ice">
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-dust hover:text-ice"><X size={16} /></button>
      </div>
    </div>
  );
}
