import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { googleReady } from "@/lib/google/auth";
import { listShared, isAllowedNode } from "@/lib/google/shared";
import { listDrive } from "@/lib/google/drive";

export const runtime = "nodejs";

/**
 * GET ?folderId= — student-facing, read-only Drive browser.
 * DEFAULT DENY: with no folderId, returns ONLY the shared root folders.
 * With a folderId, returns its children only if it is within a shared subtree.
 * No free-text search is exposed to non-admins (prevents browsing the whole Drive).
 */
export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!(await googleReady())) return NextResponse.json({ connected: false, files: [] }, { status: 200 });

  const folderId = new URL(req.url).searchParams.get("folderId");

  if (!folderId) {
    const shared = await listShared();
    const files = shared.map((f) => ({
      id: f.id, name: f.name, mimeType: "application/vnd.google-apps.folder",
      kind: "folder" as const, webViewLink: null, iconLink: null, thumbnailLink: null, size: null, modifiedTime: null,
    }));
    return NextResponse.json({ connected: true, root: true, files, nextPageToken: null }, { status: 200 });
  }

  if (!(await isAllowedNode(folderId))) {
    return NextResponse.json({ error: "This folder isn't shared with you." }, { status: 403 });
  }
  try {
    const r = await listDrive({ folderId });
    return NextResponse.json({ connected: true, root: false, ...r }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ connected: true, error: (e as Error).message }, { status: 502 });
  }
}
