import { redirect } from "next/navigation";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { NotifyComposer } from "./notify-client";

export const metadata = { title: "Send announcement" };
export const dynamic = "force-dynamic";

/** Admin-only broadcast composer — pushes an announcement into every targeted
 * user's Notification Centre (bell + /portal/notifications). */
export default async function NotifyPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isAdmin(user.roles)) redirect("/portal");
  return <NotifyComposer />;
}
