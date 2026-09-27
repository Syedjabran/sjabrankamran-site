import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { readSitting, sittingImages } from "@/lib/exam-lab/sittings";

export const runtime = "nodejs";

// `fresh`: sign again rather than hand out the hour's URL -- the one retry of
// an image that failed to load (a new signature is a genuinely new request).
const schema = z.object({ token: z.string().min(10).max(20000), paths: z.array(z.string().min(3).max(200)).min(1).max(80).optional(), fresh: z.boolean().optional() });

/**
 * POST — signed URLs for the QUESTION images of one open sitting (never a
 * mark scheme: those come from /reveal and /review once allowed). Serves the
 * runner's top-up when the sitting's own response came back without some,
 * and the one retry of an image that failed to load.
 */
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const sitting = readSitting(parsed.data.token, user.id);
  if (!sitting) return NextResponse.json({ error: "This sitting has expired. Go back and open it again." }, { status: 403 });
  const signed = await sittingImages(sitting, parsed.data.paths ?? null, parsed.data.fresh === true);
  if (!signed.ok) return NextResponse.json({ error: "Could not load images." }, { status: 500 });
  return NextResponse.json({ urls: signed.urls }, { status: 200, headers: { "cache-control": "no-store" } });
}
