import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { leaderboard, getContrib, POINTS_GUIDE } from "@/lib/portal/contribution";

export const runtime = "nodejs";

/** GET — community contribution leaderboard (all-time + this month's top) + my points. */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [board, mine] = await Promise.all([leaderboard(), getContrib(user.id)]);
  const monthlyTop5 = board.monthly.slice(0, 5).map((r, i) => ({ ...r, rank: i + 1, isMe: r.uid === user.id }));
  return NextResponse.json({
    month: board.month,
    allTime: board.allTime.map((r, i) => ({ ...r, rank: i + 1, isMe: r.uid === user.id })),
    monthly: board.monthly.map((r, i) => ({ ...r, rank: i + 1, isMe: r.uid === user.id })),
    monthlyTop5,
    me: mine ? { total: mine.total, monthPoints: mine.month === board.month ? mine.monthPoints : 0, breakdown: mine.breakdown } : { total: 0, monthPoints: 0, breakdown: {} },
    guide: POINTS_GUIDE,
  }, { status: 200 });
}
