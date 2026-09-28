import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { Eye } from "lucide-react";
import { getPortalUser, ROLE_LABELS, isAdmin, isStaff, isRegistrarOnly, isCoordinatorOnly } from "@/lib/edu/auth";
import { getPortalRestriction } from "@/lib/portal/access-control";
import { onboardingStatus } from "@/lib/portal/onboarding";
import { HelperViewerCourses } from "@/components/helper-viewer";
import { deskRoutes, onDeskRoute } from "@/lib/portal/portal-nav";
import { viewerNav } from "@/lib/portal/viewer-nav";
import { SPACE_COOKIE } from "@/lib/portal/space-cookie";
import { isEmbeddedClient } from "@/lib/portal/embed";
import { AccessLockMonitor } from "./access-lock-monitor";
import { PresenceBeacon } from "./presence-beacon";
import { PortalAccessBlocked } from "./portal-access-blocked";
import { PwaPortal } from "./pwa-portal";
import { RolePreviewSwitcher } from "./role-preview";
import { PortalTopBar } from "./portal-top-bar";

export const metadata = { robots: { index: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");

  // Application-level restrictions deliberately keep Supabase authentication
  // alive: the user signs in successfully, then sees the configured lock
  // message instead of any portal activity. Super admins always bypass this.
  // The onboarding check is independent, so both round-trips run concurrently
  // — this layout re-executes on every portal tab navigation.
  const pathname = (await headers()).get("x-pathname") || "";
  const isStudentUser = user.roles.includes("student");
  // The viewer's navigation (viewer-nav.ts): a student's course access is
  // read once (strict, as satAccess reads it) with their Practical Lab switch;
  // a failed read opens nothing (fail closed). It also tells the helper which
  // courses they take.
  const [restriction, onboarding, viewer] = await Promise.all([
    getPortalRestriction(user),
    isStudentUser ? onboardingStatus(user.id) : Promise.resolve("complete" as const),
    viewerNav(user),
  ]);
  if (restriction) return <PortalAccessBlocked restriction={restriction} />;
  const { nav, courseAccess, previewing } = viewer;

  // Suspended accounts: block all portal activity immediately (in addition to
  // the GoTrue ban that stops new sign-ins / token refresh).
  if (user.status === "archived") {
    return (
      <div className="container-x py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-signal/30 bg-signal/5 p-8 text-center">
          <h1 className="text-xl font-semibold text-ice">Access suspended</h1>
          <p className="mt-2 text-sm text-fog">Your portal access has been paused. Please contact your teacher at physics@sjabrankamran.com if you believe this is a mistake.</p>
          <form action="/portal/auth/signout" method="post" className="mt-5">
            <button type="submit" className="btn-ghost !px-4 !py-2 text-xs">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  // Mandatory onboarding gate: a student cannot use ANY activity until their
  // required profile (incl. a valid parent email) is complete. An unreadable
  // record fails open (as the middleware does) rather than re-showing the form.
  const mustOnboard = isStudentUser && onboarding === "incomplete";
  if (mustOnboard && !pathname.startsWith("/portal/onboarding")) {
    redirect("/portal/onboarding");
  }

  // Desk hard-scope: an attendance registrar, or a coordinator/facilitator,
  // with no fuller role may ONLY reach the pages their own navigation offers
  // (their desk, its subject space, General) plus sign-in and onboarding --
  // portal-nav.ts `deskRoutes`. Both roles pass isStaff() for what they do
  // read, so they are fenced out of every other staff surface here rather
  // than page-by-page. The portal home matches only exactly (it used to match
  // every portal path as a prefix, so this fence never fired).
  if ((isRegistrarOnly(user.roles) || isCoordinatorOnly(user.roles)) && pathname && !onDeskRoute(pathname, deskRoutes(nav))) {
    redirect(nav.homeHref);
  }

  // Rendered inside the mobile app's WebView, which supplies its own title
  // bar and full role-aware menu — the portal's own top bar would just be a
  // second copy of both.
  const embedded = await isEmbeddedClient();
  const realAdmin = isAdmin(user.roles);
  const roleBadges = user.roles.length
    ? user.roles.map((r) => ROLE_LABELS[r]).join(" · ")
    : "Awaiting role assignment";
  // The space the viewer last opened (the top bar remembers it), when it is
  // still one of theirs.
  const rememberedId = (await cookies()).get(SPACE_COOKIE)?.value;
  const remembered = nav.spaces.find((s) => s.id === rememberedId)?.id ?? null;

  return (
    <div className={embedded ? "px-4 py-5" : "container-x py-6 sm:py-8"}>
      <AccessLockMonitor />
      <PresenceBeacon />
      {/* A student's own courses (staff teach every course: the helper keeps its default). */}
      <HelperViewerCourses courses={courseAccess && !courseAccess.isStaff ? courseAccess.allowed : []} />
      <PwaPortal showInstallCard={!mustOnboard && !embedded} />
      {previewing ? (
        <div className="el-noprint mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs text-amber-300">
            <Eye size={14} /> Preview mode — viewing the portal as a <b>{ROLE_LABELS[previewing]}</b>. Data is limited to your own account.
          </p>
          <RolePreviewSwitcher previewing={previewing} />
        </div>
      ) : null}
      {embedded ? null : (
        <PortalTopBar
          nav={nav}
          remembered={remembered}
          navigable={!mustOnboard}
          tourAutoStart={!mustOnboard}
          user={{ name: user.fullName || user.email, roles: roleBadges, staff: isStaff(user.roles) && !previewing }}
          rolePreview={realAdmin && !previewing}
        />
      )}
      <div id="portal-content" tabIndex={-1} className="min-w-0">{children}</div>
    </div>
  );
}
