/**
 * Super-admin Drill Records. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * Every Exam Lab drill/paper staff open and allot is captured here as a
 * permanent record WITH a snapshot of the exact question paper, so it can be
 * re-viewed later and audited: what was set, its name, which class/group it was
 * conducted for, when, and by whom.
 *
 * The snapshot is also the SOURCE OF TRUTH for what students sit: a new
 * allocation stores a `drillref` pointing at this record's frozen question
 * ids, which is what makes a class drill identical for every student and
 * identical again on every re-open.
 *
 *   portal-data/exam-drills/index.json      → { items: DrillRecordSummaryRow[] }
 *   portal-data/exam-drills/<id>.json       → { record: DrillRecord }  (full paper)
 *
 * The index keeps lightweight rows for fast listing; the per-drill file holds
 * the resolved question snapshot so a heavy paper never bloats the index.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { FULL_BANK, type ImgQuestion } from "@/lib/exam-lab/image-bank";
import type { AllocContent, AllocMode } from "@/lib/exam-lab/allocations";

const DATA = "portal-data";
const INDEX = "exam-drills/index.json";
const recPath = (id: string) => `exam-drills/${id}.json`;
export function newDrillId() { return `drill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

/**
 * Human reference number: DR-YYMM-XXXX (e.g. DR-2609-K7QM).
 * Uppercase, unambiguous alphabet — 0/O and 1/I are excluded so a reference
 * read off a whiteboard or dictated across a classroom cannot be mistyped.
 * 32^4 = ~1.05M combinations per month, and `reserveDrillRef` additionally
 * rejects any value already present in the index.
 */
const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const DRILL_REF_RE = /^DR-\d{4}-[2-9A-HJ-NP-Z]{4}$/;

export function newDrillRef(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const arr = new Uint32Array(4);
  globalThis.crypto.getRandomValues(arr);
  let s = "";
  for (const n of arr) s += REF_ALPHABET[n % REF_ALPHABET.length];
  return `DR-${yy}${mm}-${s}`;
}

/** A reference that is not already taken by a stored record. Never throws. */
export async function reserveDrillRef(): Promise<string> {
  try {
    const taken = new Set((await readIndex()).map((r) => r.ref).filter(Boolean));
    for (let i = 0; i < 8; i++) {
      const candidate = newDrillRef();
      if (!taken.has(candidate)) return candidate;
    }
  } catch { /* index unreadable — a fresh random ref is still fine */ }
  return newDrillRef();
}

/** Normalise a stored row/record: pre-ref records degrade to an empty ref. */
function withRef<T extends { ref?: unknown }>(r: T): T & { ref: string } {
  return { ...r, ref: typeof r.ref === "string" ? r.ref : "" };
}

export type DrillTargetType = "class" | "school" | "network" | "individual" | "group";

/** One question as stored in a paper snapshot (viewable after the fact). */
export type SnapshotQuestion = {
  id: string; ref: string; paperType: "P1" | "P2" | "P4"; code: string;
  qnum: number; topic: string | null; level: "LOT" | "HOT"; marks: number | null;
  img: string; ms_img: string | null; answer: string | null;
};

export type DrillRecord = {
  id: string;
  /**
   * Short human reference (DR-YYMM-XXXX) — the handle staff quote to find,
   * re-view and re-open this exact drill. Records written before this field
   * existed read back as ""; every consumer must tolerate that.
   */
  ref: string;
  allocationId: string;        // the ExamAllocation id fanned to students
  name: string;               // super-admin-chosen name for the drill
  mode: AllocMode;
  content: AllocContent;      // original spec (paper/drill/custom/daily)
  snapshot: SnapshotQuestion[]; // the EXACT question paper, frozen
  totalMarks: number;
  targetType: DrillTargetType;
  scopeLabel: string | null;  // human label (class name / school / group name)
  classId: string | null;     // when conducted for a single class
  className: string | null;
  classIds: string[];         // all classes the drill reached (group/school)
  studentCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: number;
};

export type DrillRecordSummaryRow = Omit<DrillRecord, "snapshot" | "content"> & { questionCount: number };

/**
 * Resolve an allocation content spec to the exact list of questions — the
 * frozen "question paper". For a random drill this fixes ONE concrete set so
 * the stored paper is deterministic and viewable afterwards.
 */
export function resolveSnapshot(content: AllocContent): ImgQuestion[] {
  if (content.type === "paper") {
    return FULL_BANK.filter((q) => q.code === content.code).sort((a, b) => a.qnum - b.qnum);
  }
  if (content.type === "custom" || content.type === "drillref") {
    // Both carry an explicit, already-frozen id list in its exact order.
    const byId = new Map(FULL_BANK.map((q) => [q.id, q] as const));
    return content.ids.map((id) => byId.get(id)).filter((q): q is ImgQuestion => !!q);
  }
  if (content.type === "drill") {
    const pool = FULL_BANK.filter(
      (q) => q.paperType === content.paperType &&
        (!content.topics.length || (q.topic && content.topics.includes(q.topic))) &&
        content.levels.includes(q.level),
    );
    // Deterministic-enough: shuffle once here so the stored paper is a single fixed set.
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, content.count);
  }
  // daily: 10 mixed Paper-1 questions
  const p1 = FULL_BANK.filter((q) => q.paperType === "P1");
  const a = [...p1];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, 10);
}

