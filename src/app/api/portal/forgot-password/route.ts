import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/portal/mail";
import { accountCoursesFor } from "@/lib/portal/admin";
import { recoveryEmail } from "@/lib/portal/portal-emails";

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
 * portal's mail relay (the portal's mailbox, brand.ts) instead of Supabase's
 * unconfigured SMTP, worded for the account's courses (portal-emails.ts).
 * Always returns a generic success (no account enumeration).
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
    const { data: prof } = await sb.from("edu_profiles").select("id, full_name").eq("email", email).maybeSingle();
    const name = prof?.full_name || "there";
    const { subject, text, html } = recoveryEmail(name, link, prof?.id ? await accountCoursesFor(prof.id) : []);
    await sendMail({ to: [email], subject, text, html, by: "system", byName: "Portal", kind: "announcement", meta: { recovery: true } });
  } catch {
    /* stay generic */
  }
  return generic;
}
