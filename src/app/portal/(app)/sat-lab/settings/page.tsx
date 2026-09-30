import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { pkToday } from "@/lib/portal/pk-time";
import { ownSatProfile } from "@/lib/sat/coach/profile-store";
import { ProfileForm, ProfileUnavailable } from "@/components/sat/coach/profile-form";

export const metadata = { title: "SAT settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatSettingsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab%2Fsettings");
  const own = await ownSatProfile(user);
  if (own.status === "no-access" || own.status === "staff") redirect("/portal/sat-lab");
  if (own.status === "student" && !own.profile) redirect("/portal/sat-lab/setup");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ice">SAT settings</h1>
        <p className="mt-1 text-sm text-fog">Your exam date, target and practice routine.</p>
      </div>
      {own.status === "student" && own.profile ? <ProfileForm mode="settings" today={pkToday()} initial={own.profile} /> : <ProfileUnavailable />}
    </div>
  );
}
