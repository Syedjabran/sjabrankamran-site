"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Ban, RotateCcw, Trash2, Mail, GraduationCap, Activity, ShieldCheck, BookOpen, ClipboardList } from "lucide-react";
import { ROLES } from "../users-console";
import { ActivityTimeline } from "./activity-timeline";
import { StudentVisualReport, type StudentVisualData } from "./student-visual-report";
import { IndividualTasks } from "./individual-tasks";

const LABEL = Object.fromEntries(ROLES);

type Detail = {
  profile: { id: string; full_name: string; email: string; phone: string; status: string; created_at: string; roles: string[] };
  access: {
    banned: boolean; bannedUntil: string | null; lastSignIn: string | null; emailConfirmed: boolean;
    portalRestriction: { id: string; scopeType: "user" | "school" | "class" | "group"; scopeLabel: string; mode: "locked" | "suspended"; message: string; endsAt: string | null } | null;
  };
  staffSchool?: string | null;
  schools?: string[];
  student: { id: string; student_no: string | null; school: string | null; admission_status: string; date_of_birth: string | null } | null;
  enrolments: { id: string; classId: string; status: string; className: string; school: string; section: string | null }[];
  onboarding: { completed: boolean; whatsapp: string | null; city: string | null; dob: string | null; guardians: { name: string; email: string; phone: string; relationship: string }[] } | null;
  progress: (StudentVisualData & { strengths: { topic: string; accuracy: number }[]; weaknesses: { topic: string; accuracy: number }[]; recentAttempts: { ts: number; mode: string; score: number; total: number; qCount: number }[] }) | null;
  attendance: { total: number; present: number; late: number; absent: number; pct: number } | null;
  results: { title: string; kind: string; score: number | null; total: number | null; grade: string | null; date: string | null }[];
  submissions: { title: string; status: string; marks: number | null; submittedAt: string | null }[];
};
type ClassItem = { id: string; name: string; school: string; section: string | null };

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const Card = ({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) => (
  <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust">{icon}{title}</h2>
    {children}
  </section>
);

export function UserDetail({ id, isSuper, selfId }: { id: string; isSuper: boolean; selfId: string }) {
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [enrolClass, setEnrolClass] = useState("");
  const [edit, setEdit] = useState<{ full_name: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try { setD(await api(`/api/portal/admin/users/${id}`)); }
    catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/api/portal/admin/classes").then((j) => setClasses(j.classes)).catch(() => {}); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 8000); };

  async function act(op: string, extra: Record<string, unknown> = {}, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(op);
    try {
      const j = await api(`/api/portal/admin/users/${id}/action`, { method: "POST", body: JSON.stringify({ op, ...extra }) });
      if (j.password) flash(`${op === "email_credentials" ? "Emailed. " : ""}New password: ${j.password}`);
      else flash("Done.");
      await load();
    } catch (e) { flash((e as Error).message); } finally { setBusy(""); }
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy("edit");
    try { await api(`/api/portal/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(edit) }); setEdit(null); flash("Saved."); await load(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(""); }
  }

  async function del() {
    if (!window.confirm("Permanently delete this account and all its data? This cannot be undone.")) return;
    setBusy("delete");
    try { await api(`/api/portal/admin/users/${id}`, { method: "DELETE" }); router.push("/portal/admin/users"); }
    catch (e) { flash((e as Error).message); setBusy(""); }
  }

  function lockUser() {
    const message = window.prompt(
      "Custom message shown to this user after sign-in:",
      "Your portal access has been paused by the school administration. Please contact your teacher or school coordinator for assistance."
    );
    if (message == null) return;
    void act("suspend", { message });
  }

  if (err) return <p className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-fog">{err}</p>;
  if (!d) return <p className="text-sm text-dust">Loading…</p>;

  const p = d.profile;
  const suspended = p.status === "archived" || d.access.banned || !!d.access.portalRestriction;
  const schoolScoped = p.roles.some((r) => ["coordinator", "facilitator", "attendance_registrar"].includes(r));
  const availableClasses = schoolScoped ? classes.filter((c) => !!d.staffSchool && c.school === d.staffSchool) : classes;

  return (
    <div className="space-y-5">
      <Link href="/portal/admin/users" className="inline-flex items-center gap-1 text-xs text-dust hover:text-cyan"><ArrowLeft size={13} /> All users</Link>

      {/* Identity + access */}
      <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {edit ? (
              <div className="space-y-2">
                <input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-1.5 text-sm text-ice" />
                <input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="block rounded-lg border border-white/10 bg-abyss/60 px-3 py-1.5 text-xs text-ice" />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={busy === "edit"} className="btn-ghost !px-3 !py-1 text-xs">Save</button>
                  <button onClick={() => setEdit(null)} className="text-xs text-dust hover:text-ice">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-ice">{p.full_name || "(no name)"}</h1>
                <p className="text-sm text-dust">{p.email}</p>
                <button onClick={() => setEdit({ full_name: p.full_name, email: p.email })} className="mt-1 text-[11px] text-cyan hover:underline">Edit identity</button>
              </>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.roles.length ? p.roles.map((r) => <span key={r} className="rounded-full border border-cyan/25 px-2 py-0.5 text-[10px] text-cyan">{LABEL[r] || r}</span>) : <span className="text-[10px] text-dust">no role</span>}
              {suspended ? <span className="rounded-full border border-signal/40 px-2 py-0.5 text-[10px] text-signal">RESTRICTED</span> : <span className="rounded-full border border-emerald2/30 px-2 py-0.5 text-[10px] text-emerald2">ACTIVE</span>}
            </div>
            <p className="mt-2 text-[11px] text-dust">
              Last sign-in: {d.access.lastSignIn ? new Date(d.access.lastSignIn).toLocaleString() : "never"} · Email {d.access.emailConfirmed ? "confirmed" : "unconfirmed"} · Joined {new Date(p.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button disabled={!!busy} onClick={() => act("password")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan"><KeyRound size={13} /> Reset password</button>
            <button disabled={!!busy} onClick={() => act("email_credentials")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan"><Mail size={13} /> Reset &amp; email</button>
            {isSuper && suspended && (!d.access.portalRestriction || d.access.portalRestriction.scopeType === "user") ? (
              <button disabled={!!busy} onClick={() => act("reactivate")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald2/30 px-3 py-1.5 text-xs text-emerald2 hover:bg-emerald2/10"><RotateCcw size={13} /> Restore access</button>
            ) : isSuper && suspended ? (
              <Link href="/portal/admin/access" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-300/[0.06]"><Ban size={13} /> Managed by {d.access.portalRestriction?.scopeType} lock</Link>
            ) : isSuper && !p.roles.includes("super_admin") ? (
              <button disabled={!!busy} onClick={lockUser} className="inline-flex items-center gap-1.5 rounded-lg border border-signal/30 px-3 py-1.5 text-xs text-signal hover:bg-signal/10"><Ban size={13} /> Lock access</button>
            ) : null}
            {isSuper && p.id !== selfId ? (
              <button disabled={!!busy} onClick={del} className="inline-flex items-center gap-1.5 rounded-lg border border-signal/30 px-3 py-1.5 text-xs text-signal hover:bg-signal/10"><Trash2 size={13} /> Delete</button>
            ) : null}
          </div>
        </div>
      </div>

      {msg ? <p className="rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-2.5 font-mono text-xs text-ice">{msg}</p> : null}

      {/* Roles */}
      <Card title="Roles &amp; permissions" icon={<ShieldCheck size={13} className="text-cyan" />}>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map(([v, l]) => {
            const has = p.roles.includes(v);
            return (
              <button key={v} disabled={!!busy} onClick={() => act(has ? "revoke_role" : "grant_role", { role: v })}
                className={"rounded-full border px-2.5 py-1 text-[11px] " + (has ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
                {l} {has ? "×" : "+"}
              </button>
            );
          })}
        </div>
        {(p.roles.includes("coordinator") || p.roles.includes("facilitator") || p.roles.includes("attendance_registrar")) && (
          <div className="mt-3 rounded-lg border border-cyan/20 bg-cyan/[0.04] p-3">
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-dust">School (for Coordinator / Facilitator / Attendance Registrar)</label>
            <div className="flex flex-wrap items-center gap-2">
              <select defaultValue={d.staffSchool || ""} disabled={!!busy}
                onChange={(e) => act("set_school", { school: e.target.value })}
                className="min-w-[14rem] flex-1 rounded-lg border border-white/10 bg-abyss/60 px-2.5 py-1.5 text-sm text-ice focus:border-cyan focus:outline-none">
                <option value="">— Select a school —</option>
                {(d.schools || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {d.staffSchool ? <span className="rounded-full border border-emerald2/30 px-2 py-0.5 text-[10px] text-emerald2">{d.staffSchool}</span> : <span className="text-[10px] text-dust">no school set</span>}
            </div>
          </div>
        )}
      </Card>

      {/* Enrolments */}
      <Card title={schoolScoped ? "Assigned class access" : "Enrolments (schools & classes)"} icon={<GraduationCap size={13} className="text-cyan" />}>
        {d.enrolments.length ? (
          <ul className="mb-3 space-y-1.5">
            {d.enrolments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-abyss/40 px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-fog">{e.school} — {e.className}{e.section ? ` (${e.section})` : ""} <span className="text-dust">· {e.status}</span></span>
                <button disabled={!!busy} onClick={() => act("unenrol", { enrolment_id: e.id })} className="shrink-0 text-signal hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="mb-3 text-xs text-dust">{schoolScoped ? "No class assigned. This staff account cannot view or contact any students until a class is assigned." : "Not enrolled in any class."}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <select value={enrolClass} onChange={(e) => setEnrolClass(e.target.value)} className="rounded-lg border border-white/10 bg-abyss/60 px-2 py-1.5 text-xs text-ice focus:border-cyan focus:outline-none">
            <option value="">Add to class…</option>
            {availableClasses.map((c) => <option key={c.id} value={c.id}>{c.school} — {c.name}{c.section ? ` (${c.section})` : ""}</option>)}
          </select>
          <button disabled={!enrolClass || !!busy} onClick={() => { act("enrol", { class_id: enrolClass }); setEnrolClass(""); }} className="btn-ghost !px-3 !py-1.5 text-xs">Enrol</button>
        </div>
      </Card>

      {/* Individualised tasks & challenges — one-to-one work for this student. */}
      <IndividualTasks id={id} studentName={p.full_name || p.email || "student"} />

      {/* Past / Present / Future activity */}
      <ActivityTimeline id={id} />

      {/* Graphical intelligence report — individual student evidence, ranks and strategy. */}
      {d.progress ? <StudentVisualReport progress={d.progress} attendance={d.attendance} /> : null}

      {/* Progress */}
      {d.progress ? (
        <Card title="Exam Lab progress" icon={<Activity size={13} className="text-cyan" />}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Level", `${d.progress.level} · ${d.progress.levelLabel}`], ["Accuracy", d.progress.scoredQuestions ? `${d.progress.overallAccuracy}%` : "—"], ["Attempts", d.progress.totalAttempts], ["Papers sat", d.progress.papersSat]] as [string, string | number][]).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-abyss/40 px-3 py-2">
                <p className="text-sm font-semibold text-ice">{v}</p>
                <p className="text-[10px] uppercase tracking-widest text-dust">{k}</p>
              </div>
            ))}
          </div>
          {d.progress.recentAttempts.length ? (
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-dust">Recent activity</p>
              <ul className="space-y-1">
                {d.progress.recentAttempts.map((a, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-abyss/40 px-3 py-1.5 text-xs text-fog">
                    <span>{new Date(a.ts).toLocaleString()} · {a.mode}</span>
                    <span className="text-dust">{a.qCount} Q · {a.score}/{a.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Attendance + results + submissions */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Attendance" icon={<ShieldCheck size={13} className="text-cyan" />}>
          {d.attendance ? (
            <p className="text-sm text-fog"><span className="text-2xl font-semibold text-ice">{d.attendance.pct}%</span><br /><span className="text-xs text-dust">{d.attendance.present} present · {d.attendance.late} late · {d.attendance.absent} absent</span></p>
          ) : <p className="text-xs text-dust">No attendance recorded.</p>}
        </Card>
        <Card title="Assessment results" icon={<BookOpen size={13} className="text-cyan" />}>
          {d.results.length ? (
            <ul className="space-y-1 text-xs">
              {d.results.slice(0, 8).map((r, i) => (
                <li key={i} className="flex justify-between gap-2 text-fog"><span className="min-w-0 truncate">{r.title}</span><span className="shrink-0 text-dust">{r.score != null ? `${r.score}${r.total ? `/${r.total}` : ""}` : "—"}{r.grade ? ` · ${r.grade}` : ""}</span></li>
              ))}
            </ul>
          ) : <p className="text-xs text-dust">No results yet.</p>}
        </Card>
        <Card title="Assignment submissions" icon={<ClipboardList size={13} className="text-cyan" />}>
          {d.submissions.length ? (
            <ul className="space-y-1 text-xs">
              {d.submissions.slice(0, 8).map((s, i) => (
                <li key={i} className="flex justify-between gap-2 text-fog"><span className="min-w-0 truncate">{s.title}</span><span className="shrink-0 text-dust">{s.status}{s.marks != null ? ` · ${s.marks}` : ""}</span></li>
              ))}
            </ul>
          ) : <p className="text-xs text-dust">No submissions yet.</p>}
        </Card>
      </div>

      {/* Onboarding / guardians */}
      {d.onboarding ? (
        <Card title="Profile & guardians" icon={<GraduationCap size={13} className="text-cyan" />}>
          <p className="text-xs text-fog">Onboarding: {d.onboarding.completed ? "complete" : "incomplete"}{d.onboarding.city ? ` · ${d.onboarding.city}` : ""}{d.onboarding.whatsapp ? ` · WhatsApp ${d.onboarding.whatsapp}` : ""}</p>
          {d.onboarding.guardians.length ? (
            <ul className="mt-2 space-y-1 text-xs text-dust">
              {d.onboarding.guardians.map((g, i) => <li key={i}>{g.relationship || "Guardian"}: {g.name} · {g.email} · {g.phone}</li>)}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
