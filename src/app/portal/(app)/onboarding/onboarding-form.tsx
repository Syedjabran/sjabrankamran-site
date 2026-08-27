"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound, Users, ShieldCheck, CheckCircle2 } from "lucide-react";

type Guardian = { relationship: string; name: string; email: string; phone: string; is_primary?: boolean };

const inputCls =
  "w-full rounded-xl border border-white/15 bg-void px-3.5 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";
const labelCls = "mb-1 block font-mono text-[11px] uppercase tracking-widest text-fog";

export function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    full_name: "", preferred_name: "", date_of_birth: "", gender: "",
    phone: "", whatsapp: "", city: "", address: "", school: "", class_label: "",
    emergency_name: "", emergency_phone: "", consent: false,
  });
  const [guardians, setGuardians] = useState<Guardian[]>([
    { relationship: "Father", name: "", email: "", phone: "", is_primary: true },
    { relationship: "Mother", name: "", email: "", phone: "", is_primary: false },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/portal/onboarding");
        const j = await r.json();
        const o = j.onboarding, d = j.defaults || {};
        setForm((f) => ({
          ...f,
          full_name: o?.full_name || d.full_name || "",
          preferred_name: o?.preferred_name || "",
          date_of_birth: o?.date_of_birth || d.date_of_birth || "",
          gender: o?.gender || "",
          phone: o?.phone || "", whatsapp: o?.whatsapp || "",
          city: o?.city || "", address: o?.address || "",
          school: o?.school || d.school || "", class_label: o?.class_label || d.class_label || "",
          emergency_name: o?.emergency_name || "", emergency_phone: o?.emergency_phone || "",
          consent: false,
        }));
        if (o?.guardians?.length) setGuardians(o.guardians);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function setG(i: number, patch: Partial<Guardian>) {
    setGuardians((gs) => gs.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  }
  function setPrimary(i: number) {
    setGuardians((gs) => gs.map((g, k) => ({ ...g, is_primary: k === i })));
  }

  async function submit() {
    setSaving(true);
    setErrors([]);
    try {
      const r = await fetch("/api/portal/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, guardians }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setDone(true);
        setTimeout(() => { router.replace("/portal"); router.refresh(); }, 1200);
      } else {
        setErrors(j.errors || [j.error || "Please check the form."]);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setErrors(["Network error — please try again."]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-fog"><Loader2 className="animate-spin text-cyan" size={16} /> Loading…</div>;
  }
  if (done) {
    return (
      <div className="rounded-2xl border border-emerald2/30 bg-emerald2/[0.06] p-8 text-center">
        <CheckCircle2 className="mx-auto text-emerald2" size={34} />
        <h2 className="mt-3 font-display text-xl text-ice">You’re all set!</h2>
        <p className="mt-1 text-sm text-fog">Taking you to your portal…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-xl border border-signal/40 bg-signal/[0.06] p-4">
          <p className="mb-1 font-display text-sm text-signal">Please fix the following:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-fog">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {/* student */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-4 flex items-center gap-2 font-display text-sm text-ice"><UserRound size={16} className="text-cyan" /> Your details</p>
        {(form.school || form.class_label) && (
          <p className="mb-4 rounded-lg border border-cyan/20 bg-cyan/[0.04] px-3 py-2 text-xs text-fog">
            Enrolled: <b className="text-ice">{form.school}</b>{form.class_label ? <> · {form.class_label}</> : null}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={labelCls}>Full name *</label><input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className={labelCls}>Preferred name</label><input className={inputCls} value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} /></div>
          <div><label className={labelCls}>Date of birth *</label><input type="date" className={inputCls} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
          <div><label className={labelCls}>Gender</label>
            <select className={inputCls} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
            </select>
          </div>
          <div><label className={labelCls}>Your phone *</label><input className={inputCls} placeholder="+92…" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className={labelCls}>WhatsApp</label><input className={inputCls} placeholder="+92…" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div><label className={labelCls}>City *</label><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><label className={labelCls}>Address</label><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
      </section>

      {/* guardians */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-1 flex items-center gap-2 font-display text-sm text-ice"><Users size={16} className="text-cyan" /> Parent / guardian contact</p>
        <p className="mb-4 text-xs text-dust">A valid parent email is required — your progress reports are sent there. Mark one as the primary contact.</p>
        <div className="space-y-4">
          {guardians.map((g, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-void/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-widest text-fog">Guardian {i + 1}</span>
                <label className="flex items-center gap-1.5 text-xs text-fog">
                  <input type="radio" name="primary" checked={!!g.is_primary} onChange={() => setPrimary(i)} className="accent-cyan" /> Primary contact
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={labelCls}>Relationship</label>
                  <select className={inputCls} value={g.relationship} onChange={(e) => setG(i, { relationship: e.target.value })}>
                    <option>Father</option><option>Mother</option><option>Guardian</option><option>Other</option>
                  </select>
                </div>
                <div><label className={labelCls}>Name {i === 0 ? "*" : ""}</label><input className={inputCls} value={g.name} onChange={(e) => setG(i, { name: e.target.value })} /></div>
                <div><label className={labelCls}>Email {i === 0 ? "*" : ""}</label><input type="email" className={inputCls} placeholder="parent@email.com" value={g.email} onChange={(e) => setG(i, { email: e.target.value })} /></div>
                <div><label className={labelCls}>Phone {i === 0 ? "*" : ""}</label><input className={inputCls} placeholder="+92…" value={g.phone} onChange={(e) => setG(i, { phone: e.target.value })} /></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* emergency + consent */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-4 flex items-center gap-2 font-display text-sm text-ice"><ShieldCheck size={16} className="text-cyan" /> Emergency & consent</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={labelCls}>Emergency contact name</label><input className={inputCls} value={form.emergency_name} onChange={(e) => setForm({ ...form, emergency_name: e.target.value })} /></div>
          <div><label className={labelCls}>Emergency contact phone</label><input className={inputCls} value={form.emergency_phone} onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })} /></div>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-fog">
          <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-1 accent-cyan" />
          <span>I confirm these details are correct and I consent to receiving academic progress updates by email.</span>
        </label>
      </section>

      <button onClick={submit} disabled={saving} className="btn-primary w-full justify-center disabled:opacity-50">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save & start learning
      </button>
    </div>
  );
}
