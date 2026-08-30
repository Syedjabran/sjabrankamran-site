import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin, audit } from "@/lib/portal/admin";
import { googleReady } from "@/lib/google/auth";
import { ensureBaseFolders, baseFolderLinks } from "@/lib/google/drive-write";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET  — return the connected Drive folder links (creates the tree if missing).
 * POST — same, explicit "set up folders" action.
 * Requires Drive WRITE scope; returns needsWrite:true if the token is read-only.
 */
async function run(actorId: string) {
  await ensureBaseFolders();
  return baseFolderLinks();
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  if (!(await googleReady())) return NextResponse.json({ connected: false }, { status: 200 });
  try {
    return NextResponse.json({ connected: true, folders: await run(admin.id) }, { status: 200 });
  } catch (e) {
    const msg = (e as Error).message;
    const needsWrite = /insufficient|scope|permission|403/i.test(msg);
    return NextResponse.json({ connected: true, needsWrite, error: msg }, { status: 200 });
  }
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  if (!(await googleReady())) return NextResponse.json({ error: "Google is not connected yet." }, { status: 400 });
  try {
    const folders = await run(admin.id);
    await audit(admin.id, "google.provision_folders", "drive", null, { folders: Object.keys(folders) });
    return NextResponse.json({ ok: true, folders }, { status: 200 });
  } catch (e) {
    const msg = (e as Error).message;
    const needsWrite = /insufficient|scope|permission|403/i.test(msg);
    return NextResponse.json({ error: msg, needsWrite }, { status: 502 });
  }
}
