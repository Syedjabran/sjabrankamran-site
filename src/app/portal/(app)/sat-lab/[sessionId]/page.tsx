import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { loadDoc } from "@/lib/sat/store";
import { drillState } from "@/lib/sat/serve";
import { imagesFor } from "@/lib/sat/signed-images";
import { SatRunner } from "@/components/sat/sat-runner";
import { SatDrill } from "@/components/sat/sat-drill";

export const metadata = { title: "SAT Lab", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatSittingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab");
  // satAccess throws when the enrolment read fails: say so, rather than
  // bouncing the student out of a sitting as if they had no access.
  const access = await satAccess(user).catch(() => null);
  if (!access) return <p className="text-sm text-fog">Your access couldn&rsquo;t be checked just now. Nothing has been lost — please refresh.</p>;
  if (!access.ok) redirect("/portal/sat-lab");
  const { sessionId } = await params;
  const loaded = await loadDoc(user.id, sessionId);
  if (!loaded.ok) return <p className="text-sm text-fog">This sitting couldn&rsquo;t be loaded just now. Nothing has been lost — please refresh.</p>;
  if (!loaded.doc) redirect("/portal/sat-lab");
  // Students can ask the tutor about a finished wrong answer; staff have no tutor.
  const explain = !access.isStaff;
  if (loaded.doc.kind !== "drill") return <SatRunner sessionId={sessionId} explain={explain} />;
  // A drill's images arrive signed with the page (its questions and checked
  // rationales only), so the first one starts loading at once. The page
  // waits at most 2.5 s for that (imagesFor); without them the drill signs
  // its images itself.
  const initial = drillState(loaded.doc, Date.now());
  return <SatDrill initial={initial} initialImages={await imagesFor(initial)} explain={explain} />;
}
