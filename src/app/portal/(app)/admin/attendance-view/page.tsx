import { redirect } from "next/navigation";
import { getPortalUser, isStaff, isAttendanceRegistrar } from "@/lib/edu/auth";
import { AttendanceView } from "./attendance-view";
import { portalItem } from "@/lib/portal/subjects";
import { viewerNav } from "@/lib/portal/viewer-nav";
import { DeskGroups } from "../../portal-home-nav";

export const metadata = { title: portalItem("daily-attendance").menuLabel, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AttendanceViewPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  // Registrars OR any staff may open the read-only daily view.
  if (!isAttendanceRegistrar(user.roles) && !isStaff(user.roles)) redirect("/portal");
  // An attendance registrar's home: their other pages as buttons above the view.
  const { nav } = await viewerNav(user);
  const desk = nav.deskHome && nav.homeHref === portalItem("daily-attendance").route;
  return (
    <>
      {desk ? <DeskGroups nav={nav} /> : null}
      <AttendanceView />
    </>
  );
}
