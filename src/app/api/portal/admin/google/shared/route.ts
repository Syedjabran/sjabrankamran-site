import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin, audit } from "@/lib/portal/admin";
import { listShared, addShared, removeShared } from "@/lib/google/shared";

export const runtime = "nodejs";

/** GET — the current student-visible shared folder allow-list. (super-admin) */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  return NextResponse.json({ folders: await listShared() }, { status: 200 });
}

/** POST { id, name } — share a folder with all users. (super-admin) */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { id?: string; name?: string } | null;
  if (!b?.id) return NextResponse.json({ error: "Folder id required." }, { status: 400 });
  const folders = await addShared({ id: b.id, name: b.name || "Folder" });
  await audit(admin.id, "google.share_folder", "drive", b.id, { name: b.name });
  return NextResponse.json({ ok: true, folders }, { status: 200 });
}

/** DELETE ?id= — stop sharing a folder. (super-admin) */
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const folders = await removeShared(id);
  await audit(admin.id, "google.unshare_folder", "drive", id, {});
  return NextResponse.json({ ok: true, folders }, { status: 200 });
}
