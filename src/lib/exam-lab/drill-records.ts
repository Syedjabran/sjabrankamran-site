/**
 * Super-admin Drill Records. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * Every Exam Lab drill/paper a super-admin opens and allots is captured here as
 * a permanent record WITH a snapshot of the exact question paper, so it can be
 * re-viewed later and audited: what was set, its name, which class/group it was
 * conducted for, when, and by whom.
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

export type DrillTargetType = "class" | "school" | "network" | "individual" | "group";

/** One question as stored in a paper snapshot (viewable after the fact). */
export type SnapshotQuestion = {
  id: string; ref: string; paperType: "P1" | "P2" | "P4"; code: string;
  qnum: number; topic: string | null; level: "LOT" | "HOT"; marks: number | null;
  img: string; ms_img: string | null; answer: string | null;
};

export type DrillRecord = {
  id: string;
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
  if (content.type === "custom") {
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
  await sb().storage.from(DATA).upload(INDEX, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
}

/** Persist a drill record (index row + full snapshot file). Best-effort. */
export async function saveDrillRecord(
  base: Omit<DrillRecord, "snapshot" | "totalMarks" | "createdAt"> & { snapshotQs: ImgQuestion[] },
): Promise<boolean> {
  try {
    const snapshot = toSnapshot(base.snapshotQs);
    const totalMarks = snapshot.reduce((s, q) => s + (q.marks || 0), 0);
    const record: DrillRecord = {
      id: base.id, allocationId: base.allocationId, name: base.name, mode: base.mode,
      content: base.content, snapshot, totalMarks, targetType: base.targetType,
      scopeLabel: base.scopeLabel, classId: base.classId, className: base.className,
      classIds: base.classIds, studentCount: base.studentCount, createdBy: base.createdBy,
      createdByName: base.createdByName, createdAt: Date.now(),
    };
    const body = new Blob([JSON.stringify({ record })], { type: "application/json" });
    await sb().storage.from(DATA).upload(recPath(record.id), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    const { snapshot: _s, content: _c, ...rest } = record;
    void _s; void _c;
    const row: DrillRecordSummaryRow = { ...rest, questionCount: snapshot.length };
    const idx = await readIndex();
    await writeIndex([row, ...idx.filter((r) => r.id !== record.id)]);
    return true;
  } catch { return false; }
}

export async function listDrillRecords(): Promise<DrillRecordSummaryRow[]> {
  return (await readIndex()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDrillRecord(id: string): Promise<DrillRecord | null> {
  try {
    const { data } = await sb().storage.from(DATA).download(recPath(id));
    if (data) return (JSON.parse(await data.text())?.record || null) as DrillRecord | null;
  } catch { /* none */ }
  return null;
}
