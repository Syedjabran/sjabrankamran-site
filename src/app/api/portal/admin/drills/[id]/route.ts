import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getDrillRecord } from "@/lib/exam-lab/drill-records";

export const runtime = "nodejs";

/** GET — one stored drill record incl. the frozen question paper (super-admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!user.roles.includes("super_admin")) return NextResponse.json({ error: "Super-admin only." }, { status: 403 });
  const { id } = await params;
  const record = await getDrillRecord(id);
  if (!record) return NextResponse.json({ error: "Drill record not found." }, { status: 404 });
  return NextResponse.json({ record }, { status: 200 });
}
