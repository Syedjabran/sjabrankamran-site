// src/app/api/sat/results/route.ts
//
// Staff-only: the SAT-class students the caller may see, with their sitting
// summaries. Scope is EXACTLY `satClassScope` (src/lib/sat/access.ts) --
// the same predicate `canViewStudent` uses -- so this list never shows a
// student whose sitting the per-sitting report route would then refuse.
import { NextResponse } from "next/server";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { satClassScope } from "@/lib/sat/access";
import { getRegistry, staffRoleMap } from "@/lib/portal/institutions";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSummaries } from "@/lib/sat/store";
import type { SessionSummary } from "@/lib/sat/client-types";

export const runtime = "nodejs";

// Bounded concurrency for the per-student index reads, matching the fan-out
// pattern in exam-lab/allocations.ts -- a class-sized roster finishes inside
// the route's time budget without opening one storage request per student.
async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

type EnrolRow = {
  class_id: string;
  edu_students?: { profile_id: string; edu_profiles?: { full_name?: string } } | null;
};

const unavailable = () => NextResponse.json({ error: "SAT results couldn't be loaded just now." }, { status: 503 });

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isExamLabStaff(user.roles)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  try {
    // Read the registry ONCE -- reused for satClassScope's SAT-track filter
    // AND the class names below, so there's no second storage read.
    // getRegistry() swallows a storage failure into an empty registry, so a
    // genuine read failure and "no classes exist" are indistinguishable from
    // its return value alone. A live registry always has classes, so an
    // empty one fails closed here rather than silently rendering as an
    // empty (but seemingly real) roster for every staff member.
    const registry = await getRegistry();
    if (!registry.classes.length) return unavailable();

    const classIds = await satClassScope(user, registry);
    if (!classIds.length) return NextResponse.json({ students: [] });

    const classNameById = new Map(registry.classes.map((c) => [c.id, c.name] as const));

    const db = createAdminClient();
    const { data, error } = await db
      .from("edu_enrolments")
      .select("class_id, edu_students(profile_id, edu_profiles!edu_students_profile_id_fkey(full_name))")
      .in("class_id", classIds)
      .eq("status", "active");
    if (error) throw error;

    const rows = (data ?? []) as unknown as EnrolRow[];
    const byUid = new Map<string, { uid: string; name: string; className: string }>();
    for (const r of rows) {
      const uid = r.edu_students?.profile_id;
      if (!uid || byUid.has(uid)) continue;
      byUid.set(uid, {
        uid,
        name: r.edu_students?.edu_profiles?.full_name || "Student",
        className: classNameById.get(r.class_id) || "SAT class",
      });
    }

    // Exclude staff accounts (a coordinator/facilitator enrolled for class
    // access is never a "student" in the results roster).
    const allUids = [...byUid.keys()];
    const roleMap = await staffRoleMap(allUids);
    const studentUids = allUids.filter((uid) => !roleMap.has(uid));

    const sessionsByUid = new Map<string, SessionSummary[] | null>();
    await eachLimited(studentUids, 8, async (uid) => {
      // `listSummaries` never throws -- an unreadable index resolves to
      // `null`, which is returned as-is so the page shows "couldn't load",
      // never a false "no sittings".
      sessionsByUid.set(uid, await listSummaries(uid));
    });

    const students = studentUids
      .map((uid) => {
        const info = byUid.get(uid)!;
        return { uid, name: info.name, className: info.className, sessions: sessionsByUid.get(uid) ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ students });
  } catch {
    return unavailable();
  }
}
