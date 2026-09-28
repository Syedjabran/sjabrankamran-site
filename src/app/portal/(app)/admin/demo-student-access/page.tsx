import { redirect } from "next/navigation";
import { isSuperAdmin, requireAdmin } from "@/lib/portal/admin";
import { DemoAccessClient } from "./demo-access-client";
import { portalItem } from "@/lib/portal/subjects";

export const dynamic = "force-dynamic";
export const metadata = { title: portalItem("demo-student-access").menuLabel };

export default async function DemoStudentAccessPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/portal/login");
  if (!isSuperAdmin(admin)) redirect("/portal");
  return <DemoAccessClient />;
}
