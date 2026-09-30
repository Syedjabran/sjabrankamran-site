import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { ownSatProfile } from "@/lib/sat/coach/profile-store";
import { sanitiseFirstName } from "@/lib/sat/coach/insights-core";
import { TutorChat } from "@/components/sat/coach/tutor-chat";

export const metadata = { title: "SAT tutor", robots: { index: false } };
export const dynamic = "force-dynamic";

const QUESTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SITTING_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** The Digital SAT Tutor (SAT Coach spec 8.4), for a student with an SAT
 *  profile. `?explain=<questionId>[&from=<drill or sitting id>]` opens it on
 *  "explain my mistake" for that question, from that attempt (the server
 *  checks it is one they finished). */
export default async function SatTutorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab%2Ftutor");
  const own = await ownSatProfile(user);
  // Staff have no record of their own to coach; without SAT the hub says why.
  if (own.status === "no-access" || own.status === "staff") redirect("/portal/sat-lab");
  if (own.status === "student" && !own.profile) redirect("/portal/sat-lab/setup");
  const { explain, from } = await searchParams;
  const explainId = typeof explain === "string" && QUESTION_ID.test(explain) ? explain : null;
  const explainFrom = explainId && typeof from === "string" && SITTING_ID.test(from) ? from : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><MessagesSquare size={18} /></span>
        <div className="min-w-0"><h1 className="font-display text-2xl text-ice">SAT tutor</h1><p className="text-sm text-dust">Knows your plan and your progress</p></div>
        <Link href="/portal/sat-lab" className="btn-ghost ml-auto !px-3 !py-1.5 text-xs"><ArrowLeft size={14} /> SAT Lab</Link>
      </div>
      {own.status === "unavailable"
        ? <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">Your access couldn&rsquo;t be checked just now. Please refresh.</p>
        : <TutorChat firstName={sanitiseFirstName(user.fullName)} explainId={explainId} explainFrom={explainFrom} />}
    </div>
  );
}
