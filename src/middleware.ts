import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_CONTROL_BUCKET,
  ACCESS_CONTROL_PATH,
  classScopeKey,
  emptyAccessControl,
  findApplicableRestriction,
  isRestrictionActive,
  type AccessControlDocument,
  type AccessRestriction,
} from "@/lib/portal/access-shared";
import {
  PORTAL_BUCKET, cacheBuster, isOnboardingDocComplete, onboardingPath, type Onboarding,
} from "@/lib/portal/onboarding-shared";

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
const GATE_COOKIE = "pb_onb";
const GATE_VERSION = "v2"; // guardian details + student photo required
const ACCESS_TIMEOUT_MS = 2800;

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
    // 2) onboarding record (Storage-as-DB). No file / incomplete → block.
    // Cache-busted: a plain read can return a stale pre-submission copy for a
    // long time after the student saves, re-gating them on every login.
    const orr = await fetch(`${url}/storage/v1/object/${PORTAL_BUCKET}/${onboardingPath(uid)}?cb=${cacheBuster()}`, {
      headers: h, signal: ctrl.signal, cache: "no-store",
    });
    if (orr.status === 200) {
      const doc = (await orr.json().catch(() => null)) as Partial<Onboarding> | null;
      // Same rule as the portal layout, or one gate clears a student the other bounces.
      return isOnboardingDocComplete(doc) ? "allow" : "block";
    }
    if (orr.status === 404) return "block"; // object not found
    if (orr.status === 400) return /not.?found/i.test(await orr.text().catch(() => "")) ? "block" : "unknown";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

type AccessGateResult =
  | { decision: "allow" | "unknown"; restriction: null }
  | { decision: "block"; restriction: AccessRestriction };

/**
 * Edge-safe access lookup for API enforcement. The canonical blocked screen is
 * rendered by the portal layout; this gate prevents old tabs or direct HTTP
 * calls from performing portal activity while a restriction is active.
 */
