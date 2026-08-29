import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { LibraryClient } from "./library-client";

export const metadata = { title: "Resource Library & Community" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  return <LibraryClient isAdmin={user.roles.includes("super_admin") || user.roles.includes("admin")} />;
}
