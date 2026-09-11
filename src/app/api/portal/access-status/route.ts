import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getPortalRestriction } from "@/lib/portal/access-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const restriction = await getPortalRestriction(user);
  return NextResponse.json({
    restricted: !!restriction,
    restriction: restriction ? {
      mode: restriction.mode,
      message: restriction.message,
      scopeLabel: restriction.scopeLabel,
      endsAt: restriction.endsAt,
    } : null,
  }, { status: 200, headers: { "cache-control": "no-store" } });
}
