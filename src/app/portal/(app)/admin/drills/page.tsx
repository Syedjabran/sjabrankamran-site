import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { DrillRecordsClient } from "./drills-client";

export const metadata = { title: "Drill Records", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Super-admin: every Exam Lab drill/paper allotted, with its frozen paper. */
export default async function AdminDrillsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("super_admin")) redirect("/portal");
  return <DrillRecordsClient />;
}
