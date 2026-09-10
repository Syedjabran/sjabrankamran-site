import { redirect } from "next/navigation";
import { isSuperAdmin, requireAdmin } from "@/lib/portal/admin";
import { DemoAccessClient } from "./demo-access-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Private demo-student access" };

export default async function DemoStudentAccessPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/portal/login");
  if (!isSuperAdmin(admin)) redirect("/portal");
  return <DemoAccessClient />;
}
