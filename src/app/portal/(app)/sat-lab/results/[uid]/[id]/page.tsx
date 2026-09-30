import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { canViewStudent } from "@/lib/sat/access";
import { SatResultReport } from "@/components/sat/sat-result-report";

export const metadata = { title: "SAT sitting report", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatResultReportPage({ params }: { params: Promise<{ uid: string; id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab%2Fresults");
  const { uid, id } = await params;

  let can: boolean;
  try {
    can = await canViewStudent(user, uid);
  } catch {
    return <p className="text-sm text-fog">This sitting couldn&rsquo;t be checked just now. Please refresh.</p>;
  }
  if (!can) redirect("/portal/sat-lab/results");

  return <SatResultReport uid={uid} id={id} />;
}
