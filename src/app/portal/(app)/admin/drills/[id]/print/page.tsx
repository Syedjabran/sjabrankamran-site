import { redirect } from "next/navigation";
import { getPortalUser, canViewDrillRecords } from "@/lib/edu/auth";
import { DrillPrintClient } from "./print-client";

export const metadata = { title: "Print drill", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Printable / downloadable question paper for one stored drill.
 *
 * `id` is whatever the existing drill endpoint accepts — the internal drill id
 * OR the human reference number (DR-YYMM-XXXX) — so a drill is reachable
 * straight from the reference staff were given:
 *   /portal/admin/drills/DR-2609-K7QM/print
 *
 * This page only checks that the viewer may see drill records at all. The
 * record itself is fetched client-side from
 * /api/portal/admin/drills/[id], which is the single place that resolves the
 * record and applies class-scoping for non-admin staff — no second, weaker
 * gate is introduced here.
 */
export default async function DrillPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canViewDrillRecords(user.roles)) redirect("/portal");
  const { id } = await params;
  return <DrillPrintClient idOrRef={decodeURIComponent(id || "")} />;
}
