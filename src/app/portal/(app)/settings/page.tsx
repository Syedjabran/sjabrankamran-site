import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "My Profile & Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  return <SettingsClient />;
}
