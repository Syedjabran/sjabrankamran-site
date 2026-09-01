"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UserCog, Search, UserPlus, ShieldAlert, KeyRound, Ban, RotateCcw, Copy, X } from "lucide-react";

export const ROLES: [string, string][] = [
  ["super_admin", "Super Admin"], ["admin", "Admin"], ["teacher", "Teacher"],
  ["teaching_assistant", "Teaching Assistant"], ["student", "Student"], ["parent", "Parent / Guardian"],
  ["counsellor", "Counsellor"], ["content_manager", "Content Manager"], ["finance_manager", "Finance Manager"],
  ["coordinator", "Coordinator"], ["facilitator", "Facilitator"],
];
const LABEL = Object.fromEntries(ROLES);

type U = { id: string; full_name: string; email: string; status: string; roles: string[]; created_at: string };
type Counts = { total: number; students: number; staff: number; suspended: number; noRole: number };
type ClassItem = { id: string; name: string; school: string; section: string | null; students: number };

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function UsersConsole() {
  const [users, setUsers] = useState<U[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const j = await api(`/api/portal/admin/users?q=${encodeURIComponent(q)}${roleFilter ? `&role=${roleFilter}` : ""}`);
      setUsers(j.users); setCounts(j.counts);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [q, roleFilter]);

  // Seed filters from the URL (dashboard quick-search deep-links here).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q0 = sp.get("q"); const r0 = sp.get("role");
    if (q0) setQ(q0);
    if (r0) setRoleFilter(r0);
  }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api("/api/portal/admin/classes").then((j) => setClasses(j.classes)).catch(() => {}); }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); };

  async function quick(id: string, op: string, extra: Record<string, unknown> = {}) {
    setBusy(id + op);
    try {
      const j = await api(`/api/portal/admin/users/${id}/action`, { method: "POST", body: JSON.stringify({ op, ...extra }) });
      if (op === "password" && j.password) flash(`New password: ${j.password}`);
      else flash("Done.");
      await load();
    } catch (e) { flash((e as Error).message); } finally { setBusy(""); }
  }

  const filtered = useMemo(() => users, [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><UserCog size={18} /></span>
          <div>
            <h1 className="text-2xl font-semibold text-ice">Users &amp; activity</h1>
            <p className="text-xs text-dust">Open any person for visual charts, rankings, time analytics, full activity and access controls.</p>
          </div>
        </div>
        <button onClick={() => setShowCreate((s) => !s)} className="btn-ghost !px-3.5 !py-2 text-xs">
          <UserPlus size={14} /> New user
        </button>
      </div>

      {counts ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([["Total", counts.total], ["Students", counts.students], ["Staff", counts.staff], ["Suspended", counts.suspended], ["No role", counts.noRole]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/10 bg-space/60 px-3 py-2">
              <p className="text-lg font-semibold text-ice">{v}</p>
              <p className="text-[10px] uppercase tracking-widest text-dust">{k}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showCreate ? <CreateUser classes={classes} onClose={() => setShowCreate(false)} onCreated={(msg) => { flash(msg); load(); }} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-abyss/60 px-3">
          <Search size={14} className="text-dust" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…"
            className="w-full bg-transparent py-2 text-sm text-ice placeholder:text-dust focus:outline-none" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-abyss/60 px-2 py-2 text-xs text-ice focus:border-cyan focus:outline-none">
          <option value="">All roles</option>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {err ? <p className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-fog">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-dust">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((u) => (
            <li key={u.id} className="rounded-2xl border border-white/10 bg-space/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/portal/admin/users/${u.id}`} className="text-sm font-semibold text-ice hover:text-cyan">
                    {u.full_name || "(no name)"}
                  </Link>
                  <p className="truncate text-xs text-dust">{u.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {u.roles.length ? u.roles.map((r) => (
                      <span key={r} className="rounded-full border border-cyan/25 px-2 py-0.5 text-[10px] text-cyan">{LABEL[r] || r}</span>
                    )) : <span className="text-[10px] text-dust">no role</span>}
                    {u.status === "archived" ? <span className="rounded-full border border-signal/40 px-2 py-0.5 text-[10px] text-signal">SUSPENDED</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button disabled={!!busy} onClick={() => quick(u.id, "password")} title="Reset password"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-fog hover:border-cyan/40 hover:text-cyan"><KeyRound size={14} /></button>
                  {u.status === "archived" ? (
                    <button disabled={!!busy} onClick={() => quick(u.id, "reactivate")} title="Reactivate"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-fog hover:border-emerald2/50 hover:text-emerald2"><RotateCcw size={14} /></button>
                  ) : (
                    <button disabled={!!busy} onClick={() => quick(u.id, "suspend")} title="Suspend access"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-fog hover:border-signal/50 hover:text-signal"><Ban size={14} /></button>
                  )}
                  <Link href={`/portal/admin/users/${u.id}`} className="rounded-lg border border-cyan/25 px-2.5 py-1.5 text-[11px] text-cyan hover:border-cyan/60 hover:bg-cyan/[0.06]">Charts &amp; manage →</Link>
                </div>
              </div>
            </li>
          ))}
          {!filtered.length ? <p className="rounded-xl border border-white/10 bg-space/60 p-6 text-sm text-fog">No users match.</p> : null}
        </ul>
      )}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-cyan/30 bg-abyss/95 px-4 py-3 text-sm text-ice shadow-lg">
          <ShieldAlert size={15} className="text-cyan" />
          <span className="font-mono text-xs">{toast}</span>
          {toast.includes("password") ? (
            <button onClick={() => navigator.clipboard?.writeText(toast.split(": ")[1] || "")} className="text-dust hover:text-cyan"><Copy size={14} /></button>
          ) : null}
          <button onClick={() => setToast("")} className="text-dust hover:text-ice"><X size={14} /></button>
        </div>
      ) : null}
    </div>
  );
}

function CreateUser({ classes, onClose, onCreated }: { classes: ClassItem[]; onClose: () => void; onCreated: (msg: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>(["student"]);
  const [classId, setClassId] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pw, setPw] = useState("");

  const toggle = (r: string) => setRoles((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

  async function submit() {
    setBusy(true); setMsg(""); setPw("");
    try {
      const j = await api("/api/portal/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, full_name: name, roles, class_id: roles.includes("student") && classId ? classId : undefined, send_email: sendEmail }),
      });
      setPw(j.password);
      onCreated(`Created ${email}${j.emailStatus ? ` · email ${j.emailStatus}` : ""}`);
      setEmail(""); setName("");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-cyan/20 bg-space/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ice">Create a new account</h2>
        <button onClick={onClose} className="text-dust hover:text-ice"><X size={16} /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
          className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
          className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ROLES.map(([v, l]) => (
          <button key={v} onClick={() => toggle(v)} type="button"
            className={"rounded-full border px-2.5 py-1 text-[11px] " + (roles.includes(v) ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>{l}</button>
        ))}
      </div>
      {roles.includes("student") ? (
        <select value={classId} onChange={(e) => setClassId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-abyss/60 px-2 py-2 text-xs text-ice focus:border-cyan focus:outline-none">
          <option value="">Enrol in class (optional)…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.school} — {c.name}{c.section ? ` (${c.section})` : ""}</option>)}
        </select>
      ) : null}
      <label className="flex items-center gap-2 text-xs text-fog">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email login details to the user
      </label>
      {msg ? <p className="text-xs text-signal">{msg}</p> : null}
      {pw ? <p className="rounded-lg border border-emerald2/30 bg-emerald2/5 px-3 py-2 font-mono text-xs text-emerald2">Password: {pw}</p> : null}
      <button onClick={submit} disabled={busy} className="btn-ghost !px-4 !py-2 text-xs">{busy ? "Creating…" : "Create account"}</button>
    </div>
  );
}
