import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/request-guards";

/**
 * Fallback landing spot for a login form submitted natively before React
 * hydrates (see login-form.tsx: `method="post"` + this route as `action`,
 * so a pre-hydration submit POSTs here instead of doing a GET with the
 * email/password in the URL query string).
 *
 * This route never reads the request body. Real sign-in always happens
 * client-side via the Supabase browser client once JS has loaded; this
 * handler's only job is to bounce back to the login page harmlessly — no
 * credentials are read, logged, or echoed anywhere.
 */
export async function POST(request: Request) {
  const next = new URL(request.url).searchParams.get("next");
  const target = next
    ? `/portal/login?next=${encodeURIComponent(safeNextPath(next))}`
    : "/portal/login";
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
