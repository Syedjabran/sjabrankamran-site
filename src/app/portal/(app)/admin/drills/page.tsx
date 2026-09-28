import { redirect } from "next/navigation";
import { getPortalUser, isAdmin, canViewDrillRecords } from "@/lib/edu/auth";
import { DrillRecordsClient } from "./drills-client";
import { portalItem } from "@/lib/portal/subjects";

export const metadata = { title: portalItem("drill-records").menuLabel, robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Every Exam Lab drill/paper allotted, with its frozen paper.
 * Admins see the network; teachers/coordinators/facilitators see only their
 * own drills and their own classes' drills (enforced again in the API).
 */
export default async function AdminDrillsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canViewDrillRecords(user.roles)) redirect("/portal");
  return <DrillRecordsClient scoped={!isAdmin(user.roles)} />;
}
