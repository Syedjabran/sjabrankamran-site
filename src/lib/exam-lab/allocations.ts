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
 */
import { createAdminClient } from "@/lib/supabase/admin";

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

export type AllocStatus = "assigned" | "submitted" | "locked" | "unlocked" | "cancelled";

export type ExamAllocation = {
  id: string;
  attemptId: string;            // deterministic: `alloc-<id>`
  mode: AllocMode;
  content: AllocContent;
  title: string;
  instructions: string | null;
  durationMin: number | null;   // optional override
  dueAt: string | null;
  startsAt: string | null;
  classId: string | null;
  className: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  status: AllocStatus;
  completedAt: number | null;
};

type Store = { items: ExamAllocation[] };

async function read(uid: string): Promise<Store> {
  try {
    const { data } = await createAdminClient().storage.from(DATA).download(apath(uid));
    if (data) return JSON.parse(await data.text()) as Store;
  } catch { /* none */ }
  return { items: [] };
}
async function write(uid: string, store: Store): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify(store)], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(DATA).upload(apath(uid), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch { return false; }
}

export async function listAllocations(uid: string): Promise<ExamAllocation[]> {
  const s = await read(uid);
  return [...s.items].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllocation(uid: string, id: string): Promise<ExamAllocation | null> {
  const s = await read(uid);
  return s.items.find((x) => x.id === id) || null;
}

/** Fan one allocation out to a set of student uids. Returns the created id. */
export async function allocateToStudents(
  uids: string[],
  base: Omit<ExamAllocation, "attemptId" | "createdAt" | "updatedAt" | "status" | "completedAt">,
): Promise<string> {
  const now = Date.now();
  const attemptId = `alloc-${base.id}`;
  for (const uid of uids) {
    const s = await read(uid);
    // de-dupe by id
    if (!s.items.some((x) => x.id === base.id)) {
      s.items.unshift({ ...base, attemptId, createdAt: now, updatedAt: now, status: "assigned", completedAt: null });
      if (!await write(uid, s.items.length > 300 ? { items: s.items.slice(0, 300) } : s)) throw new Error("Could not save every allocation. Please retry.");
    }
  }
  return base.id;
}

/** Student marks their own allocation submitted (non-strict flows). */
export async function markSubmitted(uid: string, id: string): Promise<boolean> {
  const s = await read(uid);
  const it = s.items.find((x) => x.id === id);
  if (!it) return false;
  it.status = "submitted";
  it.completedAt = Date.now();
  it.updatedAt = Date.now();
  return write(uid, s);
}
