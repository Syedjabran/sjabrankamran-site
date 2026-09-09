import { redirect } from "next/navigation";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { getStaffSchool } from "@/lib/portal/staff-school";
import { getInstitutionReport } from "@/lib/portal/institutions";
import { CoordinatorClient } from "./coordinator-client";

export const metadata = { title: "Coordinator desk", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CoordinatorPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("coordinator") && !isAdmin(user.roles)) redirect("/portal");
  const school = isAdmin(user.roles) ? null : await getStaffSchool(user.id);
  if (!isAdmin(user.roles) && !school) return <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-6 text-sm text-amber-200">Your Coordinator role is active but no school is assigned yet. Ask an administrator to assign your school in Users &amp; activity.</div>;
  const reports = await getInstitutionReport(school);
  return <CoordinatorClient school={school} reports={reports} />;
}
