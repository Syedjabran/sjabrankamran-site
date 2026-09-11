import { redirect } from "next/navigation";
import { getPortalUser, isStaff, isAttendanceRegistrar } from "@/lib/edu/auth";
import { AttendanceView } from "./attendance-view";

export const metadata = { title: "Daily attendance", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AttendanceViewPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  // Registrars OR any staff may open the read-only daily view.
  if (!isAttendanceRegistrar(user.roles) && !isStaff(user.roles)) redirect("/portal");
  return <AttendanceView />;
}
