import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LogOut, GraduationCap } from "lucide-react";
import { getPortalUser, ROLE_LABELS, isAdmin, isStaff, type EduRole } from "@/lib/edu/auth";
import { isOnboardingComplete } from "@/lib/portal/onboarding";
import { effectiveRoles } from "@/lib/portal/view-as";
import { PresenceBeacon } from "./presence-beacon";
import { RolePreviewSwitcher } from "./role-preview";
import { Eye } from "lucide-react";

export const metadata = { robots: { index: false } };

type NavItem = { href: string; label: string };
type NavSection = { title?: string; items: NavItem[] };

/**
 * Role-aware navigation, grouped so the owner/staff see an Administration
 * console and only actual students see the personal Learning surfaces
 * (Exam Lab / My Learning / My Progress). This prevents the owner being shown
 * their own quiz attempts as if they were a student.
 */
function navFor(roles: EduRole[]): NavSection[] {
  const staff = isStaff(roles);
  const admin = isAdmin(roles);
  const isStudent = roles.includes("student");
  const isParent = roles.includes("parent");
  const sections: NavSection[] = [];

  // --- Administration (staff / owner) ---
  const adminItems: NavItem[] = [{ href: "/portal", label: "Dashboard" }];
  if (staff) {
    adminItems.push({ href: "/portal/admin/users", label: "Users & activity" });
    adminItems.push({ href: "/portal/admin/analytics", label: "Rankings & analytics" });
    adminItems.push({ href: "/portal/admin/institutions", label: "Institutions" });
    adminItems.push({ href: "/portal/admin/assign", label: "Post / Tests" });
    adminItems.push({ href: "/portal/admin/mail", label: "Email" });
  }
  if (admin) {
    adminItems.push({ href: "/portal/admin/academics", label: "Academics" });
    adminItems.push({ href: "/portal/admin/finance", label: "Fees & Finance" });
  }
  if (admin || roles.includes("teacher") || roles.includes("teaching_assistant")) {
    adminItems.push({ href: "/portal/teach", label: "My Classes" });
  }
  if (staff) adminItems.push({ href: "/portal/studio", label: "Physics Studio" });
  sections.push({ title: staff ? "Administration" : undefined, items: adminItems });

  // --- Learning (students only) + parents ---
  const learnItems: NavItem[] = [];
  if (isStudent) {
    learnItems.push({ href: "/portal/exam-lab", label: "Exam Lab" });
    learnItems.push({ href: "/portal/learn", label: "My Learning" });
    learnItems.push({ href: "/portal/progress", label: "My Progress" });
  }
  if (isParent) learnItems.push({ href: "/portal/family", label: "My Children" });
  if (learnItems.length) sections.push({ title: staff ? "Learning" : undefined, items: learnItems });

  return sections;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");

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
  // required profile (incl. a valid parent email) is complete.
  const pathname = (await headers()).get("x-pathname") || "";
  const mustOnboard = user.roles.includes("student") && !(await isOnboardingComplete(user.id));
  if (mustOnboard && !pathname.startsWith("/portal/onboarding")) {
    redirect("/portal/onboarding");
  }

  const { roles: navRoles, previewing } = await effectiveRoles(user);
  const navSections = navFor(navRoles);
  const realAdmin = isAdmin(user.roles);
  const roleBadges = user.roles.length
    ? user.roles.map((r) => ROLE_LABELS[r]).join(" · ")
    : "Awaiting role assignment";

  return (
    <div className="container-x py-8">
      <PresenceBeacon />
      {previewing ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs text-amber-300">
            <Eye size={14} /> Preview mode — viewing the portal as a <b>{ROLE_LABELS[previewing]}</b>. Data is limited to your own account.
          </p>
          <RolePreviewSwitcher previewing={previewing} />
        </div>
      ) : null}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
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
          {realAdmin && !previewing ? <RolePreviewSwitcher previewing={null} /> : null}
          {isStaff(user.roles) && !previewing ? (
            <span className="rounded-full border border-emerald2/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald2">
              Staff
            </span>
          ) : null}
          <form action="/portal/auth/signout" method="post">
            <button type="submit" className="btn-ghost !px-3.5 !py-1.5 text-xs">
              <LogOut size={13} /> Sign out
            </button>
          </form>
        </div>
      </div>

      <div className={mustOnboard ? "" : "grid gap-8 lg:grid-cols-[13rem_1fr]"}>
        <nav aria-label="Portal navigation" className={"lg:sticky lg:top-24 lg:self-start" + (mustOnboard ? " hidden" : "")}>
          <div className="space-y-5">
            {navSections.map((section, si) => (
              <div key={si}>
                {section.title ? (
                  <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-widelabel text-dust/70">{section.title}</p>
                ) : null}
                <ul className="flex flex-wrap gap-2 lg:flex-col">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-xl border border-white/10 bg-space/60 px-3.5 py-2 text-sm text-fog transition hover:border-cyan/40 hover:text-ice"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
