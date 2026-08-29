import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { effectiveRoles } from "@/lib/portal/view-as";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const { roles } = await effectiveRoles(user);
  if (!roles.includes("student")) redirect("/portal");
  return <LeaderboardClient />;
}
