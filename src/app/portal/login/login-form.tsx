"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
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
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/portal/auth/callback?next=/portal/reset`,
      });
      if (error) {
        // A 4xx/5xx from GoTrue when SMTP isn't configured often serialises to an
        // empty body → show something actionable instead of a raw "{}".
        setError(
          /sending|smtp|email|500|unexpected/i.test(error.message) || isEmptyError(error.message)
            ? "We couldn't send the reset email — the portal's email delivery isn't set up yet. Please ask the admin to reset your password directly."
            : cleanError(error.message)
        );
      } else {
        setNotice(
          "If an account exists for that email, a password-reset link is on its way. Check your inbox (and spam)."
        );
      }
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
          type="email"
          required
          autoComplete="email"
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
        <input
          id="portal-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          placeholder="••••••••"
        />
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
    </form>
  );
}
