import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { pkToday } from "@/lib/portal/pk-time";
import { ownSatProfile } from "@/lib/sat/coach/profile-store";
import { ProfileForm, ProfileUnavailable } from "@/components/sat/coach/profile-form";

export const metadata = { title: "Set up SAT", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatSetupPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab%2Fsetup");
  const own = await ownSatProfile(user);
  if (own.status === "no-access" || own.status === "staff") redirect("/portal/sat-lab");
  if (own.status === "student" && own.profile) redirect("/portal/sat-lab/settings");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ice">Set up your SAT plan</h1>
        <p className="mt-1 text-sm text-fog">Five quick questions. You can change any answer later in SAT settings.</p>
      </div>
      {own.status === "student" ? <ProfileForm mode="setup" today={pkToday()} initial={null} /> : <ProfileUnavailable />}
    </div>
  );
}
