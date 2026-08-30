import { getPortalUser } from "@/lib/edu/auth";
import { getAccessToken, googleReady } from "@/lib/google/auth";
import { isAllowedNode } from "@/lib/google/shared";

export const runtime = "nodejs";

/**
 * GET — stream a Drive file to a signed-in user, but ONLY if the file lives
 * inside a folder the super-admin has shared (default deny). Streams through
 * our server so students never need access to the physics@ Google account.
 * Google-native docs (Docs/Sheets/Slides) are exported to PDF.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return new Response("Sign in required.", { status: 401 });
  if (!(await googleReady())) return new Response("Google not connected.", { status: 503 });
  const { id } = await params;
  if (!(await isAllowedNode(id))) return new Response("This file isn't shared with you.", { status: 403 });

  const token = await getAccessToken();
  // Metadata → decide download vs export.
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,mimeType&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) return new Response("Unavailable.", { status: 502 });
  const meta = (await metaRes.json()) as { name?: string; mimeType?: string };
  const mime = meta.mimeType || "application/octet-stream";
  const safeName = (meta.name || "file").replace(/[\r\n"]/g, "_");

  let url: string;
  let outType: string;
  if (mime.startsWith("application/vnd.google-apps")) {
    if (mime === "application/vnd.google-apps.folder") return new Response("That is a folder.", { status: 400 });
    outType = "application/pdf"; // Docs/Sheets/Slides → PDF
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application%2Fpdf`;
  } else {
    outType = mime;
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  }

  const g = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!g.ok || !g.body) return new Response("Could not fetch the file.", { status: 502 });
  return new Response(g.body, {
    status: 200,
    headers: {
      "content-type": outType,
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
