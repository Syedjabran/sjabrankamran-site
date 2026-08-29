import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/portal/admin";
import { buildRankings, type RankingsData } from "@/lib/portal/rankings";

export const runtime = "nodejs";
export const maxDuration = 60;

// Building rankings reads every student's attempts from storage, so cache the
// result in module scope for a short window to keep the analytics page snappy
// (and cheap when it polls / multiple staff view it).
let cache: { at: number; data: RankingsData } | null = null;
const TTL_MS = 60_000;

export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true }, { status: 200 });
  }
  const data = await buildRankings();
  cache = { at: Date.now(), data };
  return NextResponse.json({ ...data, cached: false }, { status: 200 });
}
