import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessGlobalStaffData, canConductDrills, getPortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess, type Course } from "@/lib/portal/course-access";
import { isSafeStorageKey } from "@/lib/request-guards";
import { classifyAssetPath } from "@/lib/exam-lab/answer-rules";
import { allowedPracticeTestImages } from "@/lib/sat/image-access";
import { imageUrls } from "@/lib/sat/signed-images";

export const runtime = "nodejs";

// `fresh`: sign again rather than hand out the hour's URL -- the one retry
// of an image that failed to load (a new signature is a genuinely new request).
const schema = z.object({ paths: z.array(z.string().min(3).max(200)).min(1).max(80), fresh: z.boolean().optional() });

// Returns short-lived signed URLs for private exam-asset images. Portal-only:
// real past-paper question/mark-scheme images are never publicly reachable.
// The same image gets the same URL for an hour (src/lib/sat/signed-images.ts)
// so the browser and the storage CDN can cache it; every URL handed out
// still has at least an hour to run.
//
// What a student may have signed here (staff: anything):
//  - past-paper QUESTION images of a course they are enrolled in, and SAT
//    bank / rationale images (the SAT routes decide when those are shown);
//  - an official SAT practice-test image only when their own sitting already
//    shows it (running module, finished review);
//  - never a MARK SCHEME or a staff-written class-test (secure) image: a
//    sitting's own calls hand those out once allowed (/api/exam-lab/reveal,
//    /review, /sitting, /images).
export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // Reject traversal ("o-level/../…") before the course-prefix check below.
  if (!parsed.data.paths.every(isSafeStorageKey)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const paths = parsed.data.paths;
  const classes = paths.map(classifyAssetPath);

  // Staff who build, preview, print or review papers (the drill records,
  // the question picker, the printable paper) sign any exam image.
  const staff = canConductDrills(user.roles) || canAccessGlobalStaffData(user.roles);
  if (!staff) {
    if (classes.includes("mark-scheme")) return NextResponse.json({ error: "Mark schemes open after you submit." }, { status: 403 });
    if (classes.includes("secure")) return NextResponse.json({ error: "These questions open when your test starts." }, { status: 403 });

    // Course guardrail (defence-in-depth): a student may only ever fetch images
    // for a course they are enrolled into. O Level assets live under o-level/*,
    // SAT assets under sat/*; everything else is 9702. A request for SAT
    // images checks access strictly: a failed enrolment/registry read answers
    // 503 (retryable), never a false 403 -- the same rule as the SAT routes.
    let access;
    try {
      access = await resolveCourseAccess(user, { strict: paths.some((p) => p.startsWith("sat/")) });
    } catch {
      return NextResponse.json({ error: "Your access couldn't be checked. Please try again." }, { status: 503 });
    }
    const courseOf = (p: string): Course => {
      if (p.startsWith("o-level/")) return "5054";
      if (p.startsWith("sat/")) return "SAT";
      return "9702";
    };
    if (paths.some((p) => !access.allowed.includes(courseOf(p)))) {
      return NextResponse.json({ error: "You do not have access to this course's papers." }, { status: 403 });
    }

    if (classes.includes("sat-test")) {
      const allowed = await allowedPracticeTestImages(user.id, Date.now()).catch(() => null);
      if (allowed === null) return NextResponse.json({ error: "Your SAT history couldn't be checked. Please try again." }, { status: 503 });
      if (paths.some((p, i) => classes[i] === "sat-test" && !allowed.has(p))) {
        return NextResponse.json({ error: "A practice test's questions open when you reach that module." }, { status: 403 });
      }
    }
  }

  // Local development with SAT_LOCAL_CROPS=1 (the crops on disk, not yet
  // uploaded) points sat/ paths at the dev-only local image route instead.
  const signed = await imageUrls(paths, { fresh: parsed.data.fresh });
  if (!signed.ok) return NextResponse.json({ error: "Could not load images." }, { status: 500 });
  return NextResponse.json({ urls: signed.urls }, { status: 200 });
}
