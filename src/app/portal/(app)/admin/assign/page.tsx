import { redirect } from "next/navigation";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { AssignForm } from "./assign-form";

export const metadata = { title: "Post assignment / test" };
export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isStaff(user.roles)) redirect("/portal");
  return <AssignForm />;
}
