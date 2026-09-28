import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { NotificationsClient } from "./notifications-client";
import { portalItem } from "@/lib/portal/subjects";

export const metadata = { title: portalItem("notifications").menuLabel };
export const dynamic = "force-dynamic";

/** Full Notification Centre — every signed-in portal user (students, parents,
 * staff). Registrar-only users are fenced out by the layout's allowed-path
 * guard, matching their deliberately minimal surface. */
export default async function NotificationsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  return <NotificationsClient />;
}
