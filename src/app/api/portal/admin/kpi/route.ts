import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/portal/admin";
import { getKpiCached, KPI_WEIGHTS, PILLAR_INFO } from "@/lib/portal/kpi";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET ?school=&classId= — the full Physics Performance Index table (staff). */
export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const url = new URL(req.url);
  const school = (url.searchParams.get("school") || "").trim();
  const classId = (url.searchParams.get("classId") || "").trim();

  const table = await getKpiCached();
  let students = table.students;
  if (school) students = students.filter((s) => s.school === school);
  if (classId) students = students.filter((s) => s.classId === classId);

  return NextResponse.json({
    computed_at: table.computed_at,
    totals: table.totals,
    weights: KPI_WEIGHTS,
    pillarInfo: PILLAR_INFO,
    filters: { school: school || null, classId: classId || null },
    students,
  }, { status: 200 });
}