async function portalAccessGate(uid: string): Promise<AccessGateResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { decision: "unknown", restriction: null };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ACCESS_TIMEOUT_MS);
  const h = { apikey: key, Authorization: `Bearer ${key}` } as Record<string, string>;
  try {
    const [rolesResponse, accessResponse] = await Promise.all([
      fetch(`${url}/rest/v1/edu_user_roles?user_id=eq.${uid}&select=role`, {
        headers: h, signal: ctrl.signal, cache: "no-store",
      }),
      fetch(`${url}/storage/v1/object/${ACCESS_CONTROL_BUCKET}/${ACCESS_CONTROL_PATH}`, {
        headers: h, signal: ctrl.signal, cache: "no-store",
      }),
    ]);
    if (!rolesResponse.ok) return { decision: "unknown", restriction: null };
    const rolesRows = await rolesResponse.json().catch(() => null) as Array<{ role?: string }> | null;
    const roles = Array.isArray(rolesRows) ? rolesRows.map((r) => r.role || "").filter(Boolean) : [];
    if (roles.includes("super_admin")) return { decision: "allow", restriction: null };

    let doc: AccessControlDocument;
    if (accessResponse.ok) {
      const parsed = await accessResponse.json().catch(() => null) as AccessControlDocument | null;
      doc = parsed?.version === 1 && Array.isArray(parsed.restrictions) ? parsed : emptyAccessControl();
    } else if ([400, 404].includes(accessResponse.status)) {
      return { decision: "allow", restriction: null };
    } else {
      return { decision: "unknown", restriction: null };
    }
    if (!doc.restrictions.some((r) => isRestrictionActive(r))) {
      return { decision: "allow", restriction: null };
    }

    // A direct user restriction can be decided without any membership calls.
    const direct = findApplicableRestriction(doc, { userId: uid, roles, classIds: [], schools: [] });
    if (direct) return { decision: "block", restriction: direct };

    const studentSelect = encodeURIComponent("id,school,edu_enrolments(class_id,status,edu_classes(room))");
    const teacherSelect = encodeURIComponent("id,edu_classes(id,room)");
    const guardianSelect = encodeURIComponent("id,edu_student_guardians(edu_students(school,edu_enrolments(class_id,status,edu_classes(room))))");
    const needsClassRegistry = doc.restrictions.some((r) => r.scopeType === "class" && isRestrictionActive(r));
    const [studentResponse, teacherResponse, guardianResponse, registryResponse] = await Promise.all([
      fetch(`${url}/rest/v1/edu_students?profile_id=eq.${uid}&select=${studentSelect}`, { headers: h, signal: ctrl.signal, cache: "no-store" }),
      fetch(`${url}/rest/v1/edu_teachers?profile_id=eq.${uid}&select=${teacherSelect}`, { headers: h, signal: ctrl.signal, cache: "no-store" }),
      fetch(`${url}/rest/v1/edu_guardians?profile_id=eq.${uid}&select=${guardianSelect}`, { headers: h, signal: ctrl.signal, cache: "no-store" }),
      needsClassRegistry
        ? fetch(`${url}/storage/v1/object/portal-data/institutions.json`, { headers: h, signal: ctrl.signal, cache: "no-store" })
        : Promise.resolve(null),
    ]);
    if (!studentResponse.ok || !teacherResponse.ok || !guardianResponse.ok) {
      return { decision: "unknown", restriction: null };
    }
    type StudentRow = {
      school?: string | null;
      edu_enrolments?: Array<{
        class_id?: string;
        status?: string;
        edu_classes?: { room?: string | null } | null;
      }>;
    };
    type TeacherRow = { edu_classes?: Array<{ id?: string; room?: string | null }> };
    type GuardianRow = { edu_student_guardians?: Array<{ edu_students?: StudentRow | null }> };
    const [rows, teacherRows, guardianRows] = await Promise.all([
      studentResponse.json().catch(() => []) as Promise<StudentRow[]>,
      teacherResponse.json().catch(() => []) as Promise<TeacherRow[]>,
      guardianResponse.json().catch(() => []) as Promise<GuardianRow[]>,
    ]);
    const classIds = new Set<string>();
    const schools = new Set<string>();
    const absorbStudent = (row: StudentRow | null | undefined) => {
      if (!row) return;
      if (row.school?.trim()) schools.add(row.school.trim());
      for (const enrolment of row.edu_enrolments || []) {
        if (enrolment.status !== "active") continue;
        if (enrolment.class_id) classIds.add(enrolment.class_id);
        if (enrolment.edu_classes?.room?.trim()) schools.add(enrolment.edu_classes.room.trim());
      }
    };
    for (const row of Array.isArray(rows) ? rows : []) absorbStudent(row);
    for (const teacher of Array.isArray(teacherRows) ? teacherRows : []) {
      for (const cls of teacher.edu_classes || []) {
        if (cls.id) classIds.add(cls.id);
        if (cls.room?.trim()) schools.add(cls.room.trim());
      }
    }
    for (const guardian of Array.isArray(guardianRows) ? guardianRows : []) {
      for (const link of guardian.edu_student_guardians || []) absorbStudent(link.edu_students);
    }
    let classKeys: string[] = [];
    if (registryResponse?.ok) {
      const registry = await registryResponse.json().catch(() => null) as {
        classes?: Array<{ id?: string; school?: string; year?: string }>;
      } | null;
      classKeys = [...new Set((registry?.classes || [])
        .filter((c) => !!c.id && classIds.has(c.id))
        .map((c) => classScopeKey(c.school || "", c.year || ""))
        .filter((key) => key !== classScopeKey("", "")))];
    }

    // Coordinator/facilitator/registrar school assignment is stored privately
    // outside edu_students and must inherit school-wide restrictions too.
    if (roles.some((r) => ["coordinator", "facilitator", "attendance_registrar"].includes(r))
      && doc.restrictions.some((r) => r.scopeType === "school" && isRestrictionActive(r))) {
      const staffSchoolResponse = await fetch(`${url}/storage/v1/object/portal-data/staff-schools/${uid}.json`, {
        headers: h, signal: ctrl.signal, cache: "no-store",
      });
      if (staffSchoolResponse.ok) {
        const staffSchool = await staffSchoolResponse.json().catch(() => null) as { school?: string } | null;
        if (staffSchool?.school?.trim()) schools.add(staffSchool.school.trim());
      }
    }

    const restriction = findApplicableRestriction(doc, {
      userId: uid,
      roles,
      classIds: [...classIds],
      classKeys,
      schools: [...schools],
    });
    return restriction
      ? { decision: "block", restriction }
      : { decision: "allow", restriction: null };
  } catch {
    return { decision: "unknown", restriction: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const { pathname } = request.nextUrl;
  const isPortalApi = pathname.startsWith("/api/portal") || pathname.startsWith("/api/exam-lab") || pathname.startsWith("/api/sat");
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
  const isAccessStatusApi = pathname === "/api/portal/access-status";

  // Fast path: no Supabase auth cookie → the visitor is definitely signed out.
  // Skip the Auth network round-trip entirely (this is what occasionally hung).
  if (!hasAuthCookie(request)) {
    // Portal API routes perform their own cookie/service-key authentication and
    // must return JSON rather than an HTML login redirect.
    if (isPortalApi) return response;
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

  if (!user && !isPublicAuthPath) return isPortalApi ? response : toLogin();

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

  // Gate every authenticated portal API request (including GET data reads) and
  // any non-GET portal action. The status endpoint is deliberately reachable so
  // already-open tabs can discover a new lock and hard-navigate to the blocked
  // screen. Public/service-key requests without a user cookie stay route-gated.
  if (user && !isAccessStatusApi && (isPortalApi || !["GET", "HEAD"].includes(request.method))) {
    const access = await portalAccessGate(user.id);
    if (access.decision === "block") {
      return NextResponse.json({
        error: access.restriction.message,
        code: "PORTAL_ACCESS_RESTRICTED",
        restriction: {
          mode: access.restriction.mode,
          scopeLabel: access.restriction.scopeLabel,
          endsAt: access.restriction.endsAt,
        },
      }, { status: 423, headers: { "cache-control": "no-store" } });
    }
  }

  // Mandatory onboarding enforcement. Runs for a signed-in user navigating to a
  // gated activity path. Skips prefetches (the real navigation is caught, and we
  // avoid poisoning the client cache / needless work). A per-user fast-path
  // cookie (value = the user's own id) means the DB/storage check runs at most
  // once per session per browser, so this adds no ongoing latency. The cookie is
  // keyed to the user id so a different account on a SHARED device is re-checked.
  if (user && isGatedActivityPath(pathname) && !isPrefetch) {
    const cookieOk = request.cookies.get(GATE_COOKIE)?.value === `${GATE_VERSION}:${user.id}`;
    if (!cookieOk) {
      const decision = await onboardingGate(user.id);
      if (decision === "block") {
        const url = request.nextUrl.clone();
        url.pathname = "/portal/onboarding";
        url.search = "";
        return protectedRedirect(url);
      }
      if (decision === "allow") {
        response.cookies.set(GATE_COOKIE, `${GATE_VERSION}:${user.id}`, {
          path: "/portal", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12,
        });
      }
      // "unknown" → fail open; the (app) layout gate remains as a second layer.
    }
  }
  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/api/portal/:path*", "/api/exam-lab/:path*", "/api/sat/:path*"],
};
