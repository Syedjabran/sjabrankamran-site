import { NextResponse } from "next/server";
import { requireAdmin, audit, isSuperAdmin } from "@/lib/portal/admin";
import { addLinkResource, registerUpload, removeResource, RES_BUCKET, type ResourceKind } from "@/lib/portal/resources";
import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorToDrive } from "@/lib/google/drive-write";
import { notify } from "@/lib/portal/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — publish a resource (super-admin only). Two shapes:
 *   { mode:"link", title, url, category?, description?, kind? }
 *   { mode:"upload", title, path, name, mime?, size?, category?, description? }
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can publish resources." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as {
    mode?: string; title?: string; url?: string; path?: string; name?: string;
    mime?: string; size?: number; category?: string; description?: string; kind?: ResourceKind;
  } | null;
  if (!b?.title || !b.title.trim()) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  const byName = admin.fullName || admin.email || "Super Admin";

  if (b.mode === "upload") {
    if (!b.path || !b.name) return NextResponse.json({ error: "path and name are required for an upload." }, { status: 400 });
    const item = await registerUpload({
      title: b.title.trim(), description: b.description, category: b.category,
      path: b.path, name: b.name, mime: b.mime, size: b.size, createdBy: admin.id, createdByName: byName,
    });
    // Best-effort mirror into Google Drive → sjabrankamran.com/Physics Resource
    try {
      const { data: blob } = await createAdminClient().storage.from(RES_BUCKET).download(b.path);
      if (blob) await mirrorToDrive("physicsResource", b.name, b.mime || blob.type || "application/octet-stream", blob);
    } catch { /* Drive mirror is optional */ }
    await audit(admin.id, "resource.publish", "physics-resources", item.id, { kind: item.kind, title: item.title, source: "upload" });
    await notify({ audience: "students" }, { type: "resource", title: `New resource: ${item.title}`, body: "A new resource has been published in Physics Resources.", href: "/portal/resources" });
    return NextResponse.json({ ok: true, resource: item }, { status: 200 });
  }

  if (!b.url || !b.url.trim()) return NextResponse.json({ error: "A URL is required for a link resource." }, { status: 400 });
  const item = await addLinkResource({
    title: b.title.trim(), description: b.description, category: b.category,
    url: b.url.trim(), kind: b.kind, createdBy: admin.id, createdByName: byName,
  });
  await audit(admin.id, "resource.publish", "physics-resources", item.id, { kind: item.kind, title: item.title, source: item.source });
  await notify({ audience: "students" }, { type: "resource", title: `New resource: ${item.title}`, body: "A new resource has been published in Physics Resources.", href: "/portal/resources" });
  return NextResponse.json({ ok: true, resource: item }, { status: 200 });
}

/** DELETE ?id= — remove a resource (super-admin only). */
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super-admin can remove resources." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const ok = await removeResource(id);
  if (!ok) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  await audit(admin.id, "resource.remove", "physics-resources", id, {});
  return NextResponse.json({ ok: true }, { status: 200 });
}
