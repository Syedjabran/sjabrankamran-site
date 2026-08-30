import { NextResponse } from "next/server";
import { requireAdmin, audit, isSuperAdmin } from "@/lib/portal/admin";
import { googleConfigured } from "@/lib/google/auth";
import { addLinkResource, type ResourceKind } from "@/lib/portal/resources";

export const runtime = "nodejs";

/**
 * POST { title, url, category?, description?, kind? } — publish a Google Drive
 * file / Classroom material / YouTube video into the Physics Resources library
 * as a link resource (Drive & YouTube URLs get inline preview automatically).
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  if (!googleConfigured()) return NextResponse.json({ error: "Google is not connected yet." }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { title?: string; url?: string; category?: string; description?: string; kind?: ResourceKind } | null;
  if (!b?.title?.trim() || !b?.url?.trim()) return NextResponse.json({ error: "title and url are required." }, { status: 400 });
  const item = await addLinkResource({
    title: b.title.trim(),
    description: b.description,
    category: b.category || "From Google",
    url: b.url.trim(),
    kind: b.kind,
    createdBy: admin.id,
    createdByName: admin.fullName || admin.email || "Super Admin",
  });
  await audit(admin.id, "resource.import_google", "physics-resources", item.id, { title: item.title, source: item.source });
  return NextResponse.json({ ok: true, resource: item }, { status: 200 });
}
