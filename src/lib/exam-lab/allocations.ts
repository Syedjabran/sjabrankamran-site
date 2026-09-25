/**
 * Exam Lab allocations. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * Staff assign an Exam Lab drill to a whole class as one of three modes:
 *   assignment_help    → relaxed (no cancellation), help allowed
 *   assignment_nohelp  → guarded (cancels on tab/split/screenshot), help logged
 *   test               → strict proctored test (camera + AI proctor + lock)
 *
 * Assignment allocations may be created by any staff member; a strict TEST may
 * only be created by a super-admin. Like personal-tasks, an allocation is
 * fanned out into each active student's own doc so the student read is a single
 * download:
 *   portal-data/exam-allocations/<uid>.json → { items: ExamAllocation[] }
 *
 * For test allocations the forensic session id is deterministic (alloc-<id>) so
 * re-entry maps to the same proctor record (a locked test stays locked).
 *
 * Reads are cache-busted and FAIL CLOSED: a doc that exists but cannot be read
 * throws instead of reading as empty, so no writer ever replaces a student's
 * allocations with a near-empty list.
 */
import { readFreshJson, writeFreshJson } from "./storage-fresh";
import { getSession, type ProctorStatus } from "./proctor";

const DATA = "portal-data";
const apath = (uid: string) => `exam-allocations/${uid}.json`;
export function newAllocId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export type AllocMode = "assignment_help" | "assignment_nohelp" | "test";

/**
 * The two RANDOMISED specs. Historically these were stored on the allocation
 * itself and re-resolved in the browser for every student and every re-open,
 * so no two students ever sat the same paper. They are kept verbatim because
 * allocations already saved in production carry this shape and must keep
 * working exactly as they do today; new allocations use `drillref` instead.
 */
export type DrillSpecContent =
  | { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number }
  | { type: "daily" };

export type AllocContent =
  | { type: "paper"; code: string }
  | DrillSpecContent
  | { type: "custom"; ids: string[] } // hand-picked question ids from the bank
  /**
   * Deterministic drill: the paper was frozen ONCE at allocation time and the
   * exact question ids (in their exact order) travel with the allocation, so
   * every recipient sits the identical paper and a close-and-reopen replays
   * it byte-for-byte. `drillId`/`ref` point at the stored DrillRecord holding
   * the full snapshot; `spec` is the original randomised spec, retained only
   * as a degradation path if the question bank ever loses those ids.
   */
  | { type: "drillref"; drillId: string; ref: string; ids: string[]; spec: DrillSpecContent | { type: "paper"; code: string } | { type: "custom"; ids: string[] } };

/** `in_progress`: the student has begun (see `startedAt`); a reload resumes the same clock. */
export type AllocStatus = "assigned" | "in_progress" | "submitted" | "locked" | "unlocked" | "cancelled";

export type ExamAllocation = {
  id: string;
  attemptId: string;            // deterministic: `alloc-<id>`
  mode: AllocMode;
  content: AllocContent;
  title: string;
  instructions: string | null;
  durationMin: number | null;   // optional override
  lockOnExpiry?: boolean;       // when false: countdown is shown but never auto-submits/locks (default: locking)
  integrity?: "off" | "standard" | "strict"; // override the proctoring guard; "off" never cancels on tab-switch/blur (default: derived from mode)
  dueAt: string | null;
  startsAt: string | null;
  classId: string | null;
  className: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  status: AllocStatus;
  /** Server time the current sitting began (first `started` call wins). */
  startedAt?: number | null;
  completedAt: number | null;
  /** The submission finished past the countdown (daily task) — recorded, never blocked. */
  lateSubmission?: boolean;
  /** The submission contained zero attempted answers — earns no points/credit. */
  unattempted?: boolean;
  /** Automated daily study-plan challenge (relaxed, late-submission recording). */
  daily?: boolean;
};

type Store = { items: ExamAllocation[] };

/** THROWS when the doc exists but could not be read (missing doc = empty). */
async function read(uid: string): Promise<Store> {
  const r = await readFreshJson<Store>(DATA, apath(uid));
  if (!r.ok) throw new Error("Could not read allocations.");
  return { items: Array.isArray(r.data?.items) ? r.data.items : [] };
}
function write(uid: string, store: Store): Promise<boolean> {
  return writeFreshJson(DATA, apath(uid), store);
}

