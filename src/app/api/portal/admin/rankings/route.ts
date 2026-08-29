import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/portal/admin";
import { buildRankings, getRankingsCached } from "@/lib/portal/rankings";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const data = fresh ? await buildRankings() : await getRankingsCached();
  return NextResponse.json({ ...data, cached: !fresh }, { status: 200 });
}
