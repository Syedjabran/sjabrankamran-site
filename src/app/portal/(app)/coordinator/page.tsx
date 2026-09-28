import { redirect } from "next/navigation";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { getStaffScope } from "@/lib/portal/staff-school";
import { getInstitutionReport } from "@/lib/portal/institutions";
import { CoordinatorClient } from "./coordinator-client";
import { portalItem } from "@/lib/portal/subjects";
import { viewerNav } from "@/lib/portal/viewer-nav";
import { DeskGroups } from "../portal-home-nav";

export const metadata = { title: portalItem("coordinator").menuLabel, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CoordinatorPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const communicator = user.roles.includes("coordinator") || user.roles.includes("facilitator");
  if (!communicator && !isAdmin(user.roles)) redirect("/portal");
  const [scope, { nav }] = await Promise.all([isAdmin(user.roles) ? null : getStaffScope(user.id), viewerNav(user)]);
  // A coordinator's or facilitator's home: their other pages as buttons above the desk.
  const groups = nav.deskHome && nav.homeHref === portalItem("coordinator").route ? <DeskGroups nav={nav} /> : null;
  if (!isAdmin(user.roles) && !scope) return <>{groups}<div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-6 text-sm text-amber-200">Your staff role is active, but both an assigned school and an assigned class are required. Ask an administrator to complete both assignments in Users &amp; activity.</div></>;
  const reports = await getInstitutionReport(scope?.school || null, scope?.classIds || null);
  return <>{groups}<CoordinatorClient school={scope?.school || null} reports={reports} /></>;
}
