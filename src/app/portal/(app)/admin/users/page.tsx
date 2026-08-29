import { redirect } from "next/navigation";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { UsersConsole } from "./users-console";

export const metadata = { title: "User management" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isAdmin(user.roles)) redirect("/portal");
  return <UsersConsole />;
}
