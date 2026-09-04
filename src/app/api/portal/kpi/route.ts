import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getMyKpi, KPI_WEIGHTS, PILLAR_INFO } from "@/lib/portal/kpi";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET — the signed-in user's own Physics Performance Index (self view).
 * Any signed-in user; users without a student record get hasData:false. */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { me, computed_at } = await getMyKpi(user.id);
  if (!me) {
    return NextResponse.json({
      hasData: false, computed_at, weights: KPI_WEIGHTS, pillarInfo: PILLAR_INFO,
      message: "No ranking yet — you appear once you're enrolled in a class.",
    }, { status: 200 });
  }
  return NextResponse.json({ hasData: true, computed_at, weights: KPI_WEIGHTS, pillarInfo: PILLAR_INFO, me }, { status: 200 });
}
