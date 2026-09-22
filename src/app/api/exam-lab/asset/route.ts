import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseAccess } from "@/lib/portal/course-access";

export const runtime = "nodejs";

const schema = z.object({ paths: z.array(z.string().min(3).max(200)).min(1).max(80) });

// Returns short-lived signed URLs for private exam-asset images. Portal-only:
// real past-paper question/mark-scheme images are never publicly reachable.
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Course guardrail (defence-in-depth): a student may only ever fetch images
  // for the course they are enrolled into. O Level assets live under o-level/*;
  // everything else is 9702. Staff (both courses) pass unrestricted.
  const access = await resolveCourseAccess(user);
  const courseOf = (p: string): "9702" | "5054" => (p.startsWith("o-level/") ? "5054" : "9702");
  if (parsed.data.paths.some((p) => !access.allowed.includes(courseOf(p)))) {
    return NextResponse.json({ error: "You do not have access to this course's papers." }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("exam-assets")
    .createSignedUrls(parsed.data.paths, 3600);
  if (error) {
    console.error("signed url error", error.message);
    return NextResponse.json({ error: "Could not load images." }, { status: 500 });
  }
  const urls: Record<string, string> = {};
  for (const d of data ?? []) {
    if (d.signedUrl && d.path) urls[d.path] = d.signedUrl;
  }
  return NextResponse.json({ urls }, { status: 200 });
}
