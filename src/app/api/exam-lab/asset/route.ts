import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseAccess, type Course } from "@/lib/portal/course-access";
import { isSafeStorageKey } from "@/lib/request-guards";

export const runtime = "nodejs";

const schema = z.object({ paths: z.array(z.string().min(3).max(200)).min(1).max(80) });

// Returns short-lived signed URLs for private exam-asset images. Portal-only:
// real past-paper question/mark-scheme images are never publicly reachable.
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // Reject traversal ("o-level/../…") before the course-prefix check below.
  if (!parsed.data.paths.every(isSafeStorageKey)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Course guardrail (defence-in-depth): a student may only ever fetch images
  // for a course they are enrolled into. O Level assets live under o-level/*,
  // SAT assets under sat/*; everything else is 9702. Staff (all courses) pass
  // unrestricted. A request for SAT images checks access strictly: a failed
  // enrolment/registry read answers 503 (retryable), never a false 403 --
  // the same rule as the SAT routes. Physics requests are unchanged.
  let access;
  try {
    access = await resolveCourseAccess(user, { strict: parsed.data.paths.some((p) => p.startsWith("sat/")) });
  } catch {
    return NextResponse.json({ error: "Your access couldn't be checked. Please try again." }, { status: 503 });
  }
  const courseOf = (p: string): Course => {
    if (p.startsWith("o-level/")) return "5054";
    if (p.startsWith("sat/")) return "SAT";
    return "9702";
  };
  if (parsed.data.paths.some((p) => !access.allowed.includes(courseOf(p)))) {
    return NextResponse.json({ error: "You do not have access to this course's papers." }, { status: 403 });
  }

  // Local development only: the SAT crops exist on disk but have not been
  // uploaded yet (the live upload needs the owner's credentials). Point sat/
  // paths at the dev-only local image route instead of signing them.
  const localSat = process.env.NODE_ENV === "development" && process.env.SAT_LOCAL_CROPS === "1";
  const toSign = localSat ? parsed.data.paths.filter((p) => !p.startsWith("sat/")) : parsed.data.paths;
  const urls: Record<string, string> = {};
  if (localSat) {
    for (const p of parsed.data.paths) if (p.startsWith("sat/")) urls[p] = `/api/sat/local-image?path=${encodeURIComponent(p)}`;
  }
  if (!toSign.length) return NextResponse.json({ urls }, { status: 200 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("exam-assets")
    .createSignedUrls(toSign, 3600);
  if (error) {
    console.error("signed url error", error.message);
    return NextResponse.json({ error: "Could not load images." }, { status: 500 });
  }
  for (const d of data ?? []) {
    if (d.signedUrl && d.path) urls[d.path] = d.signedUrl;
  }
  return NextResponse.json({ urls }, { status: 200 });
}
