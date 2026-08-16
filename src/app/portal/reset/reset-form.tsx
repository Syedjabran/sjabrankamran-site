"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = still checking, true/false = whether a recovery session exists.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    // A recovery session may settle a moment after the callback redirect.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(
        /session/i.test(error.message)
          ? "Your reset link has expired or was already used. Request a new one from the sign-in page."
          : error.message
      );
      return;
    }
    router.replace("/portal");
    router.refresh();
  }

  if (hasSession === false) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm leading-relaxed text-fog">
          This page needs a valid password-reset link. Please open the most recent
          &ldquo;reset your password&rdquo; email and tap its link, then you can set a new password here.
        </p>
        <Link href="/portal/login" className="btn-ghost mx-auto w-fit !px-4 !py-2 text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-fog">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-3.5 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-fog">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-abyss/60 px-3.5 py-2.5 text-sm text-ice focus:border-cyan focus:outline-none"
        />
      </div>
      {error ? <p className="text-xs leading-relaxed text-signal">{error}</p> : null}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Save password
      </button>
    </form>
  );
}
