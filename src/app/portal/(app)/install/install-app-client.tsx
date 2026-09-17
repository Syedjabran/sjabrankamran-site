"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Download, Monitor, Share, Smartphone } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __sjakInstallPrompt?: InstallPrompt;
  }
}

function standalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function ios() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallAppClient() {
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refresh = () => {
      setInstalled(standalone());
      setPrompt(window.__sjakInstallPrompt || null);
      setIsIos(ios());
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.__sjakInstallPrompt = event as InstallPrompt;
      refresh();
    };
    refresh();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("sjak:install-ready", refresh);
    window.addEventListener("sjak:installed", refresh);
    window.addEventListener("appinstalled", refresh);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("sjak:install-ready", refresh);
      window.removeEventListener("sjak:installed", refresh);
      window.removeEventListener("appinstalled", refresh);
    };
  }, []);

  async function install() {
    const available = prompt || window.__sjakInstallPrompt;
    if (!available) {
      setMessage("Open your browser menu and choose Install app or Add to Home screen.");
      return;
    }
    await available.prompt();
    const result = await available.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    window.__sjakInstallPrompt = undefined;
    setPrompt(null);
    if (result.outcome === "accepted") {
      setInstalled(true);
      setMessage("Portal app installed successfully.");
      window.dispatchEvent(new Event("sjak:installed"));
    } else {
      setMessage("Installation was cancelled. You can try again from your browser menu.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan/25 bg-cyan/[0.04] p-6">
        {installed ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald2" size={22} />
            <div>
              <h2 className="font-display text-lg text-ice">Portal app installed</h2>
              <p className="mt-1 text-sm text-fog">Open it from your home screen, app drawer, Dock, or Start menu.</p>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="font-display text-lg text-ice">Install the Physics Portal</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fog">
              Installation gives you a full-screen portal, a home-screen icon, faster access, and device notifications for classes, tests, assignments, marks, and announcements.
            </p>
            {isIos ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-space/60 p-4 text-sm text-fog">
                <p className="flex items-center gap-2 font-semibold text-ice"><Share size={16} className="text-cyan" /> iPhone or iPad</p>
                <p className="mt-2">In Safari, tap <b className="text-ice">Share</b>, scroll down, choose <b className="text-ice">Add to Home Screen</b>, then tap <b className="text-ice">Add</b>.</p>
              </div>
            ) : (
              <button onClick={install} className="btn-primary mt-4 !px-5">
                <Download size={16} /> Install Portal App
              </button>
            )}
            {message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="flex items-center gap-2 font-semibold text-ice"><Smartphone size={17} className="text-cyan" /> Android phone or tablet</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-fog">
            <li>Open this page in Chrome.</li>
            <li>Tap <b className="text-ice">Install Portal App</b> above.</li>
            <li>If no prompt appears, use Chrome’s menu → <b className="text-ice">Install app</b>.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="flex items-center gap-2 font-semibold text-ice"><Monitor size={17} className="text-cyan" /> Windows, Mac, or Chromebook</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-fog">
            <li>Open the portal in Chrome or Edge.</li>
            <li>Click the install icon in the address bar, or use the browser menu.</li>
            <li>Choose <b className="text-ice">Install</b>.</li>
          </ol>
        </section>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald2/20 bg-emerald2/[0.03] p-5">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ice"><Bell size={16} className="text-emerald2" /> Turn on device alerts</p>
          <p className="mt-1 text-sm text-fog">After installing, enable push notifications so important portal updates reach you when the app is closed.</p>
        </div>
        <Link href="/portal/notifications" className="btn-ghost !px-4 !py-2 text-xs">Notification settings</Link>
      </section>
    </div>
  );
}
