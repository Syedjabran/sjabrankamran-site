import { PortalNavigation } from "@/components/portal-navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Eye, GraduationCap, LogOut, Settings } from "lucide-react";
import { getPortalUser, ROLE_LABELS, isAdmin, isStaff, isRegistrarOnly, isCoordinatorOnly } from "@/lib/edu/auth";
import { getPortalRestriction } from "@/lib/portal/access-control";
import { onboardingStatus } from "@/lib/portal/onboarding";
import { satAccess } from "@/lib/sat/access";
import { practicalLabAccess } from "@/lib/portal/practical-lab";
import { PRACTICAL_LAB_PAGE } from "@/lib/portal/practical-lab-access";
import { menuFor } from "@/lib/portal/portal-menu";
import { effectiveRoles } from "@/lib/portal/view-as";
import { isEmbeddedClient } from "@/lib/portal/embed";
import { AccessLockMonitor } from "./access-lock-monitor";
import { PresenceBeacon } from "./presence-beacon";
import { PortalAccessBlocked } from "./portal-access-blocked";
import { PwaPortal } from "./pwa-portal";
import { RolePreviewSwitcher } from "./role-preview";
import { NotificationBell } from "./notification-bell";
import { PortalProductTour } from "./portal-product-tour";

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
  // A failed SAT or Practical Lab access read hides that entry (fail closed).
  const [restriction, onboarding, satEnabled, practicalLabEnabled] = await Promise.all([
    getPortalRestriction(user),
    isStudentUser ? onboardingStatus(user.id) : Promise.resolve("complete" as const),
    isStudentUser ? satAccess(user).then((a) => a.ok).catch(() => false) : Promise.resolve(false),
    isStudentUser ? practicalLabAccess(user).then((a) => a.ok).catch(() => false) : Promise.resolve(false),
  ]);
  if (restriction) return <PortalAccessBlocked restriction={restriction} />;

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

  // Attendance Registrar hard-scope: this restricted role may ONLY reach the
  // dashboard and the read-only daily attendance view. Since the role passes
  // isStaff() (so it can read attendance), we must fence it out of every other
  // staff surface here rather than page-by-page.
  if (isRegistrarOnly(user.roles) && pathname) {
    const allowed = [
      "/portal",
      "/portal/admin/attendance-view",
      "/portal/timetable",
      "/portal/install",
      "/portal/settings",
      "/portal/auth",
      "/portal/onboarding",
    ];
    const ok = allowed.some((a) => pathname === a || pathname.startsWith(a + "/"));
    if (!ok) redirect("/portal/admin/attendance-view");
  }
  if (isCoordinatorOnly(user.roles) && pathname) {
    const allowed = ["/portal", "/portal/search", "/portal/coordinator", "/portal/admin/attendance-view", "/portal/timetable", "/portal/library", "/portal/resources", "/portal/notifications", "/portal/install", "/portal/settings", "/portal/auth", PRACTICAL_LAB_PAGE];
    if (!allowed.some((a) => pathname === a || pathname.startsWith(a + "/"))) redirect("/portal/coordinator");
  }

  // Rendered inside the mobile app's WebView, which supplies its own title
  // bar and full role-aware menu — the portal's own header and sidebar would
  // just be a second copy of both.
  const embedded = await isEmbeddedClient();
  const { roles: navRoles, previewing } = await effectiveRoles(user);
  // Role-aware menu, every entry described by the subject registry (portal-menu.ts).
  const navSections = menuFor(navRoles, { sat: satEnabled, practicalLab: practicalLabEnabled });
  const realAdmin = isAdmin(user.roles);
  const roleBadges = user.roles.length
    ? user.roles.map((r) => ROLE_LABELS[r]).join(" · ")
    : "Awaiting role assignment";

  return (
    <div className={embedded ? "px-4 py-5" : "container-x py-8"}>
      <AccessLockMonitor />
      <PresenceBeacon />
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
      <div className="el-noprint mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
            <GraduationCap size={18} />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-ice">
              {user.fullName || user.email}
            </p>
            <p className="text-xs text-dust">{roleBadges}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PortalProductTour autoStart={!mustOnboard} />
          {realAdmin && !previewing ? <RolePreviewSwitcher previewing={null} /> : null}
          {isStaff(user.roles) && !previewing ? (
            <span className="rounded-full border border-emerald2/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald2">
              Staff
            </span>
          ) : null}
          <span data-tour="portal-alerts"><NotificationBell /></span>
          <Link data-tour="portal-profile" href="/portal/settings" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-fog transition hover:border-cyan/40 hover:text-cyan" title="My profile & settings">
            <Settings size={13} /> <span className="hidden sm:inline">Profile</span>
          </Link>
          <form action="/portal/auth/signout" method="post">
            <button type="submit" className="btn-ghost !px-3.5 !py-1.5 text-xs">
              <LogOut size={13} /> Sign out
            </button>
          </form>
        </div>
      </div>
      )}

      <div className={mustOnboard || embedded ? "" : "grid gap-6 lg:grid-cols-[13rem_1fr] lg:gap-8"}>
        {embedded || mustOnboard ? null : <PortalNavigation sections={navSections} />}
        <div id="portal-content" tabIndex={-1} className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
