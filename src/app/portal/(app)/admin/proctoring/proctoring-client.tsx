"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldAlert, Lock, LockOpen, Loader2, Camera, Clock, User, RefreshCw, ChevronRight,
  AlertTriangle, CheckCircle2, MailQuestion,
} from "lucide-react";

type Lock = {
  uid: string; attemptId: string; studentName: string; studentEmail: string;
  title: string; lockedReason: string; at: number; status: string; unlockRequestedAt: number | null;
};
type Ev = { type: string; reason: string; terminal: boolean; at: number; source: string };
type Session = {
  attemptId: string; uid: string; studentName: string; studentEmail: string;
  kind: string; integrity: string; meta: { title: string; subtitle?: string; ref?: string; paperType?: string };
  startedAt: number; endedAt: number | null; status: string; cameraConsent: boolean;
  lockedReason: string | null; events: Ev[];
  unlockRequest: { at: number; note: string } | null;
  unlock: { by: string; byName: string; at: number; note: string } | null;
};
type Snap = { url: string; at: number; reason: string };

const fmt = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const POLL_MS = 15_000;

function UpdatedAgo({ at }: { at: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(iv); }, []);
  if (at === null) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  return <span className="font-mono text-[10px] text-dust">updated {s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`}</span>;
}

export function ProctoringClient({ canUnlock }: { canUnlock: boolean }) {
  const [locks, setLocks] = useState<Lock[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<Lock | null>(null);
  const [detail, setDetail] = useState<{ session: Session; snapshots: Snap[] } | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [note, setNote] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [msg, setMsg] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const selRef = useRef<Lock | null>(null);
  useEffect(() => { selRef.current = sel; }, [sel]);

  // `quiet`: a background refresh — no spinner, and the open record is only
  // re-fetched when its queue entry actually changed (re-signing snapshot URLs
  // every poll would reload every image).
  const open = useCallback(async (l: Lock, quiet = false) => {
    if (!quiet) { setSel(l); setDetail(null); setDetailBusy(true); setNote(""); setMsg(""); }
    try {
      const r = await fetch(`/api/portal/admin/proctoring?uid=${encodeURIComponent(l.uid)}&attemptId=${encodeURIComponent(l.attemptId)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load session.");
      if (quiet && selRef.current?.attemptId !== l.attemptId) return;
      if (quiet) setSel(l);
      setDetail(j);
    } catch (e) { if (!quiet) setMsg((e as Error).message); } finally { if (!quiet) setDetailBusy(false); }
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) { setLoading(true); setErr(""); }
    try {
      const r = await fetch("/api/portal/admin/proctoring?list=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load.");
      const next: Lock[] = j.locks || [];
      setLocks(next);
      setUpdatedAt(Date.now());
      setErr("");
      const cur = selRef.current;
      const fresh = cur && next.find((l) => l.uid === cur.uid && l.attemptId === cur.attemptId);
      if (quiet && cur && fresh && (fresh.status !== cur.status || fresh.unlockRequestedAt !== cur.unlockRequestedAt || fresh.at !== cur.at)) void open(fresh, true);
    } catch (e) { if (!quiet) setErr((e as Error).message); } finally { if (!quiet) setLoading(false); }
  }, [open]);
  useEffect(() => { void load(); }, [load]);

  // Live queue: poll every 15 s while the tab is visible, and refresh at once
  // when it regains visibility or focus.
  useEffect(() => {
    const tick = () => { if (document.visibilityState !== "hidden") void load(true); };
    const onShow = () => { if (document.visibilityState === "visible") void load(true); };
    const iv = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow); };
  }, [load]);

  async function unlock() {
    if (!sel) return;
    setUnlocking(true); setMsg("");
    try {
      const r = await fetch("/api/portal/admin/proctoring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: sel.uid, attemptId: sel.attemptId, note }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not unlock.");
      setMsg("Unlocked. The student can now re-sit this test.");
      await load();
      await open(sel);
    } catch (e) { setMsg((e as Error).message); } finally { setUnlocking(false); }
  }

  const pending = locks.filter((l) => l.status === "locked");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-red-400/30 text-red-300"><ShieldAlert size={18} /></span>
          <div>
            <h1 className="text-2xl font-semibold text-ice">Proctoring &amp; locked tests</h1>
            <p className="text-xs text-dust">Forensic records of proctored tests. {canUnlock ? "Review a lock, then unlock to let the student re-sit." : "Only a super-admin can unlock."}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UpdatedAgo at={updatedAt} />
          <button onClick={() => { void load(); }} className="btn-ghost !px-3 !py-1.5 text-xs"><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>

      {err ? <p className="rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-signal">{err}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        {/* queue */}
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-dust">{pending.length} locked · {locks.length} total</p>
          {loading ? (
            <p className="text-sm text-dust"><Loader2 size={14} className="mr-1 inline animate-spin" /> Loading…</p>
          ) : locks.length === 0 ? (
            <div className="rounded-2xl border border-emerald2/20 bg-emerald2/[0.04] p-5 text-center text-sm text-fog"><CheckCircle2 size={20} className="mx-auto mb-2 text-emerald2" /> No locked tests. All clear.</div>
          ) : (
            <ul className="space-y-2">
              {locks.map((l) => (
                <li key={l.uid + l.attemptId}>
                  <button onClick={() => open(l)} className={"w-full rounded-xl border p-3 text-left transition " + (sel?.attemptId === l.attemptId ? "border-cyan/50 bg-cyan/[0.06]" : "border-white/10 bg-space/60 hover:border-cyan/30")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ice"><User size={13} className="shrink-0 text-dust" /> {l.studentName}</span>
                      {l.status === "locked" ? <Lock size={13} className="shrink-0 text-red-400" /> : <LockOpen size={13} className="shrink-0 text-emerald2" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-fog">{l.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-dust">{fmt(l.at)}</p>
                    {l.unlockRequestedAt ? <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-300"><MailQuestion size={10} /> review requested</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* detail */}
        <div>
          {!sel ? (
            <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-dust">
              <span className="flex items-center gap-2"><ChevronRight size={15} /> Select a locked test to view its forensic record.</span>
            </div>
          ) : detailBusy ? (
            <p className="text-sm text-dust"><Loader2 size={14} className="mr-1 inline animate-spin" /> Loading forensic record…</p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-ice">{detail.session.meta.title}</h2>
                    <p className="text-xs text-dust">{detail.session.studentName} · {detail.session.studentEmail}</p>
                  </div>
                  <span className={"rounded-full border px-3 py-1 font-mono text-[11px] uppercase " + (detail.session.status === "locked" ? "border-red-400/40 text-red-300" : detail.session.status === "unlocked" ? "border-emerald2/40 text-emerald2" : "border-white/20 text-fog")}>{detail.session.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] text-dust">
                  <span className="rounded-full border border-white/10 px-2 py-0.5">{detail.session.kind}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5">integrity: {detail.session.integrity}</span>
                  {detail.session.meta.ref ? <span className="rounded-full border border-white/10 px-2 py-0.5">{detail.session.meta.ref}</span> : null}
                  <span className="rounded-full border border-white/10 px-2 py-0.5">camera consent: {detail.session.cameraConsent ? "yes" : "no"}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5">started {fmt(detail.session.startedAt)}</span>
                </div>
                {detail.session.lockedReason ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-400/[0.05] px-3 py-2 text-sm text-red-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {detail.session.lockedReason}</p>
                ) : null}
                {detail.session.unlockRequest ? (
                  <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-sm text-amber-100">
                    <p className="flex items-center gap-1.5 font-semibold"><MailQuestion size={14} /> Student requested a review · {fmt(detail.session.unlockRequest.at)}</p>
                    {detail.session.unlockRequest.note ? <p className="mt-1 text-amber-100/90">“{detail.session.unlockRequest.note}”</p> : null}
                  </div>
                ) : null}
                {detail.session.unlock ? (
                  <p className="mt-3 rounded-lg border border-emerald2/25 bg-emerald2/[0.05] px-3 py-2 text-sm text-emerald2">Unlocked by {detail.session.unlock.byName} · {fmt(detail.session.unlock.at)}{detail.session.unlock.note ? ` — “${detail.session.unlock.note}”` : ""}</p>
                ) : null}
              </div>

              {/* snapshots */}
              {detail.snapshots.length ? (
                <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
                  <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust"><Camera size={13} className="text-cyan" /> Violation snapshots ({detail.snapshots.length})</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {detail.snapshots.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={s.reason} className="aspect-[4/3] w-full object-cover" />
                        <p className="truncate bg-black/40 px-2 py-1 font-mono text-[9px] text-dust">{fmt(s.at)} · {s.reason}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* forensic timeline */}
              <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-dust"><Clock size={13} className="text-cyan" /> Forensic timeline ({detail.session.events.length})</p>
                {detail.session.events.length ? (
                  <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
                    {detail.session.events.slice().reverse().map((e, i) => (
                      <li key={i} className={"flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs " + (e.terminal ? "border-red-400/30 bg-red-400/[0.05]" : "border-white/[0.06]")}>
                        <span className="font-mono text-[10px] text-dust">{new Date(e.at).toLocaleTimeString("en-GB")}</span>
                        <span className={"rounded-full border px-1.5 py-0.5 font-mono text-[9px] " + (e.source === "camera" ? "border-violet2/40 text-violet2" : e.source === "system" ? "border-cyan/30 text-cyan" : "border-white/15 text-fog")}>{e.source}</span>
                        <span className={e.terminal ? "text-red-200" : "text-fog"}>{e.reason || e.type}</span>
                        {e.terminal ? <span className="ml-auto shrink-0 font-mono text-[9px] uppercase text-red-300">terminal</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-dust">No integrity events recorded.</p>}
              </div>

              {/* unlock */}
              {detail.session.status === "locked" ? (
                canUnlock ? (
                  <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-5">
                    <p className="text-sm font-semibold text-ice">Unlock this test</p>
                    <p className="mt-1 text-xs text-dust">Only unlock after reviewing the record above. The student will be able to re-sit the test fresh.</p>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reviewer note (optional)…" className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
                    <div className="mt-3 flex items-center gap-3">
                      <button onClick={unlock} disabled={unlocking} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-50">{unlocking ? <Loader2 size={14} className="animate-spin" /> : <LockOpen size={14} />} Unlock test</button>
                      {msg ? <span className="text-xs text-cyan">{msg}</span> : null}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-dust">Only a super-admin can unlock a locked test.</p>
                )
              ) : msg ? <p className="text-xs text-cyan">{msg}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-signal">{msg || "Could not load."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
