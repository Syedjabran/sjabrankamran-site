import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protects /portal routes: refreshes the Supabase session cookie and
 * redirects signed-out visitors to the login page.
 *
 * Hardened against MIDDLEWARE_INVOCATION_TIMEOUT (504): the Supabase
 * `auth.getUser()` call is a network round-trip to the Auth server on every
 * request, and a transient slow response used to hang the middleware until
 * Vercel killed it. We now (a) skip that call entirely when there is no
 * session cookie — anonymous visitors, bots and RSC prefetches redirect to
 * login with zero network calls — and (b) bound the call with a timeout that
 * fails OPEN (defers auth to the page's own getPortalUser(); RLS still guards
 * all data) rather than 504-ing.
 */
const AUTH_TIMEOUT_MS = 3500;

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const { pathname } = request.nextUrl;
  // Expose the current path to server components (used by the portal layout to
  // gate students onto the onboarding form without an infinite redirect loop).
  requestHeaders.set("x-pathname", pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const isRscRequest = request.headers.get("rsc") === "1";
  const isPrefetch = request.headers.get("next-router-prefetch") === "1";

  // A prefetch of an auth-gated route (RSC / Next-Router-Prefetch) that always
  // 307-redirects poisons the App Router client cache with a redirect entry.
  // The subsequent on-click soft navigation then resolves to that cached
  // redirect and NO-OPS — the classic "clicking Portal does nothing" bug. So we
  // never let such a redirect be cached.
  function protectedRedirect(url: URL) {
    const res = NextResponse.redirect(url);
    if (isRscRequest || isPrefetch) res.headers.set("cache-control", "no-store, must-revalidate");
    return res;
  }
  function toLogin() {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    url.searchParams.set("next", pathname);
    return protectedRedirect(url);
  }

  // Pages reachable while signed out (login, password reset, and the auth
  // callback that exchanges recovery/magic-link codes for a session).
  const isPublicAuthPath =
    pathname.startsWith("/portal/login") ||
    pathname.startsWith("/portal/reset") ||
    pathname.startsWith("/portal/auth");

  // Fast path: no Supabase auth cookie → the visitor is definitely signed out.
  // Skip the Auth network round-trip entirely (this is what occasionally hung).
  if (!hasAuthCookie(request)) {
    return isPublicAuthPath ? response : toLogin();
  }

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

  // Validate the session, but never let a slow/unreachable Auth server hang the
  // middleware. On timeout or error we FAIL OPEN — the page's own
  // getPortalUser() re-checks auth and RLS protects all data — so a transient
  // Supabase blip degrades to a normal page load, not a 504.
  let user: { id: string } | null = null;
  try {
    const raced = await Promise.race([
      supabase.auth.getUser(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), AUTH_TIMEOUT_MS)),
    ]);
    if (raced === "timeout") return response; // fail open
    user = raced.data.user;
  } catch {
    return response; // fail open on network error
  }

  if (!user && !isPublicAuthPath) return toLogin();

  // Only bounce already-signed-in users away from the login screen. Do NOT
  // redirect off /portal/reset (a recovery session sets a new password there)
  // or /portal/auth (a transient handler).
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
