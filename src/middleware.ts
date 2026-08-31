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

// --- Mandatory onboarding gate (enforced here, on EVERY request) ------------
// The portal (app) layout also redirects un-onboarded students, but a layout
// only re-executes on hard loads — client-side/soft navigations and prefetches
// skip it, which let students slip past the first-login profile form. Middleware
// runs on every request (document loads, RSC soft-nav fetches, prefetches) for
// EVERY device (desktop / laptop / mobile / tablet), so it is the correct place
// to enforce the gate. It fails OPEN on any slow/erroring check (the layout gate
// remains as a second layer) so a transient blip never 504s or locks anyone out.
const GATE_TIMEOUT_MS = 2500;
const GATE_COOKIE = "pb_onb"; // value = the onboarded student's own user id

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/** Portal paths a not-yet-onboarded student must be kept OUT of. */
function isGatedActivityPath(p: string): boolean {
  if (!p.startsWith("/portal")) return false;
  // Always reachable: the onboarding form itself, and the sign-out / auth /
  // login / password-reset surfaces (needed to escape or switch accounts).
  if (p.startsWith("/portal/onboarding")) return false;
  if (p.startsWith("/portal/login")) return false;
  if (p.startsWith("/portal/reset")) return false;
  if (p.startsWith("/portal/auth")) return false;
  return true;
}

/**
 * Authoritative onboarding decision for a user id, using the service role.
 * "allow"   → not a student, or a student who has completed onboarding.
 * "block"   → a student with no completed onboarding record.
 * "unknown" → could not determine (missing env / timeout / error) → fail open.
 */
async function onboardingGate(uid: string): Promise<"allow" | "block" | "unknown"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "unknown";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GATE_TIMEOUT_MS);
  const h = { apikey: key, Authorization: `Bearer ${key}` } as Record<string, string>;
  try {
    // 1) roles — only students are ever gated.
    const rr = await fetch(`${url}/rest/v1/edu_user_roles?user_id=eq.${uid}&select=role`, {
      headers: h, signal: ctrl.signal, cache: "no-store",
    });
    if (!rr.ok) return "unknown";
    const roles = (await rr.json().catch(() => null)) as Array<{ role?: string }> | null;
    const isStudent = Array.isArray(roles) && roles.some((r) => r.role === "student");
    if (!isStudent) return "allow";
    // 2) onboarding record (Storage-as-DB). No file / no completed_at → block.
    const orr = await fetch(`${url}/storage/v1/object/portal-data/onboarding/${uid}.json`, {
      headers: h, signal: ctrl.signal, cache: "no-store",
    });
    if (orr.status === 200) {
      const doc = (await orr.json().catch(() => null)) as { completed_at?: string } | null;
      return doc && doc.completed_at ? "allow" : "block";
    }
    if (orr.status === 400 || orr.status === 404) return "block"; // object not found
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
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
    // Carry any refreshed Supabase auth cookies written onto `response` by the
    // SSR client's setAll() so a token rotation that coincides with a redirect
    // is not dropped (which would send a stale refresh token next request).
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
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
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  // Mandatory onboarding enforcement. Runs for a signed-in user navigating to a
  // gated activity path. Skips prefetches (the real navigation is caught, and we
  // avoid poisoning the client cache / needless work). A per-user fast-path
  // cookie (value = the user's own id) means the DB/storage check runs at most
  // once per session per browser, so this adds no ongoing latency. The cookie is
  // keyed to the user id so a different account on a SHARED device is re-checked.
  if (user && isGatedActivityPath(pathname) && !isPrefetch) {
    const cookieOk = request.cookies.get(GATE_COOKIE)?.value === user.id;
    if (!cookieOk) {
      const decision = await onboardingGate(user.id);
      if (decision === "block") {
        const url = request.nextUrl.clone();
        url.pathname = "/portal/onboarding";
        url.search = "";
        return protectedRedirect(url);
      }
      if (decision === "allow") {
        response.cookies.set(GATE_COOKIE, user.id, {
          path: "/portal", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12,
        });
      }
      // "unknown" → fail open; the (app) layout gate remains as a second layer.
    }
  }
  return response;
}

export const config = {
  matcher: ["/portal/:path*"],
};
