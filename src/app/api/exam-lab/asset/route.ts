import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess, type Course } from "@/lib/portal/course-access";
import { isSafeStorageKey } from "@/lib/request-guards";
import { imageUrls } from "@/lib/sat/signed-images";

export const runtime = "nodejs";

const schema = z.object({ paths: z.array(z.string().min(3).max(200)).min(1).max(80) });

// Returns short-lived signed URLs for private exam-asset images. Portal-only:
// real past-paper question/mark-scheme images are never publicly reachable.
// The same image gets the same URL for an hour (src/lib/sat/signed-images.ts)
// so the browser and the storage CDN can cache it; every URL handed out
// still has at least an hour to run.
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

  // Local development with SAT_LOCAL_CROPS=1 (the crops on disk, not yet
  // uploaded) points sat/ paths at the dev-only local image route instead.
  const signed = await imageUrls(parsed.data.paths);
  if (!signed.ok) return NextResponse.json({ error: "Could not load images." }, { status: 500 });
  return NextResponse.json({ urls: signed.urls }, { status: 200 });
}
