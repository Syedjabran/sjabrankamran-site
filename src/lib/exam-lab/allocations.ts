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
import { createAdminClient } from "@/lib/supabase/admin";
import { createFreshJson, readFreshJson, writeFreshJson } from "./storage-fresh";
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

/** `in_progress`: the student has begun (see `startedAt`); a proctored test resumes the same clock on reload. */
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
  /**
   * Legacy randomised specs (`drill` / `daily`) only: the exact question ids
   * this student sits, frozen on the server when they first open it
   * (freezeAllocationIds). The attempt route accepts exactly these ids, and
   * they never reach the student's allocation list (answer-rules.ts
   * publicAllocation).
   */
  frozenIds?: string[];
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
 * reopen) return that same start so a proctored test's clock resumes instead
 * of restarting. Other kinds only use it for the status: each open of those
 * starts a fresh clock in the runner.
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

// The set a legacy spec froze at its first open, as a write-once object: the
// arbiter when two tabs open it at once (the first create wins, the other
// adopts it), and the record that survives if a stale whole-doc writer
// drops `frozenIds` from the allocations doc.
const frozenPath = (uid: string, id: string) => `exam-allocations/frozen/${uid}/${id}.json`;
const FROZEN_SAFE = /^[A-Za-z0-9_-]{1,120}$/;

/** The write-once frozen set of one allocation: the ids, undefined when none
 *  was ever frozen, or null when it could not be read. */
export async function readFrozenIds(uid: string, id: string): Promise<string[] | undefined | null> {
  if (!FROZEN_SAFE.test(uid) || !FROZEN_SAFE.test(id)) return undefined;
  const r = await readFreshJson<{ ids?: unknown }>(DATA, frozenPath(uid, id));
  if (!r.ok) return null;
  const ids = r.data?.ids;
  return Array.isArray(ids) && ids.length && ids.every((x) => typeof x === "string") ? (ids as string[]) : undefined;
}

const sameList = (a: string[] | undefined, b: string[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

const isLegacySpec = (a: ExamAllocation) => a.content.type === "drill" || a.content.type === "daily";
const FROZEN_LIST_LIMIT = 1000;

/** The allocation ids with a write-once frozen record (one listing), or
 *  "all" when the listing is full and can't be trusted to be complete.
 *  THROWS when the listing fails. */
async function frozenRecordIds(uid: string): Promise<Set<string> | "all"> {
  const { data, error } = await createAdminClient().storage.from(DATA).list(`exam-allocations/frozen/${uid}`, { limit: FROZEN_LIST_LIMIT });
  if (error) throw new Error("Could not list the frozen papers.");
  const names = (data ?? []).map((f) => f.name);
  if (names.length >= FROZEN_LIST_LIMIT) return "all";
  return new Set(names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)));
}

/**
 * `items`, with the frozen set restored from its write-once record on every
 * legacy randomised item (`drill` / `daily`) that `needs` it and whose copy
 * on the allocations doc is missing -- a stale whole-doc write can drop
 * `frozenIds` from the doc, never the record, so a hold follows the set the
 * student can still submit. One listing of the student's records, then a
 * read of each one needed (an item never opened has none: nothing frozen,
 * nothing held). THROWS when the listing or a record can't be read: a hold
 * never lapses because storage failed (callers refuse).
 */
export async function withFrozenSets(uid: string, items: ExamAllocation[], needs: (a: ExamAllocation) => boolean): Promise<ExamAllocation[]> {
  const todo = items.filter((a) => isLegacySpec(a) && !(a.frozenIds && a.frozenIds.length) && needs(a));
  if (!todo.length || !FROZEN_SAFE.test(uid)) return items;
  const listed = await frozenRecordIds(uid);
  const restored = new Map<string, string[]>();
  await Promise.all(todo.filter((a) => listed === "all" || listed.has(a.id)).map(async (a) => {
    const ids = await readFrozenIds(uid, a.id);
    if (ids === null) throw new Error("Could not read the paper.");
    if (ids) restored.set(a.id, ids);
  }));
  return restored.size ? items.map((a) => (restored.has(a.id) ? { ...a, frozenIds: restored.get(a.id) } : a)) : items;
}

