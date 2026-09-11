"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";

type Access = {
  loginUrl: string;
  email: string;
  password: string;
  name: string;
  className: string;
};

export function DemoAccessClient() {
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    setAccess(null);
    try {
      const response = await fetch("/api/portal/admin/demo-student-access", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setAccess(body as Access);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ice">
          <KeyRound size={22} className="text-amber-300" /> Private demo-student access
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fog">
          Generate a fresh password for the private Portal QA Student. The password is shown only on this authenticated Super Admin page and is replaced every time you generate another.
        </p>
        <button onClick={generate} disabled={busy} className="btn-primary mt-4">
          {busy ? <Loader2 size={15} className="animate-spin" /> : access ? <RefreshCw size={15} /> : <KeyRound size={15} />}
          {busy ? "Generating…" : access ? "Generate another password" : "Generate private login"}
        </button>
        {error ? <p className="mt-3 text-sm text-signal">{error}</p> : null}
      </div>

      {access ? (
        <div className="rounded-2xl border border-cyan/25 bg-space/70 p-5">
          <div className="mb-4">
            <p className="font-semibold text-ice">{access.name}</p>
            <p className="text-xs text-dust">{access.className}</p>
          </div>
          <dl className="space-y-3">
            {[
              ["Login", access.loginUrl],
              ["Email", access.email],
              ["Password", access.password],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-abyss/60 p-3">
                <dt className="font-mono text-[10px] uppercase tracking-widest text-dust">{label}</dt>
                <dd className="mt-1 flex items-center gap-3">
                  <span className="min-w-0 flex-1 break-all font-mono text-sm text-ice">{value}</span>
                  <button onClick={() => copy(label, value)} className="btn-ghost !px-2.5 !py-2" aria-label={`Copy ${label}`}>
                    <Copy size={14} /> {copied === label ? "Copied" : "Copy"}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-amber-300">Keep this login private. Opening this page does not affect the demo account; only generating a new password does.</p>
        </div>
      ) : null}
    </div>
  );
}
