import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalUser, isAdmin, canConductDrills } from "@/lib/edu/auth";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { getRegistry } from "@/lib/portal/institutions";

export const runtime = "nodejs";

/**
 * GET /api/portal/admin/drill-students?class_ids=a,b
 *
 * Active students enrolled in the given classes, for the "assign to specific
 * students" picker. Scoped exactly like the classes picker: admins see any
 * class; other drill-conducting staff only their mapped classes. Any class
 * outside the caller's scope is silently dropped, never leaked.
 */
export async function GET(req: Request) {
  const staff = await getPortalUser();
  if (!staff || !(isAdmin(staff.roles) || canConductDrills(staff.roles))) {
    return NextResponse.json({ error: "Staff only." }, { status: 403 });
  }
  const url = new URL(req.url);
  const requested = (url.searchParams.get("class_ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!requested.length) return NextResponse.json({ students: [] }, { status: 200 });

  const allowed = isAdmin(staff.roles) ? null : new Set(await visibleClassIdsForUid(staff.id, staff.roles));
  const classIds = allowed ? requested.filter((c) => allowed.has(c)) : requested;
  if (!classIds.length) return NextResponse.json({ students: [] }, { status: 200 });

  const sb = createAdminClient();
  const reg = await getRegistry();
  const classNameById = new Map(reg.classes.map((c) => [c.id, c.name]));

  const { data: enr } = await sb
    .from("edu_enrolments")
    .select("class_id, edu_students(profile_id)")
    .in("class_id", classIds)
    .eq("status", "active");
  const rows = (enr || []) as unknown as { class_id: string; edu_students?: { profile_id?: string } }[];

  // profile_id -> the classes (within scope) the student is enrolled in
  const classesByUid = new Map<string, Set<string>>();
  for (const r of rows) {
    const uid = r.edu_students?.profile_id;
    if (!uid) continue;
    if (!classesByUid.has(uid)) classesByUid.set(uid, new Set());
    classesByUid.get(uid)!.add(r.class_id);
  }
  const uids = [...classesByUid.keys()];
  if (!uids.length) return NextResponse.json({ students: [] }, { status: 200 });

  const { data: profs } = await sb
    .from("edu_profiles")
    .select("id, full_name, email, status")
    .in("id", uids);

  const students = (profs || [])
    .filter((p) => (p.status ?? "active") !== "disabled")
    .map((p) => {
      const cls = [...(classesByUid.get(p.id as string) || [])].map((cid) => classNameById.get(cid) || "").filter(Boolean);
      return {
        id: p.id as string,
        name: (p.full_name as string) || (p.email as string) || "Student",
        email: (p.email as string) || "",
        classes: cls,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ students }, { status: 200 });
}
