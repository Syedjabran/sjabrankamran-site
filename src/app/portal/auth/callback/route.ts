import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/request-guards";

/**
 * OAuth / magic-link / password-recovery callback (PKCE).
 *
 * Supabase email links (recovery, invite, magic-link) redirect here with a
 * one-time `?code=...`. We exchange it for a session (sets the auth cookies)
 * and then forward the user to `next` — for password recovery that is
 * /portal/reset, where they can set a new password while authenticated.
 *
 * Without this route the reset page had no session, so updateUser() failed
 * with "Auth session missing" and nothing happened.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const errorDescription = url.searchParams.get("error_description");

  // Only allow same-site relative redirects ("//host" and "/\host" are rejected).
  const next = safeNextPath(url.searchParams.get("next") || "/portal/reset");

  if (errorDescription) {
    const login = new URL("/portal/login", url.origin);
    login.searchParams.set("error", errorDescription);
    return NextResponse.redirect(login);
  }

  const supabase = await createClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      // Legacy / OTP-style links.
      const { error } = await supabase.auth.verifyOtp({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: type as any,
        token_hash: tokenHash,
      });
      if (error) throw error;
    } else {
      throw new Error("Missing authentication code.");
    }
  } catch (e) {
    const login = new URL("/portal/login", url.origin);
    login.searchParams.set(
      "error",
      "This reset link is invalid or has expired. Please request a new one."
    );
    return NextResponse.redirect(login);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
