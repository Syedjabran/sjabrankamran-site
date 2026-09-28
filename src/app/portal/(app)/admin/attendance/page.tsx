import { redirect } from "next/navigation";
import { getPortalUser, canAccessGlobalStaffData } from "@/lib/edu/auth";
import { VoiceAttendance } from "./voice-attendance";
import { portalItem } from "@/lib/portal/subjects";

export const metadata = { title: portalItem("attendance").menuLabel };
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canAccessGlobalStaffData(user.roles)) redirect("/portal");
  return <VoiceAttendance />;
}
