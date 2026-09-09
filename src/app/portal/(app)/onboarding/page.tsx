import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { isOnboardingComplete } from "@/lib/portal/onboarding";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Complete your profile", robots: { index: false } };

export default async function OnboardingPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  // Staff/non-students don't onboard.
  if (!user.roles.includes("student")) redirect("/portal");

  if (await isOnboardingComplete(user.id)) redirect("/portal");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ice">Welcome — let’s set up your profile</h1>
        <p className="mt-2 text-sm text-fog">
          Your student safety and guardian form is required. Add your profile photo and at least one parent/guardian’s
          name, email and WhatsApp number. <b className="text-ice">All other portal services remain inaccessible until every required field is complete.</b>
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
