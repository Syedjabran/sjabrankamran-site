import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin } from "@/lib/portal/admin";
import { createUploadUrl } from "@/lib/portal/resources";

export const runtime = "nodejs";

/**
 * POST { name } — mint a short-lived signed upload URL so the browser can
 * upload a file (up to the bucket's 50 MB limit) directly to Supabase storage,
 * bypassing the serverless request-body cap. Returns { path, token, signedUrl }.
 * The client then calls POST /api/portal/admin/resources { mode:"upload", ... }.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can publish resources." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (b?.name || "").trim();
  if (!name) return NextResponse.json({ error: "A file name is required." }, { status: 400 });
  const r = await createUploadUrl(name);
  if (!r) return NextResponse.json({ error: "Could not create an upload URL." }, { status: 500 });
  return NextResponse.json({ ok: true, ...r }, { status: 200 });
}
