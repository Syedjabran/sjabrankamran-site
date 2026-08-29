import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/portal/admin";
import { getRegistry } from "@/lib/portal/institutions";

export const runtime = "nodejs";

/** GET — every class (across all schools) for admin pickers, with live enrolment counts. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const sb = createAdminClient();
  const reg = await getRegistry();
  const regById = new Map(reg.classes.map((c) => [c.id, c]));

  const { data: classes } = await sb
    .from("edu_classes")
    .select("id, name, room, active, edu_enrolments(count)")
    .order("name", { ascending: true });

  const items = (classes || []).map((c) => {
    const meta = regById.get(c.id as string);
    const enr = c.edu_enrolments as unknown as { count: number }[] | null;
    return {
      id: c.id as string,
      name: meta?.name || (c.name as string) || "Class",
      school: meta?.school || (c.room as string) || "—",
      section: meta?.section || null,
      year: meta?.year || null,
      students: enr?.[0]?.count ?? 0,
      active: c.active !== false,
    };
  });
  items.sort((a, b) => (a.school + a.name).localeCompare(b.school + b.name));
  return NextResponse.json({ classes: items, schools: reg.schools }, { status: 200 });
}
