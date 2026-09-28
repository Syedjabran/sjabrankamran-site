import { redirect } from "next/navigation";
import { FlaskConical, Maximize2 } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { practicalLabAccess } from "@/lib/portal/practical-lab";
import { PRACTICAL_LAB_ENTRY, PRACTICAL_LAB_PAGE } from "@/lib/portal/practical-lab-access";
import { portalItem } from "@/lib/portal/subjects";
import { LabFrame } from "./lab-frame";

export const metadata = { title: portalItem("practical-lab").menuLabel, robots: { index: false } };
export const dynamic = "force-dynamic";

/** The 9702 virtual practicals (public/lab) inside the portal chrome. The
 *  middleware gates /lab itself with the same rule, so the frame can't be
 *  opened around this page's check. */
export default async function PracticalLabPage() {
  const user = await getPortalUser();
  if (!user) redirect(`/portal/login?next=${encodeURIComponent(PRACTICAL_LAB_PAGE)}`);
  // Throws when the grants read fails -- shown as "couldn't be checked",
  // never as "not switched on".
  const access = await practicalLabAccess(user).catch(() => null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><FlaskConical size={18} /></span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-ice">Practical Lab</h1>
          <p className="text-sm text-dust">Cambridge 9702 practicals · set up, observe and measure in a virtual lab</p>
        </div>
        {access?.ok ? (
          <a href={PRACTICAL_LAB_ENTRY} className="btn-ghost ml-auto !px-3 !py-1.5 text-xs"><Maximize2 size={14} /> Open full screen</a>
        ) : null}
      </div>
      {!access ? (
        <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">Your access couldn&rsquo;t be checked just now. Please refresh.</p>
      ) : access.ok ? (
        <LabFrame src={PRACTICAL_LAB_ENTRY} title="Practical Lab — 9702 virtual practicals" />
      ) : (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="mx-auto max-w-md font-display text-lg text-ice">Practical Lab isn&rsquo;t switched on for your account yet — ask the admin to add Practical Lab to your subjects.</p>
        </div>
      )}
    </div>
  );
}
