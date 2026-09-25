// src/app/api/sat/results/route.ts
//
// Staff-only: the SAT-class students the caller may see, with their sitting
// summaries. Scope is EXACTLY `satClassScope` (src/lib/sat/access.ts) --
// the same predicate `canViewStudent` uses -- so this list never shows a
// student whose sitting the per-sitting report route would then refuse.
import { NextResponse } from "next/server";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { scopedSatStudents } from "@/lib/sat/access";
import { getRegistry } from "@/lib/portal/institutions";
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

    // `scopedSatStudents` (src/lib/sat/access.ts) is the same student
    // resolution the assign-recipients route uses, so the two can never
    // disagree about who counts as an SAT student in the caller's scope.
    const scoped = await scopedSatStudents(user, registry);
    if (scoped === null) return unavailable();
    if (!scoped.length) return NextResponse.json({ students: [] });

    const classNameById = new Map(registry.classes.map((c) => [c.id, c.name] as const));

    const sessionsByUid = new Map<string, SessionSummary[] | null>();
    await eachLimited(scoped, 8, async (s) => {
      // `listSummaries` never throws -- an unreadable index resolves to
      // `null`, which is returned as-is so the page shows "couldn't load",
      // never a false "no sittings".
      sessionsByUid.set(s.uid, await listSummaries(s.uid));
    });

    const students = scoped
      .map((s) => ({
        // A student in more than one of the caller's SAT classes shows
        // under the first (now deterministic -- see scopedSatStudents).
        uid: s.uid, name: s.name, className: classNameById.get(s.classIds[0]) || "SAT class",
        // Every one of the caller's SAT classes the student is in: the
        // assign panel counts a class's students from this list.
        classIds: s.classIds,
        sessions: sessionsByUid.get(s.uid) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ students });
  } catch {
    return unavailable();
  }
}
