import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, SlidersHorizontal } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { readProfile } from "@/lib/sat/coach/profile-store";
import { SatHub } from "@/components/sat/sat-hub";

export const metadata = { title: "SAT Lab", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatLabPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab");
  // satAccess throws when the enrolment read fails -- never shown as "SAT
  // isn't part of your courses".
  const access = await satAccess(user).catch(() => null);
  // Students set up their SAT profile first (staff have none). A failed
  // profile read is not "no profile": the hub still opens.
  const student = !!access?.ok && !access.isStaff;
  const profile = student ? await readProfile(user.id).catch(() => undefined) : undefined;
  if (student && profile === null) redirect("/portal/sat-lab/setup");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><GraduationCap size={18} /></span>
        <div className="min-w-0"><h1 className="font-display text-2xl text-ice">SAT Lab</h1><p className="text-sm text-dust">Official College Board questions · digital SAT format</p></div>
        {profile ? (
          <Link href="/portal/sat-lab/settings" className="btn-ghost ml-auto !px-3 !py-1.5 text-xs"><SlidersHorizontal size={14} /> SAT settings</Link>
        ) : null}
      </div>
      {!access ? (
        <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">Your access couldn&rsquo;t be checked just now. Please refresh.</p>
      ) : access.ok ? <SatHub isStaff={access.isStaff} /> : (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="mx-auto max-w-md font-display text-lg text-ice">SAT isn&rsquo;t enabled for your account yet — ask the admin to add Digital SAT to your subjects.</p>
        </div>
      )}
    </div>
  );
}
