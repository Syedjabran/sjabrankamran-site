import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { effectiveRoles } from "@/lib/portal/view-as";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const { roles } = await effectiveRoles(user);
  if (!roles.includes("student")) redirect("/portal");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan/20 bg-cyan/[0.04] px-4 py-3">
        <p className="text-xs text-fog">
          New: your <b className="text-ice">Physics Performance Index</b> breaks your rank down into six pillars and shows exactly how to climb.
        </p>
        <Link href="/portal/my-ranking" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan/40 px-3 py-1.5 text-xs font-semibold text-cyan transition hover:bg-cyan/10">
          <Gauge size={13} /> My Ranking
        </Link>
      </div>
      <LeaderboardClient />
    </div>
  );
}
