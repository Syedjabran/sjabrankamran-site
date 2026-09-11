import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { AccessControlConsole } from "./access-control-console";

export const metadata = { title: "Portal access locks" };
export const dynamic = "force-dynamic";

export default async function AccessControlPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("super_admin")) redirect("/portal");
  return <AccessControlConsole />;
}
