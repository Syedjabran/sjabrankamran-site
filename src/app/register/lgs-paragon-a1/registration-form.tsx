"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Props = {
  enrollmentCode: string;
  schoolName: string;
  className: string;
};

export function RegistrationForm({ enrollmentCode, schoolName, className }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/portal/self-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          enrollment_code: enrollmentCode,
          website, // honeypot
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message || "Registration successful! Check your email for login details.");
      } else {
        setStatus("error");
        setMessage(data.error || "Registration failed. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please check your connection and try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald2/20">
          <CheckCircle2 className="h-7 w-7 text-emerald2" />
        </div>
        <h2 className="text-xl font-semibold text-ice">You&apos;re registered!</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-fog">{message}</p>
        <a
          href="https://sjabrankamran.com/portal/login"
          className="mt-6 inline-block rounded-xl bg-cyan px-6 py-2.5 text-sm font-medium text-void transition hover:bg-cyan/90"
        >
          Go to Login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* School/Class badge */}
      <div className="rounded-xl border border-cyan/20 bg-cyan/5 px-4 py-3 text-center">
        <p className="text-xs uppercase tracking-widest text-dust">Registering for</p>
        <p className="mt-1 font-display text-sm font-medium text-ice">
          {schoolName} — {className}
        </p>
      </div>

      {/* Full Name */}
      <div>
        <label htmlFor="fullName" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-dust">
          Full Name <span className="text-signal">*</span>
        </label>
        <input
          type="text"
          id="fullName"
          required
          minLength={3}
          maxLength={100}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Ayesha Khan"
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice placeholder:text-dust/50 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-dust">
          Email Address <span className="text-signal">*</span>
        </label>
        <input
          type="email"
          id="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your.email@gmail.com"
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice placeholder:text-dust/50 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
        />
        <p className="mt-1.5 text-xs text-dust">Your login credentials will be sent to this email.</p>
      </div>

      {/* Phone (optional) */}
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-dust">
          WhatsApp / Phone <span className="text-dust/60">(optional)</span>
        </label>
        <input
          type="tel"
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="03XX XXXXXXX"
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-4 py-2.5 text-sm text-ice placeholder:text-dust/50 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
        />
      </div>

      {/* Honeypot - hidden from real users */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: "-9999px", opacity: 0 }}
        aria-hidden="true"
      />

      {/* Error message */}
      {status === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-signal/30 bg-signal/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
          <p className="text-sm text-signal">{message}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-6 py-3 text-sm font-medium text-void transition hover:bg-cyan/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Registering...
          </>
        ) : (
          "Register & Get Login"
        )}
      </button>

      <p className="text-center text-xs text-dust">
        Already have an account?{" "}
        <a href="https://sjabrankamran.com/portal/login" className="text-cyan hover:underline">
          Login here
        </a>
      </p>
    </form>
  );
}
