import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, GraduationCap } from "lucide-react";
import { getPortalUser, ROLE_LABELS, isAdmin, isStaff, type EduRole } from "@/lib/edu/auth";

export const metadata = { robots: { index: false } };

function navFor(roles: EduRole[]) {
  const items: { href: string; label: string }[] = [{ href: "/portal", label: "Dashboard" }];
  if (isAdmin(roles)) {
    items.push(
      { href: "/portal/admin/users", label: "Users & Roles" },
      { href: "/portal/admin/academics", label: "Academics" },
      { href: "/portal/admin/finance", label: "Fees & Finance" }
    );
  }
  if (isAdmin(roles) || roles.includes("teacher") || roles.includes("teaching_assistant")) {
    items.push({ href: "/portal/teach", label: "My Classes" });
  }
  if (isStaff(roles)) {
    items.push({ href: "/portal/studio", label: "Physics Studio" });
  }
  items.push({ href: "/portal/exam-lab", label: "Exam Lab" });
  if (roles.includes("student")) {
    items.push({ href: "/portal/learn", label: "My Learning" });
  }
  if (roles.includes("parent")) {
    items.push({ href: "/portal/family", label: "My Children" });
  }
  return items;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");

  const nav = navFor(user.roles);
  const roleBadges = user.roles.length
    ? user.roles.map((r) => ROLE_LABELS[r]).join(" · ")
    : "Awaiting role assignment";

  return (
    <div className="container-x py-8">
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
          {isStaff(user.roles) ? (
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

      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Portal navigation" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col">
            {nav.map((item) => (
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
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
