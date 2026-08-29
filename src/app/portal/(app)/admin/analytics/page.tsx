import { redirect } from "next/navigation";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { AnalyticsClient } from "./analytics-client";

export const metadata = { title: "Rankings & Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isStaff(user.roles)) redirect("/portal");
  return <AnalyticsClient />;
}
