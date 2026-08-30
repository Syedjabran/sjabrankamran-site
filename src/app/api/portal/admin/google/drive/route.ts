import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin } from "@/lib/portal/admin";
import { googleConfigured } from "@/lib/google/auth";
import { listDrive } from "@/lib/google/drive";

export const runtime = "nodejs";

/** GET ?folderId=&q=&pageToken= — browse / search the connected Google Drive. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  if (!googleConfigured()) return NextResponse.json({ connected: false, error: "Google is not connected yet." }, { status: 200 });
  const url = new URL(req.url);
  try {
    const r = await listDrive({
      folderId: url.searchParams.get("folderId") || undefined,
      q: url.searchParams.get("q") || undefined,
      pageToken: url.searchParams.get("pageToken") || undefined,
    });
    return NextResponse.json({ connected: true, ...r }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ connected: true, error: (e as Error).message }, { status: 502 });
  }
}