/** Throws on an unreadable doc — display callers `.catch(() => [])`. */
export async function listAllocations(uid: string): Promise<ExamAllocation[]> {
  const s = await read(uid);
  return [...s.items].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllocation(uid: string, id: string): Promise<ExamAllocation | null> {
  const s = await read(uid);
  return s.items.find((x) => x.id === id) || null;
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export type FanoutResult = { id: string; created: string[]; existing: string[]; failed: string[] };

/**
 * Fan one allocation out to a set of student uids, 8 docs at a time, so a big
 * group finishes inside the route's time budget. A student who already holds
 * this allocation id is skipped (a retried request never duplicates), and one
 * failed doc no longer stops the rest: every uid lands in exactly one bucket.
 */
export async function allocateToStudentsDetailed(
  uids: string[],
  base: Omit<ExamAllocation, "attemptId" | "createdAt" | "updatedAt" | "status" | "completedAt">,
  concurrency = 8,
): Promise<FanoutResult> {
  const now = Date.now();
  const attemptId = `alloc-${base.id}`;
  const out: FanoutResult = { id: base.id, created: [], existing: [], failed: [] };
  await eachLimited(uids, concurrency, async (uid) => {
    try {
      const s = await read(uid);
      if (s.items.some((x) => x.id === base.id)) { out.existing.push(uid); return; }
      s.items.unshift({ ...base, attemptId, createdAt: now, updatedAt: now, status: "assigned", completedAt: null });
      const ok = await write(uid, s.items.length > 300 ? { items: s.items.slice(0, 300) } : s);
      (ok ? out.created : out.failed).push(uid);
    } catch {
      out.failed.push(uid);
    }
  });
  return out;
}

/** Fan one allocation out to a set of student uids. Returns the id; throws if any failed. */
export async function allocateToStudents(
  uids: string[],
  base: Omit<ExamAllocation, "attemptId" | "createdAt" | "updatedAt" | "status" | "completedAt">,
): Promise<string> {
  const r = await allocateToStudentsDetailed(uids, base);
  if (r.failed.length) throw new Error("Could not save every allocation. Please retry.");
  return base.id;
}

/**
 * The student began this allocation. The FIRST call records the server start
 * time and moves the allocation to `in_progress`; later calls (reload, Back and
 * reopen) return that same start so the clock resumes instead of restarting.
 * `restart` = a sanctioned fresh sitting (a super-admin unlocked the test).
 * Returns null when the allocation does not exist; throws on storage failure.
 */
export async function markStarted(uid: string, id: string, restart = false): Promise<ExamAllocation | null> {
  const s = await read(uid);
  const it = s.items.find((x) => x.id === id);
  if (!it) return null;
  if (!restart && (it.status === "submitted" || (it.startedAt && it.status === "in_progress"))) return it;
  const now = Date.now();
  if (restart || !it.startedAt) it.startedAt = now;
  it.status = "in_progress";
  it.updatedAt = now;
  if (!await write(uid, s)) throw new Error("Could not record the start.");
  return it;
}

/** The guard mode an allocation runs under (mirrors `allocCfg` in papers-hub). */
function isStrictAlloc(it: ExamAllocation): boolean {
  return (it.integrity ?? (it.mode === "test" ? "strict" : it.mode === "assignment_nohelp" ? "standard" : "off")) === "strict";
}

/**
 * Effective status of an allocation. For a proctored (strict) sitting the
 * forensic session is the source of truth for locks; otherwise, and when there
 * is no session yet, the allocation's own status stands. Shared by the
 * student's list and the staff submissions view so both always agree.
 */
export function reconcileAllocStatus(it: ExamAllocation, session: { status: ProctorStatus } | null): AllocStatus {
  if (!session || !isStrictAlloc(it)) return it.status;
  if (session.status !== "active") return session.status;
  // An open session: never un-submit a recorded submission.
  return it.status === "submitted" ? "submitted" : it.startedAt ? "in_progress" : "assigned";
}

/** `it` with its effective status (reads the proctor session for strict sittings). */
export async function withProctorStatus(uid: string, it: ExamAllocation): Promise<ExamAllocation> {
  if (!isStrictAlloc(it)) return it;
  const session = await getSession(uid, it.attemptId).catch(() => null);
  return session ? { ...it, status: reconcileAllocStatus(it, session) } : it;
}

/** Student marks their own allocation submitted (non-strict flows). Optional
 * integrity flags come from the just-stored attempt record so staff can see
 * late / empty submissions on the allocation itself. Returns false when the
 * allocation does not exist; throws when storage could not be read / written. */
export async function markSubmitted(uid: string, id: string, flags?: { late?: boolean; unattempted?: boolean }): Promise<boolean> {
  const s = await read(uid);
  const it = s.items.find((x) => x.id === id);
  if (!it) return false;
  it.status = "submitted";
  it.completedAt = Date.now();
  it.updatedAt = Date.now();
  // Flags describe THIS submission (a re-sit replaces the previous verdict).
  it.lateSubmission = !!flags?.late || undefined;
  it.unattempted = !!flags?.unattempted || undefined;
  if (!await write(uid, s)) throw new Error("Could not record the submission.");
  return true;
}
