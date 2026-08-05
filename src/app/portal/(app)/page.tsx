import Link from "next/link";
import {
  Users,
  School,
  BookOpen,
  Receipt,
  AlertTriangle,
  Hourglass,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";

export const metadata = { title: "Portal Dashboard" };

async function count(table: string, filter?: (q: unknown) => unknown): Promise<number | null> {
  try {
    const supabase = await createClient();
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) query = filter(query) as typeof query;
    const { count: c, error } = await query;
    if (error) return null;
    return c ?? 0;
  } catch {
    return null;
  }
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | null; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="card-hover rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-dust">{label}</p>
        <Icon size={16} className="text-cyan" />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold text-ice">
        {value === null ? "—" : value}
      </p>
    </div>
  );
}

export default async function PortalDashboard() {
  const user = await getPortalUser();
  if (!user) return null;

  // No roles yet → honest waiting state.
  if (user.roles.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
        <Hourglass size={22} className="mx-auto text-cyan" />
        <h1 className="mt-4 text-xl font-semibold text-ice">Account created — awaiting access</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fog">
          Your account exists but no portal role has been assigned yet. An administrator will
          link your account to a student, parent or staff profile. If this takes longer than
          expected, please <Link href="/contact" className="text-cyan hover:underline">contact us</Link>.
        </p>
      </div>
    );
  }

  if (isAdmin(user.roles)) {
    const [students, activeStudents, classes, teachers, unpaid, enquiries] = await Promise.all([
      count("edu_students"),
      count("edu_students", (q) => (q as { eq: (c: string, v: string) => unknown }).eq("admission_status", "active")),
      count("edu_classes"),
      count("edu_teachers"),
      count("edu_invoices", (q) => (q as { in: (c: string, v: string[]) => unknown }).in("status", ["sent", "partially_paid", "overdue"])),
      count("edu_students", (q) => (q as { eq: (c: string, v: string) => unknown }).eq("admission_status", "enquiry")),
    ]);

    const schemaMissing = students === null;

    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold text-ice">Admin dashboard</h1>

        {schemaMissing ? (
          <div className="flex items-start gap-3 rounded-2xl border border-signal/30 bg-signal/5 p-5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-signal" />
            <div>
              <p className="text-sm font-semibold text-ice">Database foundation not initialised</p>
              <p className="mt-1 text-sm leading-relaxed text-fog">
                The portal schema (migration <code className="font-mono text-xs">edu-001-foundation.sql</code>)
                has not been applied to Supabase yet. Run it in the SQL Editor and refresh this page.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label="Students" value={students} icon={Users} />
          <StatCard label="Active students" value={activeStudents} icon={Users} />
          <StatCard label="Open enquiries" value={enquiries} icon={BookOpen} />
          <StatCard label="Classes" value={classes} icon={School} />
          <StatCard label="Teachers" value={teachers} icon={Users} />
          <StatCard label="Unpaid invoices" value={unpaid} icon={Receipt} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-dust">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/portal/admin/users" className="btn-ghost text-xs">Manage users &amp; roles</Link>
            <Link href="/portal/admin/academics" className="btn-ghost text-xs">Programmes &amp; classes</Link>
            <Link href="/portal/admin/finance" className="btn-ghost text-xs">Fees &amp; invoices</Link>
          </div>
        </div>
      </div>
    );
  }

  // Teacher / student / parent home — scoped modules arrive in the next stages.
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ice">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
      <div className="rounded-2xl border border-white/10 bg-space/60 p-6">
        <p className="text-sm leading-relaxed text-fog">
          Your portal area is being prepared. Modules for your role
          {user.roles.includes("teacher") ? " (class management, attendance, marking)" : ""}
          {user.roles.includes("student") ? " (timetable, assignments, results, Physics Studio AI)" : ""}
          {user.roles.includes("parent") ? " (attendance, progress, fees)" : ""}
          {" "}are rolling out in the next update. Your account and access rights are already active.
        </p>
      </div>
    </div>
  );
}
