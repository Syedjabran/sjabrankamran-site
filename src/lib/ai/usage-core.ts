// Pure rules behind the SAT Coach's daily AI budgets (src/lib/ai/usage.ts
// reads and writes the counters in Storage): what one counter read allows.
// No storage, no `process.env`, no `@/` alias -- Node-testable
// (scripts/test-llm-core.mjs).
//
// A counter that can't be read is "unavailable" -- never "0 left" and never
// "spent": the call is still refused (fails closed), but the student is told
// to try again in a moment, not to come back tomorrow.

/** Per-student daily limits per purpose, PKT calendar day. */
export const LIMITS = { tutor: 40, insights: 6, parent: 2 } as const;

export type Purpose = keyof typeof LIMITS;
/** A counter read: `{ ok: true, data: null }` = no counter yet (nothing used). */
export type CounterRead = { ok: true; data: unknown } | { ok: false };
export type StudentCounters = Record<Purpose, number>;
export type GlobalCounters = { n: number };
/** Why a call gets no budget: this student's limit, the global daily cap,
 *  or a counter that couldn't be read. */
export type BudgetDenial = "student" | "global" | "unavailable";

const asCount = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function asStudentCounters(raw: unknown): StudentCounters {
  const d = raw as Partial<StudentCounters> | null;
  return { tutor: asCount(d?.tutor), insights: asCount(d?.insights), parent: asCount(d?.parent) };
}

export function asGlobalCounters(raw: unknown): GlobalCounters {
  const d = raw as Partial<GlobalCounters> | null;
  return { n: asCount(d?.n) };
}

/** The global counter's verdict: its counts, "global" once `budget` calls
 *  are used today, "unavailable" when it couldn't be read. */
export function checkGlobal(read: CounterRead, budget: number): { ok: true; counters: GlobalCounters } | { ok: false; reason: "global" | "unavailable" } {
  if (!read.ok) return { ok: false, reason: "unavailable" };
  const counters = asGlobalCounters(read.data);
  return counters.n >= budget ? { ok: false, reason: "global" } : { ok: true, counters };
}

/** One student's verdict for `purpose`: their counts, "student" once the
 *  day's limit is used, "unavailable" when the counter couldn't be read. */
export function checkStudent(read: CounterRead, purpose: Purpose): { ok: true; counters: StudentCounters } | { ok: false; reason: "student" | "unavailable" } {
  if (!read.ok) return { ok: false, reason: "unavailable" };
  const counters = asStudentCounters(read.data);
  return counters[purpose] >= LIMITS[purpose] ? { ok: false, reason: "student" } : { ok: true, counters };
}

/** Calls of `purpose` left today, or null when the counter couldn't be read
 *  (the tutor then says "couldn't check", not "none left"). */
export function remainingFrom(read: CounterRead, purpose: Purpose): number | null {
  if (!read.ok) return null;
  return Math.max(0, LIMITS[purpose] - asStudentCounters(read.data)[purpose]);
}
