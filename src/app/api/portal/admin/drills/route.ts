import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listDrillRecords } from "@/lib/exam-lab/drill-records";

export const runtime = "nodejs";

/** GET — all stored Exam Lab drill records (super-admin only). */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!user.roles.includes("super_admin")) return NextResponse.json({ error: "Super-admin only." }, { status: 403 });
  const items = await listDrillRecords();
  return NextResponse.json({ items }, { status: 200 });
}
