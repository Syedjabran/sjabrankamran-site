import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/portal/mail";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Naive in-memory rate limit (per warm instance), keyed by IP and by email.
const hits = new Map<string, number[]>();
function limited(key: string, max: number) {
  const now = Date.now();
  const win = 900_000; // 15 minutes
  const arr = (hits.get(key) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

/**
 * Password recovery that actually delivers — routes the reset link through the
 * portal's Apps Script mail relay (physics@sjabrankamran.com) instead of
 * Supabase's unconfigured SMTP. Always returns a generic success (no account
 * enumeration).
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (limited(`ip:${ip}`, 10)) {
    return NextResponse.json({ error: "Too many reset requests. Please wait a few minutes and try again." }, { status: 429 });
  }
  const b = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (b.email || "").trim().toLowerCase();
  const generic = NextResponse.json({ ok: true, message: "If an account exists for that email, a reset link is on its way. Check your inbox (and spam)." }, { status: 200 });
  if (!EMAIL_RE.test(email)) return generic;
  // Per-email cap answers with the same generic message (nothing is sent).
  if (limited(`email:${email}`, 3)) return generic;

  // Built on the server only — never from the request body.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
  const redirectTo = `${origin}/portal/auth/callback?next=/portal/reset`;
  const sb = createAdminClient();
  try {
    const { data, error } = await sb.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    const link = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;
    if (error || !link) return generic; // no such user (or error) → stay generic
    const { data: prof } = await sb.from("edu_profiles").select("full_name").eq("email", email).maybeSingle();
    const name = prof?.full_name || "there";
    const text = `Dear ${name},

We received a request to reset your password for the Physics learning portal.

Reset your password (link valid for 1 hour):
${link}

If you didn't request this, you can safely ignore this email — your password stays unchanged.

Warm regards,
Syed Jabran Ali Kamran
Physics | sjabrankamran.com`;
    const escExceptLink = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const linkHtml = `<a href="${link}" style="color:#1436d6">Reset my password</a>`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${escExceptLink(text).replace(escExceptLink(link), linkHtml).replace(/\n/g, "<br>")}</div>`;
    await sendMail({ to: [email], subject: "Reset your Physics portal password", text, html, by: "system", byName: "Portal", kind: "announcement", meta: { recovery: true } });
  } catch {
    /* stay generic */
  }
  return generic;
}
