import { redirect } from "next/navigation";
import { requireStaff, isSuperAdmin } from "@/lib/portal/admin";
import { ProctoringClient } from "./proctoring-client";
import { portalItem } from "@/lib/portal/subjects";

export const metadata = { title: portalItem("proctoring").menuLabel, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProctoringPage() {
  const user = await requireStaff();
  if (!user) redirect("/portal");
  return <ProctoringClient canUnlock={isSuperAdmin(user)} />;
}
