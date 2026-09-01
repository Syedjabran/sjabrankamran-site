import { redirect } from "next/navigation";
import { requireStaff, isSuperAdmin } from "@/lib/portal/admin";
import { ProctoringClient } from "./proctoring-client";

export const metadata = { title: "Proctoring & Locks", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProctoringPage() {
  const user = await requireStaff();
  if (!user) redirect("/portal");
  return <ProctoringClient canUnlock={isSuperAdmin(user)} />;
}
