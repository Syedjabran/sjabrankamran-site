import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listResources } from "@/lib/portal/resources";

export const runtime = "nodejs";

/** GET — the Physics Resources library, visible to every signed-in user. */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ resources: await listResources() }, { status: 200 });
}
