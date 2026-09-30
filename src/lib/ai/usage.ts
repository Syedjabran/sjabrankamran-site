// SERVER-ONLY. Per-student and global daily AI usage counters, so the Groq
// free tier (1,000 requests/day) is never exhausted and one student can't
// starve the others. Counters live at
//   portal-data/sat/ai-usage/<uid>/<date>.json        { tutor, insights, parent }
//   portal-data/sat/ai-usage/_global/<date>.json      { n }
// Storage fails closed (see storage-fresh.ts): a failed counter read denies
// the call rather than being treated as "no usage yet" -- as "unavailable"
// (try again in a moment), never as a spent budget. The rules themselves are
// pure, in usage-core.ts.
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { LIMITS, asStudentCounters, checkGlobal, checkStudent, globalCapFor, remainingFrom, type BudgetDenial, type Purpose, type StudentCounters } from "./usage-core.ts";

export { LIMITS };

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

const studentPath = (uid: string, date: string) => `sat/ai-usage/${uid}/${date}.json`;
const globalPath = (date: string) => `sat/ai-usage/_global/${date}.json`;

const DEFAULT_GLOBAL_BUDGET = 800;

function globalBudget(): number {
  const raw = Number(process.env.SAT_AI_DAILY_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_GLOBAL_BUDGET;
}

/**
 * Checks and (best-effort) increments today's counters for one AI call.
 * Denies (fails closed) when the global daily budget is spent ("global" --
 * for insights already at 70% of it, usage-core.ts globalCapFor),
 * when this student is over their per-purpose limit ("student"), or when a
 * counter can't be read ("unavailable" -- a passing storage failure, not a
 * spent budget). `uid: null` skips the per-student check (global budget
 * only) — used where no student is on the other end of the call.
 */
export async function takeBudget(
  uid: string | null,
  purpose: Purpose,
  today: string,
): Promise<{ ok: true; remaining: number } | { ok: false; reason: BudgetDenial }> {
  if (!SAFE_DATE.test(today)) return { ok: false, reason: "unavailable" };

  // Insights stop at 70% of the day's budget, so the tutor always has a share left.
  const global = checkGlobal(await readFreshJson<unknown>(BUCKET, globalPath(today)), globalCapFor(purpose, globalBudget()));
  if (!global.ok) return global;

  let student: StudentCounters | null = null;
  if (uid != null) {
    if (!SAFE_UID.test(uid)) return { ok: false, reason: "unavailable" };
    const checked = checkStudent(await readFreshJson<unknown>(BUCKET, studentPath(uid, today)), purpose);
    if (!checked.ok) return checked;
    student = checked.counters;
  }

  // Best-effort increments: a failed write doesn't fail the call that already
  // passed both checks (a missed increment only under-counts usage, never
  // lets a denied call through).
  await writeFreshJson(BUCKET, globalPath(today), { n: global.counters.n + 1 });
  let remaining = LIMITS[purpose];
  if (uid != null && student) {
    remaining = LIMITS[purpose] - student[purpose] - 1;
    await writeFreshJson(BUCKET, studentPath(uid, today), { ...student, [purpose]: student[purpose] + 1 });
  }

  return { ok: true, remaining: Math.max(0, remaining) };
}

/** Gives back one of today's per-student `purpose` calls after the AI call
 *  it paid for failed (spec §11: a failed tutor turn is not counted). The
 *  global counter keeps it -- the provider request was still made. Best
 *  effort: an unreadable counter or a failed write leaves it counted. */
export async function refundBudget(uid: string, purpose: Purpose, today: string): Promise<void> {
  if (!SAFE_UID.test(uid) || !SAFE_DATE.test(today)) return;
  const fresh = await readFreshJson<unknown>(BUCKET, studentPath(uid, today));
  if (!fresh.ok || fresh.data == null) return;
  const counters = asStudentCounters(fresh.data);
  if (counters[purpose] <= 0) return;
  await writeFreshJson(BUCKET, studentPath(uid, today), { ...counters, [purpose]: counters[purpose] - 1 });
}

/** Tutor messages left today for this student (the "n left today" line),
 *  or null when the counter can't be read -- "couldn't check", never "0
 *  left" (the turn itself re-checks and fails closed). */
export async function tutorRemaining(uid: string, today: string): Promise<number | null> {
  if (!SAFE_UID.test(uid) || !SAFE_DATE.test(today)) return null;
  return remainingFrom(await readFreshJson<unknown>(BUCKET, studentPath(uid, today)), "tutor");
}
