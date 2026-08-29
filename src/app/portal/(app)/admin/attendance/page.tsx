import { redirect } from "next/navigation";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { VoiceAttendance } from "./voice-attendance";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isStaff(user.roles)) redirect("/portal");
  return <VoiceAttendance />;
}
