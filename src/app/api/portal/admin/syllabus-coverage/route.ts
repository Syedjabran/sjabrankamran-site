import { NextResponse } from "next/server";
import { getPortalUser, isAdmin, isExamLabStaff, type EduRole } from "@/lib/edu/auth";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";
import { getRegistry } from "@/lib/portal/institutions";
import { listCoverage, markCovered, uncover, type CoverageScopeType } from "@/lib/exam-lab/syllabus-coverage";
import { TOPICS } from "@/lib/exam-lab/bank";
import { IMAGE_BANK } from "@/lib/exam-lab/image-bank";

export const runtime = "nodejs";

/**
 * Syllabus coverage — staff record which syllabus topics a class / school /
 * the network has completed. Assignment gating (exam-allocate, study plans)
 * reads this and refuses to draw from uncovered topics.
 *
 * Owner staff set: super_admin / admin / teacher / coordinator / facilitator.
 * Non-admin staff may only touch classes in their scope (or schools derived
 * from those classes); network-wide coverage is admin-only.
 */

async function callerScope(uid: string, roles: EduRole[]) {
  const admin = isAdmin(roles);
  const reg = await getRegistry();
  if (admin) {
    return {
      admin: true as const,
      classIds: new Set(reg.classes.map((c) => c.id)),
      schools: new Set(reg.schools),
    };
  }
  const visible = await visibleClassIdsForUid(uid, roles);
  const schools = new Set(reg.classes.filter((c) => visible.includes(c.id)).map((c) => c.school));
  return { admin: false as const, classIds: new Set(visible), schools };
}

function canSeeRow(
  row: { scope_type: string; scope_id: string },
  scope: { classIds: Set<string>; schools: Set<string> },
) {
  if (row.scope_type === "network") return true; // visible to all staff
  if (row.scope_type === "class") return scope.classIds.has(row.scope_id);
  return scope.schools.has(row.scope_id);
}

export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user || !isExamLabStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const course = new URL(req.url).searchParams.get("course") || "9702";

  const scope = await callerScope(user.id, user.roles);
  const rows = (await listCoverage(course)).filter((r) => canSeeRow(r, scope));

  // Canonical 9702 taxonomy + any extra topic labels present in the bank.
  const canonical = [...TOPICS.AS, ...TOPICS.A2];
  const bankTopics = new Map<string, number>();
  for (const q of IMAGE_BANK) if (q.topic) bankTopics.set(q.topic, (bankTopics.get(q.topic) || 0) + 1);
  const extras = [...bankTopics.keys()].filter((t) => !canonical.includes(t));

  return NextResponse.json({
    course,
    rows,
    topics: [
      ...TOPICS.AS.map((t) => ({ name: t, group: "AS", bankCount: bankTopics.get(t) || 0 })),
      ...TOPICS.A2.map((t) => ({ name: t, group: "A2", bankCount: bankTopics.get(t) || 0 })),
      ...extras.map((t) => ({ name: t, group: "Other", bankCount: bankTopics.get(t) || 0 })),
    ],
  }, { status: 200 });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user || !isExamLabStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as {
    course?: string; topic?: string; scope_type?: string; scope_id?: string; scope_label?: string; note?: string;
  } | null;
  if (!b?.topic?.trim() || !b?.scope_type || !b?.scope_id) {
    return NextResponse.json({ error: "course, topic, scope_type and scope_id are required." }, { status: 400 });
  }
  const scopeType = b.scope_type as CoverageScopeType;
  if (!["class", "school", "network"].includes(scopeType)) {
    return NextResponse.json({ error: "scope_type must be class, school or network." }, { status: 400 });
  }
  if (b.scope_id.length > 120 || b.topic.length > 120) {
    return NextResponse.json({ error: "Topic and scope are too long." }, { status: 400 });
  }

  const scope = await callerScope(user.id, user.roles);
  if (scopeType === "network") {
    if (!scope.admin) return NextResponse.json({ error: "Network-wide coverage is admin-only." }, { status: 403 });
  } else if (scopeType === "class") {
    if (!scope.classIds.has(b.scope_id)) return NextResponse.json({ error: "That class is outside your scope." }, { status: 403 });
  } else if (!scope.schools.has(b.scope_id)) {
    return NextResponse.json({ error: "That school is outside your scope." }, { status: 403 });
  }

  const row = await markCovered({
    course: (b.course || "9702").trim() || "9702",
    topic: b.topic.trim(),
    scopeType,
    scopeId: b.scope_id.trim(),
    scopeLabel: (b.scope_label || b.scope_id).trim().slice(0, 120),
    coveredBy: user.id,
    coveredByName: user.fullName || user.email,
    note: b.note,
  });
  if (!row) return NextResponse.json({ error: "Could not save coverage." }, { status: 500 });
  return NextResponse.json({ ok: true, row }, { status: 200 });
}

export async function DELETE(req: Request) {
  const user = await getPortalUser();
  if (!user || !isExamLabStaff(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as {
    course?: string; topic?: string; scope_type?: string; scope_id?: string;
  } | null;
  if (!b?.topic || !b?.scope_type || !b?.scope_id) {
    return NextResponse.json({ error: "course, topic, scope_type and scope_id are required." }, { status: 400 });
  }
  const scopeType = b.scope_type as CoverageScopeType;
  const scope = await callerScope(user.id, user.roles);
  if (scopeType === "network") {
    if (!scope.admin) return NextResponse.json({ error: "Network-wide coverage is admin-only." }, { status: 403 });
  } else if (scopeType === "class") {
    if (!scope.classIds.has(b.scope_id)) return NextResponse.json({ error: "That class is outside your scope." }, { status: 403 });
  } else if (!scope.schools.has(b.scope_id)) {
    return NextResponse.json({ error: "That school is outside your scope." }, { status: 403 });
  }
  const ok = await uncover((b.course || "9702").trim() || "9702", scopeType, b.scope_id, b.topic);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
