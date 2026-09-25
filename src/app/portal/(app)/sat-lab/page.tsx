import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { SatHub } from "@/components/sat/sat-hub";

export const metadata = { title: "SAT Lab", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatLabPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab");
  const access = await satAccess(user);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><GraduationCap size={18} /></span>
        <div><h1 className="font-display text-2xl text-ice">SAT Lab</h1><p className="text-sm text-dust">Official College Board questions · digital SAT format</p></div>
      </div>
      {access.ok ? <SatHub isStaff={access.isStaff} /> : (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="font-display text-lg text-ice">SAT isn&rsquo;t part of your courses yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fog">Your teacher enrols you into an SAT class to open the SAT Lab.</p>
        </div>
      )}
    </div>
  );
}
