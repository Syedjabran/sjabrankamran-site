"use client";

import { FormEvent, useState } from "react";
import { Send, Loader2, CheckCircle2 } from "lucide-react";

const TYPES = [
  "Student Physics question",
  "Parent enquiry",
  "Academic mentoring",
  "School / academic collaboration",
  "Workshop or masterclass",
  "University guidance",
  "Consulting",
  "Business partnership",
  "Speaking and training",
  "Technology collaboration",
  "Media",
  "General",
];

export function ContactForm({ defaultType = "" }: { defaultType?: string }) {
  const [state, setState] = useState<"idle" | "invalid" | "sending" | "sent" | "error">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the element now: React clears e.currentTarget once dispatch ends,
    // so reading it after the await would throw and report a false failure.
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    // The server trims before checking lengths; mirror that so padded input
    // gets a clear message instead of a generic failure.
    if (String(body.name ?? "").trim().length < 2 || String(body.message ?? "").trim().length < 20) {
      setState("invalid");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setState("sent");
        form.reset();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  const field =
    "mt-2 w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-3 text-sm text-ice placeholder:text-dust outline-none transition focus:border-cyan";

  if (state === "sent") {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="text-cyan" size={32} />
        <p className="font-display text-xl font-semibold text-ice">Enquiry received</p>
        <p className="max-w-sm text-sm text-fog">
          Thank you. Your message has been received and you&rsquo;ll get a response soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm text-fog">
          Name
          <input className={field} name="name" required maxLength={120} />
        </label>
        <label className="block text-sm text-fog">
          Email
          <input className={field} name="email" type="email" required maxLength={200} />
        </label>
      </div>
      <label className="block text-sm text-fog">
        Enquiry type
        <select className={field} name="type" required defaultValue={defaultType}>
          <option value="" disabled>Select one</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="block text-sm text-fog">
        Message
        <textarea className={field} name="message" required minLength={20} maxLength={5000} rows={6} />
      </label>
      <input name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex gap-3 text-sm leading-6 text-fog">
        <input type="checkbox" name="consent" required className="mt-1" />
        I consent to my details being used to respond to this enquiry.
      </label>
      <button
        disabled={state === "sending"}
        className="btn-primary w-full justify-center disabled:opacity-60"
      >
        {state === "sending" ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <><Send size={16} /> Send enquiry</>}
      </button>
      {state === "invalid" ? (
        <p aria-live="polite" className="text-sm text-signal">
          Please enter your name and a message of at least 20 characters.
        </p>
      ) : null}
      {state === "error" ? (
        <p aria-live="polite" className="text-sm text-signal">
          The enquiry could not be sent. Please try again later.
        </p>
      ) : null}
    </form>
  );
}