function toSnapshot(qs: ImgQuestion[]): SnapshotQuestion[] {
  return qs.map((q) => ({ id: q.id, ref: q.ref, paperType: q.paperType, code: q.code, qnum: q.qnum, topic: q.topic, level: q.level, marks: q.marks, img: q.img, ms_img: q.ms_img, answer: q.answer }));
}

function sb() { return createAdminClient(); }

async function readIndex(): Promise<DrillRecordSummaryRow[]> {
  try {
    const { data } = await sb().storage.from(DATA).download(INDEX);
    if (data) return (JSON.parse(await data.text())?.items || []) as DrillRecordSummaryRow[];
  } catch { /* none */ }
  return [];
}
async function writeIndex(items: DrillRecordSummaryRow[]): Promise<void> {
  const body = new Blob([JSON.stringify({ items: items.slice(0, 2000) })], { type: "application/json" });
  const { error } = await sb().storage.from(DATA).upload(INDEX, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error("Could not save drill index.");
}

/** Persist a drill record (index row + full snapshot file). Best-effort. */
export async function saveDrillRecord(
  base: Omit<DrillRecord, "snapshot" | "totalMarks" | "createdAt" | "ref"> & { snapshotQs: ImgQuestion[]; ref?: string },
): Promise<boolean> {
  try {
    const snapshot = toSnapshot(base.snapshotQs);
    const totalMarks = snapshot.reduce((s, q) => s + (q.marks || 0), 0);
    const record: DrillRecord = {
      id: base.id, ref: base.ref || newDrillRef(), allocationId: base.allocationId, name: base.name, mode: base.mode,
      content: base.content, snapshot, totalMarks, targetType: base.targetType,
      scopeLabel: base.scopeLabel, classId: base.classId, className: base.className,
      classIds: base.classIds, studentCount: base.studentCount, createdBy: base.createdBy,
      createdByName: base.createdByName, createdAt: Date.now(),
    };
    const body = new Blob([JSON.stringify({ record })], { type: "application/json" });
    const { error } = await sb().storage.from(DATA).upload(recPath(record.id), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    if (error) return false;
    const { snapshot: _s, content: _c, ...rest } = record;
    void _s; void _c;
    const row: DrillRecordSummaryRow = { ...rest, questionCount: snapshot.length };
    const idx = await readIndex();
    await writeIndex([row, ...idx.filter((r) => r.id !== record.id)]);
    return true;
  } catch { return false; }
}

export async function listDrillRecords(): Promise<DrillRecordSummaryRow[]> {
  return (await readIndex()).map(withRef).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDrillRecord(id: string): Promise<DrillRecord | null> {
  try {
    const { data } = await sb().storage.from(DATA).download(recPath(id));
    const rec = data ? ((JSON.parse(await data.text())?.record || null) as DrillRecord | null) : null;
    return rec ? withRef(rec) : null;
  } catch { /* none */ }
  return null;
}

/** Look a drill up by its human reference number (DR-YYMM-XXXX). */
export async function getDrillRecordByRef(ref: string): Promise<DrillRecord | null> {
  const want = ref.trim().toUpperCase();
  if (!want) return null;
  const row = (await readIndex()).find((r) => (r.ref || "").toUpperCase() === want);
  return row ? getDrillRecord(row.id) : null;
}

/** Who may see a given drill record. */
export type DrillScope = {
  /** Admin / super-admin: the whole network. */
  all: boolean;
  /** The viewer's own uid — staff always see the drills they conducted. */
  uid: string;
  /** Class ids the viewer is scoped to (teacher's classes, school desk, …). */
  classIds: string[];
};

/**
 * A scoped viewer sees a drill only when they conducted it themselves or it
 * reached at least one class they are scoped to. Network/individual drills
 * carry no class ids, so for a scoped viewer they stay invisible unless they
 * are the author — deliberately fail-closed.
 */
export function canSeeDrill(
  row: { createdBy: string; classId: string | null; classIds?: string[] },
  scope: DrillScope,
): boolean {
  if (scope.all) return true;
  if (row.createdBy && row.createdBy === scope.uid) return true;
  if (!scope.classIds.length) return false;
  const allowed = new Set(scope.classIds);
  if (row.classId && allowed.has(row.classId)) return true;
  return (row.classIds || []).some((id) => allowed.has(id));
}

/** Drill records visible to one viewer, newest first. */
export async function listDrillRecordsForScope(scope: DrillScope): Promise<DrillRecordSummaryRow[]> {
  return (await listDrillRecords()).filter((r) => canSeeDrill(r, scope));
}
