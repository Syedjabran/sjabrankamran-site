import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getPortalRestriction } from "@/lib/portal/access-control";
import { onboardingStatus } from "@/lib/portal/onboarding";
import { viewerNav } from "@/lib/portal/viewer-nav";
import { appNavigation } from "@/lib/portal/app-nav";
import { portalItem } from "@/lib/portal/subjects";
import { LAB_ARCHIVED_MESSAGE } from "@/lib/portal/practical-lab-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * GET -- the signed-in viewer's subject-first navigation for the mobile app
 * (app-nav.ts): their subject spaces with each space's modules, General and
 * Administration, each place with its id, name, lucide icon, portal route,
 * purpose and the app's native screen for it (null: the app opens the route
 * in its WebView).
 *
 * Built from the same `viewerNav` the portal layout draws its own navigation
 * from, so it lists exactly what this viewer may see there -- no second list.
 * Cookie or `Authorization: Bearer` (a native client with no session cookie):
 * getPortalUser() accepts both, and the middleware's access-lock gate runs
 * for both before this handler. The lock and the suspended status are checked
 * here too, as the portal layout checks them, so a gate that couldn't decide
 * in time (it fails open) still never hands a locked account its navigation.
 */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });

  const isStudent = user.roles.includes("student");
  const [restriction, viewer, onboarding] = await Promise.all([
    getPortalRestriction(user),
    viewerNav(user),
    isStudent ? onboardingStatus(user.id) : Promise.resolve("complete" as const),
  ]);
  if (restriction) {
    // The middleware's locked-account reply (middleware.ts accessRestrictedResponse).
    return NextResponse.json({
      error: restriction.message,
      code: "PORTAL_ACCESS_RESTRICTED",
      restriction: { mode: restriction.mode, scopeLabel: restriction.scopeLabel, endsAt: restriction.endsAt },
    }, { status: 423, headers: NO_STORE });
  }
  if (user.status === "archived") {
    return NextResponse.json({ error: LAB_ARCHIVED_MESSAGE, code: "PORTAL_ACCESS_SUSPENDED" }, { status: 403, headers: NO_STORE });
  }

  // An onboarding record that can't be read opens the portal (the layout's rule).
  const onboardingRoute = isStudent && onboarding === "incomplete" ? portalItem("onboarding").route : null;
  return NextResponse.json(
    appNavigation(viewer.nav, { subjectsUnavailable: viewer.subjectsUnavailable, onboardingRoute }),
    { status: 200, headers: NO_STORE },
  );
}
