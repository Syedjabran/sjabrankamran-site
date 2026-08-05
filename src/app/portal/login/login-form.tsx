"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          : error.message
      );
      return;
    }
    router.replace(params.get("next") || "/portal");
    router.refresh();
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Enter your email above first, then tap “Forgot password”.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/portal/reset`,
    });
    if (error) setError(error.message);
    else setNotice("Password-reset email sent. Check your inbox.");
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
        className="block w-full text-center text-xs text-dust transition hover:text-cyan"
      >
        Forgot password?
      </button>
    </form>
  );
}
