import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { ResourcesClient } from "./resources-client";

export const metadata = { title: "Physics Resources" };

export default async function ResourcesPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const isSuper = user.roles.includes("super_admin");
  return <ResourcesClient isSuper={isSuper} />;
}
