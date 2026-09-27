import { redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import { getPortalUser, canAccessGlobalStaffData, canConductDrills } from "@/lib/edu/auth";
import { IMAGE_PAPERS } from "@/lib/exam-lab/image-bank";

// Code-split the form so the route's critical JS stays light. The question
// bank is NOT in it: the picker loads the answer-free staff bank from
// /api/exam-lab/bank, and the 9702 paper list comes from here as a prop.
const AssignForm = nextDynamic(() => import("./assign-form").then((m) => m.AssignForm), {
  loading: () => (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading assignment form">
      <div className="h-8 w-56 rounded-lg bg-white/[0.06]" />
      <div className="h-24 rounded-2xl border border-white/10 bg-space/60" />
      <div className="h-40 rounded-2xl border border-white/10 bg-space/60" />
    </div>
  ),
});

export const metadata = { title: "Post assignment / test" };
export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canAccessGlobalStaffData(user.roles) && !canConductDrills(user.roles)) redirect("/portal");
  return <AssignForm canTest={user.roles.some((r) => ["super_admin", "admin", "teaching_assistant"].includes(r))} papers={IMAGE_PAPERS} />;
}
