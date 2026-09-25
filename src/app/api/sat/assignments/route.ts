// src/app/api/sat/assignments/route.ts
//
// Teacher-assigned SAT work (Task 9): an exam-lab staff member assigns an
// adaptive mock, an official practice test, or a filtered drill to the SAT
// students in their own scope. GET returns the caller's own list (the hub's
// "Assigned to you"); POST is staff-only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { scopedSatStudents } from "@/lib/sat/access";
import { getRegistry } from "@/lib/portal/institutions";
import { notify } from "@/lib/portal/notifications";
import { pkDateTimeToIso, formatPk } from "@/lib/portal/pk-time";
import { listAssignments, addAssignments, type SATAssignment } from "@/lib/sat/assignments";
import { drillTitle, DRILL_MIN, DRILL_MAX } from "@/lib/sat/drills";
import type { AssignmentView } from "@/lib/sat/client-types";

export const runtime = "nodejs";

// Duplicated from src/app/api/sat/sessions/route.ts rather than imported --
// that file keeps the same local literal list for the same reason (a tiny,
// stable set of string literals; nothing here justifies a shared constants
// module across the two routes).
const SAT_DOMAINS = [
  "information-ideas", "craft-structure", "expression-ideas", "standard-english",
  "algebra", "advanced-math", "psda", "geometry-trig",
] as const;

const filterSchema = z.object({
  section: z.enum(["rw", "math"]).optional(),
  domain: z.enum(SAT_DOMAINS).optional(),
  difficulty: z.enum(["E", "M", "H"]).optional(),
  skill: z.string().max(120).optional(),
});

// Shared by every kind branch below (spread, not a nested z.object -- zod's
// discriminatedUnion needs "kind" as a literal directly on each object).
const recipients = {
  classIds: z.array(z.string().max(64)).max(100).optional(),
  studentUids: z.array(z.string().max(64)).max(1000).optional(),
  dueAt: z.string().max(40).optional(),
  idempotencyKey: z.string().uuid(),
};

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adaptive"), ...recipients }),
  z.object({ kind: z.literal("practice"), testNo: z.number().int().min(1).max(99), ...recipients }),
  z.object({ kind: z.literal("drill"), filter: filterSchema.optional(), count: z.number().int().min(DRILL_MIN).max(DRILL_MAX), ...recipients }),
]);

const unavailable = () => NextResponse.json({ error: "Your assignments couldn't be loaded. Please try again." }, { status: 503 });

function toView(a: SATAssignment): AssignmentView {
  return { id: a.id, kind: a.kind, title: a.title, testNo: a.testNo, dueAt: a.dueAt, status: a.status, sessionId: a.sessionId, assignedByName: a.assignedByName };
}

export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (new URL(req.url).searchParams.get("mine") !== "1") return NextResponse.json({ error: "Unsupported request." }, { status: 400 });

  const items = await listAssignments(user.id);
  if (items === null) return unavailable();

  // Not-done first, then soonest due (no due date last), then most recently
  // assigned -- a pure display order; storage order is whatever the merge
  // left it in.
  const rank = (a: SATAssignment) => (a.status === "done" ? 1 : 0);
  const dueMs = (a: SATAssignment) => (a.dueAt ? Date.parse(a.dueAt) : Infinity);
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || dueMs(a) - dueMs(b) || b.assignedAt.localeCompare(a.assignedAt));
  return NextResponse.json({ items: sorted.map(toView) });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isExamLabStaff(user.roles)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data;

  let dueAt: string | null = null;
  if (b.dueAt) {
    dueAt = pkDateTimeToIso(b.dueAt);
    if (!dueAt) return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    if (Date.parse(dueAt) <= Date.now()) return NextResponse.json({ error: "The due date must be in the future." }, { status: 400 });
  }

  let registry;
  try {
    registry = await getRegistry();
  } catch {
    return unavailable();
  }
  if (!registry.classes.length) return unavailable();

  const scoped = await scopedSatStudents(user, registry);
  if (scoped === null) return unavailable();

  // Recipients = the caller's SAT class scope INTERSECTED with whichever of
  // classIds/studentUids the request named. Neither named -> nobody (falls
  // into the "No SAT students in scope" 400 below, same as an unrecognised
  // class/uid would).
  const classSet = new Set(b.classIds ?? []);
  const uidSet = new Set(b.studentUids ?? []);
  const recipientUids = [...new Set(scoped.filter((s) => classSet.has(s.classId) || uidSet.has(s.uid)).map((s) => s.uid))];
  if (!recipientUids.length) return NextResponse.json({ error: "No SAT students in scope." }, { status: 400 });

  const title =
    b.kind === "adaptive" ? "Adaptive mock exam" :
    b.kind === "practice" ? `Practice Test ${b.testNo}` :
    drillTitle(b.filter ?? {});

  const assignment: SATAssignment = {
    id: b.idempotencyKey,
    kind: b.kind,
    title,
    testNo: b.kind === "practice" ? b.testNo : null,
    filter: b.kind === "drill" ? (b.filter ?? {}) : null,
    count: b.kind === "drill" ? b.count : null,
    dueAt,
    assignedBy: user.id,
    assignedByName: user.fullName || "Your teacher",
    assignedAt: new Date().toISOString(),
    status: "assigned",
    sessionId: null,
  };

  const { added, failed, newUids } = await addAssignments(recipientUids, assignment);
  // Re-notifying no one who already had it (idempotencyKey ruling): only
  // the uids `addAssignments` actually saw for the first time get a bell.
  if (newUids.length) {
    await notify({ uids: newUids }, {
      type: "assignment",
      title: `New SAT work: ${title}`,
      body: dueAt ? `Due ${formatPk(dueAt)}` : null,
      href: "/portal/sat-lab",
    });
  }
  return NextResponse.json({ added, failed });
}
