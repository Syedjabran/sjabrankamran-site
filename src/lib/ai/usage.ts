// SERVER-ONLY. Per-student and global daily AI usage counters, so the Groq
// free tier (1,000 requests/day) is never exhausted and one student can't
// starve the others. Counters live at
//   portal-data/sat/ai-usage/<uid>/<date>.json        { tutor, insights, parent }
//   portal-data/sat/ai-usage/_global/<date>.json      { n }
// Storage fails closed (see storage-fresh.ts): a failed counter read denies
// the call rather than being treated as "no usage yet".
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

const studentPath = (uid: string, date: string) => `sat/ai-usage/${uid}/${date}.json`;
const globalPath = (date: string) => `sat/ai-usage/_global/${date}.json`;

/** Per-student daily message limits, PKT calendar day. */
export const LIMITS = { tutor: 40, insights: 6, parent: 2 } as const;

const DEFAULT_GLOBAL_BUDGET = 800;

function globalBudget(): number {
  const raw = Number(process.env.SAT_AI_DAILY_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_GLOBAL_BUDGET;
}

type StudentCounters = { tutor: number; insights: number; parent: number };
type GlobalCounters = { n: number };

const asCount = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

function asStudentCounters(raw: unknown): StudentCounters {
  const d = raw as Partial<StudentCounters> | null;
  return { tutor: asCount(d?.tutor), insights: asCount(d?.insights), parent: asCount(d?.parent) };
}

function asGlobalCounters(raw: unknown): GlobalCounters {
  const d = raw as Partial<GlobalCounters> | null;
  return { n: asCount(d?.n) };
}

/**
 * Checks and (best-effort) increments today's counters for one AI call.
 * Denies (fails closed) when either counter can't be read, when the global
 * daily budget is spent, or when this student is over their per-purpose
 * limit. `uid: null` skips the per-student check (global budget only) —
 * used where no student is on the other end of the call.
 */
export async function takeBudget(
  uid: string | null,
  purpose: "insights" | "tutor" | "parent",
  today: string,
): Promise<{ ok: true; remaining: number } | { ok: false; reason: "student" | "global" }> {
  if (!SAFE_DATE.test(today)) return { ok: false, reason: "global" };

  const globalFresh = await readFreshJson<unknown>(BUCKET, globalPath(today));
  if (!globalFresh.ok) return { ok: false, reason: "global" };
  const global = asGlobalCounters(globalFresh.data);
  if (global.n >= globalBudget()) return { ok: false, reason: "global" };

  let student: StudentCounters | null = null;
  if (uid != null) {
    if (!SAFE_UID.test(uid)) return { ok: false, reason: "student" };
    const studentFresh = await readFreshJson<unknown>(BUCKET, studentPath(uid, today));
    if (!studentFresh.ok) return { ok: false, reason: "student" };
    student = asStudentCounters(studentFresh.data);
    if (student[purpose] >= LIMITS[purpose]) return { ok: false, reason: "student" };
  }

  // Best-effort increments: a failed write doesn't fail the call that already
  // passed both checks (a missed increment only under-counts usage, never
  // lets a denied call through).
  await writeFreshJson(BUCKET, globalPath(today), { n: global.n + 1 });
  let remaining = LIMITS[purpose];
  if (uid != null && student) {
    remaining = LIMITS[purpose] - student[purpose] - 1;
    await writeFreshJson(BUCKET, studentPath(uid, today), { ...student, [purpose]: student[purpose] + 1 });
  }

  return { ok: true, remaining: Math.max(0, remaining) };
}

/** Tutor messages left today for this student (for the "n left today" UI);
 *  fails closed to 0 when the counter can't be read. */
export async function tutorRemaining(uid: string, today: string): Promise<number> {
  if (!SAFE_UID.test(uid) || !SAFE_DATE.test(today)) return 0;
  const fresh = await readFreshJson<unknown>(BUCKET, studentPath(uid, today));
  if (!fresh.ok) return 0;
  const counters = asStudentCounters(fresh.data);
  return Math.max(0, LIMITS.tutor - counters.tutor);
}
