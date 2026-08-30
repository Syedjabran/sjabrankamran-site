import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin } from "@/lib/portal/admin";
import { googleReady, connectedEmail } from "@/lib/google/auth";

export const runtime = "nodejs";

/** GET — is Google connected? (super-admin only) */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ connected: false, allowed: false }, { status: 200 });
  return NextResponse.json({ connected: await googleReady(), allowed: true, email: await connectedEmail() }, { status: 200 });
}
