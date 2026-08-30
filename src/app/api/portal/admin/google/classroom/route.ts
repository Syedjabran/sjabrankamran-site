import { NextResponse } from "next/server";
import { requireAdmin, isSuperAdmin } from "@/lib/portal/admin";
import { googleReady } from "@/lib/google/auth";
import { listCourses, listCourseWork, listCourseWorkMaterials } from "@/lib/google/classroom";

export const runtime = "nodejs";

/**
 * GET — list Google Classroom courses.
 * GET ?courseId= — list that course's work + materials (with attachments).
 */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin || !isSuperAdmin(admin)) return NextResponse.json({ error: "Super-admins only." }, { status: 403 });
  if (!(await googleReady())) return NextResponse.json({ connected: false, error: "Google is not connected yet." }, { status: 200 });
  const courseId = new URL(req.url).searchParams.get("courseId");
  try {
    if (courseId) {
      const [work, materials] = await Promise.all([
        listCourseWork(courseId).catch(() => []),
        listCourseWorkMaterials(courseId).catch(() => []),
      ]);
      return NextResponse.json({ connected: true, items: [...materials, ...work] }, { status: 200 });
    }
    return NextResponse.json({ connected: true, courses: await listCourses() }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ connected: true, error: (e as Error).message }, { status: 502 });
  }
}
