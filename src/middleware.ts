import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protects /portal routes: refreshes the Supabase session cookie and
 * redirects signed-out visitors to the login page.
 */
export async function middleware(request: NextRequest) {
  // Expose the current path to server components (used by the portal layout to
  // gate students onto the onboarding form without an infinite redirect loop).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // A prefetch of an auth-gated route (RSC / Next-Router-Prefetch) that always
  // 307-redirects poisons the App Router client cache with a redirect entry.
  // The subsequent on-click soft navigation then resolves to that cached
  // redirect and NO-OPS — the classic “clicking Portal does nothing” bug.
  // We must never let such a redirect be cached, and never emit a cacheable
  // prefetch response for a route that redirects.
  const isRscRequest = request.headers.get("rsc") === "1";
  const isPrefetch = request.headers.get("next-router-prefetch") === "1";

  function protectedRedirect(url: URL) {
    const res = NextResponse.redirect(url);
    // Prevent the router (and any CDN) from caching this redirect so a real
    // click always re-evaluates auth and follows through to the login page.
    if (isRscRequest || isPrefetch) {
      res.headers.set("cache-control", "no-store, must-revalidate");
    }
    return res;
  }

  // Pages reachable while signed out (login, password reset, and the auth
  // callback that exchanges recovery/magic-link codes for a session).
  const isPublicAuthPath =
    pathname.startsWith("/portal/login") ||
    pathname.startsWith("/portal/reset") ||
    pathname.startsWith("/portal/auth");

  if (!user && !isPublicAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    url.searchParams.set("next", pathname);
    return protectedRedirect(url);
  }
  // Only bounce already-signed-in users away from the login screen. Do NOT
  // redirect off /portal/reset — a recovery session lands there specifically
  // to set a new password, and off /portal/auth which is a transient handler.
  if (user && pathname.startsWith("/portal/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/portal/:path*"],
};
