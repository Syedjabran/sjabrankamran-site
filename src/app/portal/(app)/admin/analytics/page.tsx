import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { AnalyticsClient } from "./analytics-client";

export const metadata = { title: "Rankings & Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isStaff(user.roles)) redirect("/portal");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan/20 bg-cyan/[0.04] px-4 py-3">
        <p className="text-xs text-fog">
          This page uses the <b className="text-ice">legacy composite</b> (accuracy 60 · level 25 · attendance 15). The new six-pillar{" "}
          <b className="text-ice">Physics Performance Index</b> lives on My Ranking.
        </p>
        <Link href="/portal/my-ranking" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan/40 px-3 py-1.5 text-xs font-semibold text-cyan transition hover:bg-cyan/10">
          <Gauge size={13} /> Open PPI table
        </Link>
      </div>
      <AnalyticsClient />
    </div>
  );
}
