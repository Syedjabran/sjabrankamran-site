import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChartColumn } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { ProgressView } from "@/components/sat/coach/progress-view";

export const metadata = { title: "SAT progress", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatProgressPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab%2Fprogress");
  // satAccess throws when the enrolment read fails -- never shown as "SAT
  // isn't part of your courses".
  const access = await satAccess(user).catch(() => null);
  if (!access) return <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">Your access couldn&rsquo;t be checked just now. Please refresh.</p>;
  // Staff have no personal analytics; without SAT the hub says why.
  if (!access.ok || access.isStaff) redirect("/portal/sat-lab");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><ChartColumn size={18} /></span>
        <div className="min-w-0"><h1 className="font-display text-2xl text-ice">Your SAT progress</h1><p className="text-sm text-dust">Every finished drill, practice test and mock exam</p></div>
        <Link href="/portal/sat-lab" className="btn-ghost ml-auto !px-3 !py-1.5 text-xs"><ArrowLeft size={14} /> SAT Lab</Link>
      </div>
      <ProgressView />
    </div>
  );
}
