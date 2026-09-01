"use client";

import { useEffect, useState } from "react";
import { UserCircle, Save, KeyRound, Loader2, Check, Mail, Phone, VenetianMask, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type Me = { id: string; full_name: string; email: string; phone: string; roles: string[]; alias?: string; reveal_name?: boolean };

export function SettingsClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [revealName, setRevealName] = useState(false);
  const [savingReveal, setSavingReveal] = useState(false);
  const [revealMsg, setRevealMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    fetch("/api/portal/me").then(async (r) => {
      const j = await r.json();
      if (r.ok) { setMe(j); setFullName(j.full_name || ""); setPhone(j.phone || ""); setRevealName(!!j.reveal_name); }
    }).catch(() => {});
  }, []);

  async function toggleReveal(next: boolean) {
    const prev = revealName;
    setRevealName(next); setSavingReveal(true); setRevealMsg("");
    try {
      const r = await fetch("/api/portal/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reveal_name: next }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      setRevealMsg(next ? "Saved. Your real name now shows on the leaderboard." : "Saved. You're back to your private code on the leaderboard.");
    } catch (e) { setRevealName(prev); setRevealMsg((e as Error).message); } finally { setSavingReveal(false); }
  }

  async function copyCode() {
    if (!me?.alias) return;
    try { await navigator.clipboard.writeText(me.alias); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  async function saveProfile() {
    setSavingProfile(true); setProfileMsg("");
    try {
      const r = await fetch("/api/portal/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ full_name: fullName, phone }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      setProfileMsg("Saved. Your name now shows across the portal.");
    } catch (e) { setProfileMsg((e as Error).message); } finally { setSavingProfile(false); }
  }

  async function changePassword() {
    setPwMsg("");
    if (pw1.length < 8) { setPwMsg("Password must be at least 8 characters."); return; }
    if (pw1 !== pw2) { setPwMsg("The two passwords don't match."); return; }
    setSavingPw(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: pw1 });
      if (error) throw new Error(error.message);
      setPw1(""); setPw2("");
      setPwMsg("Password updated. Use it next time you sign in.");
    } catch (e) { setPwMsg((e as Error).message); } finally { setSavingPw(false); }
  }

  const input = "w-full rounded-xl border border-white/10 bg-abyss/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><UserCircle size={18} /></span>
        <div>
          <h1 className="text-2xl font-semibold text-ice">My profile &amp; settings</h1>
          <p className="text-xs text-dust">Update your details and password. This is your account.</p>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="text-sm font-semibold text-ice">Profile</h2>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} placeholder="Your name" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust"><Mail size={11} className="inline" /> Email</label>
            <input value={me?.email || ""} disabled className={input + " opacity-60"} />
            <p className="mt-1 text-[10px] text-dust">Email is your login. Ask your teacher to change it.</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust"><Phone size={11} className="inline" /> Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="Optional" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveProfile} disabled={savingProfile} className="btn-primary !px-4 !py-2 text-sm">{savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save profile</button>
          {profileMsg ? <span className="inline-flex items-center gap-1 text-xs text-cyan"><Check size={12} /> {profileMsg}</span> : null}
        </div>
      </section>

      {me?.roles?.includes("student") ? (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><VenetianMask size={15} className="text-cyan" /> Leaderboard identity</h2>
          <p className="text-xs text-dust">On the leaderboard, everyone competes under a private code — not their real name — so your identity stays hidden unless you choose otherwise. This is your code:</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-xl border border-cyan/25 bg-abyss/60 px-3.5 py-2.5 font-mono text-base tracking-wide text-cyan">{me?.alias || "—"}</span>
            <button onClick={copyCode} className="btn-ghost !px-3 !py-2.5 text-xs" title="Copy your code">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-abyss/40 px-3.5 py-3">
            <input type="checkbox" checked={revealName} disabled={savingReveal} onChange={(e) => toggleReveal(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-cyan" />
            <span className="text-sm text-fog">
              Show my <b>real name</b> on the leaderboard instead of my code.
              <span className="mt-0.5 block text-[11px] text-dust">Leave this off to stay anonymous. You can switch back any time.</span>
            </span>
          </label>
          {savingReveal ? <span className="inline-flex items-center gap-1 text-xs text-dust"><Loader2 size={12} className="animate-spin" /> Saving…</span>
            : revealMsg ? <span className="inline-flex items-center gap-1 text-xs text-cyan"><Check size={12} /> {revealMsg}</span> : null}
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><KeyRound size={15} className="text-cyan" /> Change password</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} className={input} placeholder="New password" />
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} placeholder="Confirm new password" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={changePassword} disabled={savingPw} className="btn-ghost !px-4 !py-2 text-sm">{savingPw ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Update password</button>
          {pwMsg ? <span className="text-xs text-cyan">{pwMsg}</span> : null}
        </div>
      </section>
    </div>
  );
}
