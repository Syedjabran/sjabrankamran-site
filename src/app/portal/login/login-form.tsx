"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

/** True when the raw error string carries no real message (e.g. "{}", "[object Object]"). */
function isEmptyError(msg?: string | null) {
  if (!msg) return true;
  const t = msg.trim();
  return t === "" || t === "{}" || t === "[object Object]" || t === "null" || t === "undefined";
}

/** Never surface an opaque "{}" to the user — fall back to a readable message. */
function cleanError(msg?: string | null): string | null {
  if (msg == null) return null;
  if (isEmptyError(msg)) return "Something went wrong. Please try again.";
  return msg;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(() => cleanError(params.get("error")));
  const [notice, setNotice] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password. Please try again."
          : cleanError(error.message)
      );
      return;
    }
    router.replace(params.get("next") || "/portal");
    router.refresh();
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    const target = email.trim();
    if (!target || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      setError("Enter your email in the field above, then tap “Forgot password”.");
      return;
    }
    setResetting(true);
    try {
      // Route recovery through the portal's working mail relay (not Supabase SMTP).
      const res = await fetch("/api/portal/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target, origin: window.location.origin }),
      });
      const j = await res.json().catch(() => ({}));
      setNotice(j.message || "If an account exists for that email, a password-reset link is on its way. Check your inbox (and spam).");
    } catch {
      setError("Could not send the reset email. Please try again shortly.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <form onSubmit={signIn} className="space-y-4">
      <div>
        <label htmlFor="portal-email" className="mb-1.5 block text-xs font-medium text-fog">
          Email
        </label>
        <input
          id="portal-email"
          name="email"
          type="email"
          required
          autoComplete="username email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="portal-password" className="mb-1.5 block text-xs font-medium text-fog">
          Password
        </label>
        <div className="relative">
          <input
            id="portal-password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-abyss/60 px-3.5 py-2.5 pr-11 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-dust transition hover:text-cyan focus:text-cyan focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error ? <p className="text-xs leading-relaxed text-signal">{error}</p> : null}
      {notice ? <p className="text-xs leading-relaxed text-cyan">{notice}</p> : null}

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} Sign in
      </button>

      <button
        type="button"
        onClick={resetPassword}
        disabled={resetting}
        className="block w-full text-center text-xs text-dust transition hover:text-cyan disabled:opacity-60"
      >
        {resetting ? "Sending reset link…" : "Forgot password?"}
      </button>
      <p className="text-center text-[11px] text-dust">You&apos;ll stay signed in on this device. Your browser can save your login for next time.</p>
    </form>
  );
}
