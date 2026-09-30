import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { SatResults } from "@/components/sat/sat-results";

export const metadata = { title: "SAT results", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatResultsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab%2Fresults");
  if (!isExamLabStaff(user.roles)) redirect("/portal");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><ClipboardList size={18} /></span>
        <div>
          <h1 className="font-display text-2xl text-ice">SAT results</h1>
          <p className="text-sm text-dust">Sittings for the SAT-class students you can see</p>
        </div>
      </div>
      <SatResults />
    </div>
  );
}
