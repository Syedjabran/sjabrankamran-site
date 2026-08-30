import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResourceById, RES_BUCKET } from "@/lib/portal/resources";

export const runtime = "nodejs";

/**
 * GET — serve an uploaded HTML applet with the correct text/html content-type
 * so it renders inside the Physics Resources preview iframe. (Supabase storage
 * serves user-uploaded HTML as text/plain for anti-XSS; we re-serve here.)
 * Any signed-in portal user may view. Same-origin framing only (site CSP +
 * X-Frame-Options SAMEORIGIN apply). Content is trusted (super-admin authored).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return new Response("Sign in required.", { status: 401 });
  const { id } = await params;
  const item = await getResourceById(id);
  if (!item || item.source !== "upload" || item.kind !== "animation" || !item.path) {
    return new Response("Not found.", { status: 404 });
  }
  const { data, error } = await createAdminClient().storage.from(RES_BUCKET).download(item.path);
  if (error || !data) return new Response("Unavailable.", { status: 502 });
  const html = await data.text();
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}
