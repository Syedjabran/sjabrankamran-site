import { NextResponse } from "next/server";

/**
 * Fallback landing spot for the set-new-password form submitted natively
 * before React hydrates (see reset-form.tsx: `method="post"` + this route as
 * `action`, so a pre-hydration submit POSTs here instead of doing a GET with
 * the new password in the URL query string).
 *
 * This route never reads the request body. The real password update always
 * happens client-side via the Supabase browser client once JS has loaded;
 * this handler's only job is to bounce back to the reset page harmlessly —
 * no credentials are read, logged, or echoed anywhere.
 */
export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/portal/reset", request.url), { status: 303 });
}
