import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { loadDoc } from "@/lib/sat/store";
import { drillState } from "@/lib/sat/serve";
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
  return loaded.doc.kind === "drill" ? <SatDrill initial={drillState(loaded.doc, Date.now())} /> : <SatRunner sessionId={sessionId} />;
}
