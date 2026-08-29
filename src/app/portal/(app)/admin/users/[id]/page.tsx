import { redirect } from "next/navigation";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { UserDetail } from "./user-detail";

export const metadata = { title: "User detail" };
export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isAdmin(user.roles)) redirect("/portal");
  const { id } = await params;
  return <UserDetail id={id} isSuper={user.roles.includes("super_admin")} selfId={user.id} />;
}
