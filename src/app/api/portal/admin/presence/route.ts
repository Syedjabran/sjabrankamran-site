import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/portal/admin";
import { getOnline } from "@/lib/portal/presence";

export const runtime = "nodejs";

/** GET — who's online right now + what they're doing. Staff only. */
export async function GET() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const users = await getOnline();
  const byRole: Record<string, number> = {};
  for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;
  const byActivity: Record<string, number> = {};
  for (const u of users) byActivity[u.label] = (byActivity[u.label] || 0) + 1;
  return NextResponse.json({ count: users.length, users, byRole, byActivity }, { status: 200 });
}
