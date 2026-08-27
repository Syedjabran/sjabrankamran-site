import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { getOnboarding } from "@/lib/portal/onboarding";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Complete your profile", robots: { index: false } };

export default async function OnboardingPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  // Staff/non-students don't onboard.
  if (!user.roles.includes("student")) redirect("/portal");

  const existing = await getOnboarding(user.id);
  if (existing?.completed_at) redirect("/portal");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ice">Welcome — let’s set up your profile</h1>
        <p className="mt-2 text-sm text-fog">
          This is a one-time step. To keep your learning record and your parents in the loop, please complete the
          required fields below. <b className="text-ice">You can’t start any activity until this is done.</b>
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