/**
 * The ids a legacy randomised allocation (`drill` / `daily`) is sat with:
 * the ones already frozen, or `pick()` frozen now (first open). Race-safe:
 * the set is created write-once (the first opener wins and every other tab
 * adopts it), then copied onto the allocation and read back to verify.
 * Returns null when the allocation does not exist; THROWS on any storage
 * failure or an unverifiable write, so a sitting never opens on ids the
 * attempt route would not recognise (fails closed).
 */
export async function freezeAllocationIds(uid: string, id: string, pick: () => string[] | Promise<string[]>): Promise<string[] | null> {
  const first = await read(uid);
  const it = first.items.find((x) => x.id === id);
  if (!it) return null;
  if (it.frozenIds && it.frozenIds.length) return it.frozenIds;
  if (!FROZEN_SAFE.test(uid) || !FROZEN_SAFE.test(id)) throw new Error("Could not save the paper.");
  let ids = await readFrozenIds(uid, id);
  if (ids === null) throw new Error("Could not read the paper.");
  if (!ids) {
    const mine = await pick();
    if (!mine.length) return [];
    if (!(await createFreshJson(DATA, frozenPath(uid, id), { ids: mine }))) {
      // Another opener got there first (or the create failed): adopt what is stored.
      const theirs = await readFrozenIds(uid, id);
      if (!theirs) throw new Error("Could not save the paper.");
      ids = theirs;
    } else {
      ids = mine;
    }
  }
  // Copy it onto the allocation (cheap reads for holds and attempts) and
  // verify it landed: a concurrent whole-doc writer may have dropped it.
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await read(uid);
    const cur = s.items.find((x) => x.id === id);
    if (!cur) return null;
    if (sameList(cur.frozenIds, ids)) return ids;
    cur.frozenIds = ids;
    cur.updatedAt = Date.now();
    if (!await write(uid, s)) throw new Error("Could not save the paper.");
  }
  const check = (await read(uid)).items.find((x) => x.id === id);
  if (check && sameList(check.frozenIds, ids)) return ids;
  throw new Error("Could not save the paper.");
}

// The durable record of an allocation's graded submissions: one write-once
// object per submission slot, exam-allocations/graded/<uid>/<allocId>/<n>.json
// (slot n = the (n+1)-th graded submission). The attempt history keeps only
// the last 800 attempts, so it can't be what decides whether a submission is
// still allowed -- ~800 practice submissions would push an allocation's
// graded one out of it. Nothing ever deletes these.
// (An allocation id outside the safe path alphabet -- none is made today --
// is spelled in hex rather than refused, so it can never block submissions.)
const gradedDir = (uid: string, id: string) => `exam-allocations/graded/${uid}/${FROZEN_SAFE.test(id) ? id : `h-${Buffer.from(id).toString("hex").slice(0, 200)}`}`;
const GRADED_SLOT = /^(\d{1,4})\.json$/;

/** How many graded submissions the durable record holds for an allocation
 *  (the highest slot + 1). THROWS when it can't be listed. */
export async function gradedCount(uid: string, id: string): Promise<number> {
  if (!FROZEN_SAFE.test(uid)) throw new Error("Could not read the submission record.");
  const { data, error } = await createAdminClient().storage.from(DATA).list(gradedDir(uid, id), { limit: 1000 });
  if (error) throw new Error("Could not read the submission record.");
  let n = 0;
  for (const f of data ?? []) {
    const m = GRADED_SLOT.exec(f.name);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return n;
}

/**
 * Makes the durable record hold at least `count` graded submissions for the
 * allocation (writes slot count-1, write-once: a slot that already exists
 * is never overwritten). True when the record now holds it; false when it
 * could not be written or confirmed.
 */
export async function recordGraded(uid: string, id: string, count: number, entry: Record<string, unknown> = {}): Promise<boolean> {
  if (count < 1 || !FROZEN_SAFE.test(uid)) return false;
  const path = `${gradedDir(uid, id)}/${count - 1}.json`;
  if (await createFreshJson(DATA, path, { at: Date.now(), ...entry })) return true;
  const r = await readFreshJson(DATA, path); // already there (a retry, or a concurrent save), or the write failed
  return r.ok && r.data !== null;
}

/** The guard mode an allocation runs under (mirrors `allocCfg` in papers-hub). */
export function isStrictAlloc(it: ExamAllocation): boolean {
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
