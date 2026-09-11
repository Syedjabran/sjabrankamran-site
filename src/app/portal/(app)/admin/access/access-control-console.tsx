"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Building2, Clock3, GraduationCap, LockKeyhole, RotateCcw, ShieldAlert, UserRound, UsersRound } from "lucide-react";
import type { AccessRestriction, AccessRestrictionMode, AccessScopeType } from "@/lib/portal/access-shared";

type Option = { key: string; label: string; classIds?: string[] };
type UserOption = { id: string; label: string; email: string; roles: string[] };
type Payload = {
  restrictions: AccessRestriction[];
  options: { users: UserOption[]; schools: Option[]; classes: Option[]; groups: Option[] };
  now: string;
};

const SCOPE_META: Record<AccessScopeType, { label: string; icon: typeof UserRound; help: string }> = {
  user: { label: "User", icon: UserRound, help: "One portal account" },
  school: { label: "School", icon: Building2, help: "Every user attached to the school" },
  class: { label: "Class", icon: GraduationCap, help: "A year/level and all its groups" },
  group: { label: "Group", icon: UsersRound, help: "One exact roster group or section" },
};

const DEFAULT_MESSAGE = "Your portal access has been temporarily paused by the school administration. Please contact your teacher or school coordinator for assistance.";

async function api(opts?: RequestInit) {
  const response = await fetch("/api/portal/admin/access", {
    ...opts,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(opts?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function localDateTime(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

function isActive(r: AccessRestriction) {
  const now = Date.now();
  return !r.releasedAt && Date.parse(r.startsAt) <= now && (!r.endsAt || Date.parse(r.endsAt) > now);
}

export function AccessControlConsole() {
  const [data, setData] = useState<Payload | null>(null);
  const [scopeType, setScopeType] = useState<AccessScopeType>("user");
  const [scopeKey, setScopeKey] = useState("");
  const [mode, setMode] = useState<AccessRestrictionMode>("locked");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [endsAt, setEndsAt] = useState(() => localDateTime(Date.now() + 24 * 60 * 60_000));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setData(await api()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("scope");
    const key = params.get("key");
    if (t && ["user", "school", "class", "group"].includes(t)) setScopeType(t as AccessScopeType);
    if (key) setScopeKey(key);
  }, []);

  const options = useMemo(() => {
    if (!data) return [];
    if (scopeType === "user") return data.options.users.map((u) => ({ key: u.id, label: `${u.label}${u.email ? ` — ${u.email}` : ""}` }));
    const optionKey: Record<Exclude<AccessScopeType, "user">, "schools" | "classes" | "groups"> = {
      school: "schools", class: "classes", group: "groups",
    };
    return data.options[optionKey[scopeType]];
  }, [data, scopeType]);

  useEffect(() => {
    if (scopeKey && !options.some((o) => o.key === scopeKey)) setScopeKey("");
  }, [options, scopeKey]);

  async function create() {
    setError(""); setNotice("");
    if (!scopeKey) { setError("Choose a target first."); return; }
    if (message.trim().length < 10) { setError("Write a clear custom message for the affected users."); return; }
    setBusy("create");
    try {
      await api({
        method: "POST",
        body: JSON.stringify({
          scopeType,
          scopeKey,
          mode,
          message,
          endsAt: mode === "suspended" ? new Date(endsAt).toISOString() : null,
        }),
      });
      setNotice(`${mode === "locked" ? "Lock" : "Suspension"} activated. Affected users will see your message.`);
      setScopeKey("");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }

  async function release(id: string, label: string) {
    if (!window.confirm(`Release the access restriction for ${label}?`)) return;
    setBusy(id); setError(""); setNotice("");
    try {
      await api({ method: "PATCH", body: JSON.stringify({ id, action: "release" }) });
      setNotice("Access restriction released.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }

  const active = data?.restrictions.filter(isActive) || [];
  const history = data?.restrictions.filter((r) => !isActive(r)) || [];

  return (
    <div className="space-y-7">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-signal/30 bg-signal/[0.06] text-signal"><LockKeyhole size={19} /></span>
        <div>
          <h1 className="font-display text-2xl text-ice">Portal access locks</h1>
          <p className="text-sm text-dust">Lock or temporarily suspend a user, school, class or exact group.</p>
        </div>
      </header>

      <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] px-4 py-3 text-xs leading-5 text-fog">
        <p className="flex items-start gap-2"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-cyan" /> Affected users can still sign in, but cannot open pages, call portal APIs, submit work or perform activities. Super admins always retain recovery access.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-space/60 p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-ice">Create an access restriction</h2>

        <div className="grid gap-2 sm:grid-cols-4">
          {(Object.keys(SCOPE_META) as AccessScopeType[]).map((type) => {
            const meta = SCOPE_META[type]; const Icon = meta.icon;
            return (
              <button key={type} type="button" onClick={() => { setScopeType(type); setScopeKey(""); }}
                className={`rounded-xl border p-3 text-left transition ${scopeType === type ? "border-cyan/60 bg-cyan/[0.08] text-cyan" : "border-white/10 text-fog hover:border-white/25"}`}>
                <span className="flex items-center gap-2 text-xs font-semibold"><Icon size={14} /> {meta.label}</span>
                <span className="mt-1 block text-[10px] text-dust">{meta.help}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-fog">Target {SCOPE_META[scopeType].label.toLowerCase()}</span>
            <select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-abyss/70 px-3 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none">
              <option value="">Choose…</option>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-xs text-fog">Restriction type</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("locked")}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs ${mode === "locked" ? "border-signal/55 bg-signal/[0.07] text-signal" : "border-white/10 text-fog"}`}>
                <span className="flex items-center gap-1.5 font-semibold"><Ban size={13} /> Lock</span>
                <span className="mt-0.5 block text-[10px] text-dust">Until manually released</span>
              </button>
              <button type="button" onClick={() => setMode("suspended")}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs ${mode === "suspended" ? "border-amber-300/45 bg-amber-300/[0.06] text-amber-200" : "border-white/10 text-fog"}`}>
                <span className="flex items-center gap-1.5 font-semibold"><Clock3 size={13} /> Suspend</span>
                <span className="mt-0.5 block text-[10px] text-dust">Auto-restores at end time</span>
              </button>
            </div>
          </fieldset>
        </div>

        {mode === "suspended" ? (
          <label className="mt-4 block max-w-md">
            <span className="mb-1.5 block text-xs text-fog">Restore access automatically at</span>
            <input type="datetime-local" value={endsAt} min={localDateTime(Date.now() + 2 * 60_000)} onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-abyss/70 px-3 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none" />
          </label>
        ) : null}

        <label className="mt-4 block">
          <span className="mb-1.5 flex items-center justify-between gap-2 text-xs text-fog"><span>Custom message shown to affected users</span><span className="text-dust">{message.length}/1,200</span></span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1200))} rows={4}
            className="w-full resize-y rounded-xl border border-white/10 bg-abyss/70 px-3 py-2.5 text-sm leading-6 text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
        </label>

        {error ? <p className="mt-3 rounded-xl border border-signal/25 bg-signal/[0.05] px-3 py-2 text-xs text-signal">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-xl border border-emerald2/25 bg-emerald2/[0.05] px-3 py-2 text-xs text-emerald2">{notice}</p> : null}
        <button type="button" onClick={create} disabled={!!busy || !data}
          className="btn-primary mt-4 !px-5 !py-2.5 text-sm disabled:opacity-50">
          <LockKeyhole size={15} /> {busy === "create" ? "Applying…" : mode === "locked" ? "Activate lock" : "Start suspension"}
        </button>
      </section>

      <RestrictionList title={`Active restrictions (${active.length})`} rows={active} busy={busy} onRelease={release} />
      {history.length ? <RestrictionList title="Restriction history" rows={history.slice(0, 50)} busy={busy} onRelease={release} history /> : null}
    </div>
  );
}

function RestrictionList({ title, rows, busy, onRelease, history = false }: {
  title: string; rows: AccessRestriction[]; busy: string;
  onRelease: (id: string, label: string) => void; history?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-dust">{title}</h2>
      {!rows.length ? <p className="rounded-2xl border border-white/10 bg-space/40 p-5 text-sm text-dust">No active access restrictions.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const meta = SCOPE_META[r.scopeType]; const Icon = meta.icon;
            return (
              <li key={r.id} className="rounded-2xl border border-white/10 bg-space/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ice"><Icon size={14} className="text-cyan" /> {r.scopeLabel}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${r.mode === "locked" ? "border-signal/35 text-signal" : "border-amber-300/30 text-amber-200"}`}>{r.mode}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-dust">{meta.label}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-fog">{r.message}</p>
                    <p className="mt-2 text-[10px] text-dust">Created {new Date(r.createdAt).toLocaleString()}{r.endsAt ? ` · ends ${new Date(r.endsAt).toLocaleString()}` : ""}{r.releasedAt ? ` · released ${new Date(r.releasedAt).toLocaleString()}` : ""}</p>
                  </div>
                  {!history ? (
                    <button type="button" onClick={() => onRelease(r.id, r.scopeLabel)} disabled={!!busy}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald2/30 px-3 py-1.5 text-xs text-emerald2 hover:bg-emerald2/[0.07] disabled:opacity-50">
                      <RotateCcw size={13} /> {busy === r.id ? "Releasing…" : "Restore access"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
