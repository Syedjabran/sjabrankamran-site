/**
 * Syllabus coverage — which syllabus topics a class / school / the network has
 * completed, per course. SERVER-ONLY.
 *
 * Storage strategy (hybrid, backward-compatible):
 *  - PRIMARY: the `el_syllabus_coverage` Postgres table (migration
 *    el-002-syllabus-coverage.sql). Used automatically the moment the
 *    migration has been applied.
 *  - FALLBACK: a JSON doc in the private `portal-data` bucket (the codebase's
 *    Storage-as-DB convention), so assignment gating works BEFORE the
 *    migration is applied. Reads try the table first and degrade to the doc;
 *    writes go to whichever backend answered.
 *
 * Assignment gating (exam-allocate + automated study plans) draws questions
 * ONLY from topics confirmed covered for the target class(es)/school.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistry } from "@/lib/portal/institutions";

export const COVERAGE_COURSES = ["9702", "5054", "IB"] as const;
export const DEFAULT_COURSE = "9702";

export type CoverageScopeType = "class" | "school" | "network";

export type SyllabusCoverageRow = {
  id: string;
  course: string;
  topic: string;
  scope_type: CoverageScopeType;
  scope_id: string;        // class id | school name | '*'
  scope_label: string;     // human label
  covered_at: string;      // ISO
  covered_by: string | null;
  covered_by_name: string | null;
  note: string | null;
};

export type ClassRef = { id: string; school: string | null };

const DATA = "portal-data";
const STORE_PATH = "syllabus-coverage.json";

// ---------------------------------------------------------------------------
// Backend probes
// ---------------------------------------------------------------------------

let _tableUsable: boolean | null = null;

/** True when the el_syllabus_coverage table answers. Cached per warm instance. */
async function tableUsable(): Promise<boolean> {
  if (_tableUsable !== null) return _tableUsable;
  try {
    const { error } = await createAdminClient()
      .from("el_syllabus_coverage")
      .select("id", { count: "exact", head: true });
    _tableUsable = !error;
  } catch {
    _tableUsable = false;
  }
  return _tableUsable;
}

type Store = { rows: SyllabusCoverageRow[] };

let _syncedStoreToTable = false;
/** One-time backfill: rows recorded in the storage fallback BEFORE the
 *  el-002 migration existed are copied into the table the first time it is
 *  seen (only when the table is empty — never overwrites live data). */
async function syncStoreToTable(): Promise<void> {
  if (_syncedStoreToTable) return;
  _syncedStoreToTable = true;
  try {
    const db = createAdminClient();
    const { count } = await db.from("el_syllabus_coverage").select("id", { count: "exact", head: true });
    if (count && count > 0) return;
    const { rows } = await readStore();
    if (!rows.length) return;
    await db.from("el_syllabus_coverage").upsert(
      rows.map((r) => ({
        course: r.course, topic: r.topic,
        scope_type: r.scope_type, scope_id: r.scope_id, scope_label: r.scope_label,
        covered_at: r.covered_at, covered_by: r.covered_by, covered_by_name: r.covered_by_name, note: r.note,
      })),
      { onConflict: "course,scope_type,scope_id,topic" },
    );
  } catch { /* best effort — storage fallback remains authoritative */ }
}

async function readStore(): Promise<Store> {
  try {
    const { data } = await createAdminClient().storage.from(DATA).download(STORE_PATH);
    if (data) {
      const parsed = JSON.parse(await data.text());
      if (Array.isArray(parsed?.rows)) return { rows: parsed.rows as SyllabusCoverageRow[] };
    }
  } catch { /* none */ }
  return { rows: [] };
}

async function writeStore(store: Store): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify({ rows: store.rows.slice(-5000) })], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(DATA).upload(STORE_PATH, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** All coverage rows (all scopes). Admins filter client-side; scoped staff
 *  must intersect with their own classes — the API route enforces that. */
export async function listCoverage(course?: string): Promise<SyllabusCoverageRow[]> {
  if (await tableUsable()) {
    await syncStoreToTable();
    let q = createAdminClient().from("el_syllabus_coverage").select("*").order("covered_at", { ascending: false }).limit(5000);
    if (course) q = q.eq("course", course);
    const { data, error } = await q;
    if (!error && data) return data as unknown as SyllabusCoverageRow[];
  }
  const { rows } = await readStore();
  return course ? rows.filter((r) => r.course === course) : rows;
}

/**
 * Effective covered-topic set for a set of classes: the union of
 *  - coverage recorded for each class id,
 *  - coverage recorded for each class's school,
 *  - network-wide coverage (scope_id '*').
 */
export async function coveredTopicsForClasses(course: string, classes: ClassRef[]): Promise<Set<string>> {
  const rows = await listCoverage(course);
  const classIds = new Set(classes.map((c) => c.id));
  const schools = new Set(classes.map((c) => c.school).filter((s): s is string => !!s));
  const out = new Set<string>();
  for (const r of rows) {
    if (r.scope_type === "network") out.add(r.topic);
    else if (r.scope_type === "class" && classIds.has(r.scope_id)) out.add(r.topic);
    else if (r.scope_type === "school" && schools.has(r.scope_id)) out.add(r.topic);
  }
  return out;
}

/** Resolve the active enrolment classes (with school) for a set of student uids. */
export async function classesForUids(uids: string[]): Promise<ClassRef[]> {
  if (!uids.length) return [];
  try {
    const db = createAdminClient();
    const { data: students } = await db.from("edu_students").select("id, profile_id").in("profile_id", uids);
    const stIds = (students || []).map((s) => s.id as string);
    if (!stIds.length) return [];
    const { data: enr } = await db.from("edu_enrolments").select("class_id").in("student_id", stIds).eq("status", "active");
    const classIds = [...new Set((enr || []).map((e) => e.class_id as string).filter(Boolean))];
    if (!classIds.length) return [];
    const reg = await getRegistry();
    const byId = new Map(reg.classes.map((c) => [c.id, c] as const));
    return classIds.map((id) => ({ id, school: byId.get(id)?.school ?? null }));
  } catch {
    return [];
  }
}

/** Covered-topic union for an allocation target: explicit class ids (the
 *  classes the staff picked) plus the enrolment classes of the target
 *  students (covers individual targets). */
export async function coveredTopicsForTarget(course: string, uids: string[], classIds: string[]): Promise<Set<string>> {
  const reg = await getRegistry();
  const byId = new Map(reg.classes.map((c) => [c.id, c] as const));
  const classes: ClassRef[] = [];
  const seen = new Set<string>();
  for (const id of classIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    classes.push({ id, school: byId.get(id)?.school ?? null });
  }
  for (const c of await classesForUids(uids)) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      classes.push(c);
    }
  }
  return coveredTopicsForClasses(course, classes);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function markCovered(input: {
  course: string; topic: string; scopeType: CoverageScopeType; scopeId: string; scopeLabel: string;
  coveredBy: string; coveredByName: string; note?: string | null;
}): Promise<SyllabusCoverageRow | null> {
  const course = input.course.trim() || DEFAULT_COURSE;
  const topic = input.topic.trim();
  if (!topic) return null;

  if (await tableUsable()) {
    const db = createAdminClient();
    const { data, error } = await db
      .from("el_syllabus_coverage")
      .upsert(
        {
          course, topic,
          scope_type: input.scopeType, scope_id: input.scopeId, scope_label: input.scopeLabel,
          covered_by: input.coveredBy, covered_by_name: input.coveredByName,
          note: input.note?.trim() || null,
          covered_at: new Date().toISOString(),
        },
        { onConflict: "course,scope_type,scope_id,topic" },
      )
      .select()
      .single();
    if (!error && data) return data as unknown as SyllabusCoverageRow;
  }

  // Storage fallback
  const store = await readStore();
  const existing = store.rows.find(
    (r) => r.course === course && r.scope_type === input.scopeType && r.scope_id === input.scopeId && r.topic === topic,
  );
  if (existing) {
    existing.covered_at = new Date().toISOString();
    existing.covered_by = input.coveredBy;
    existing.covered_by_name = input.coveredByName;
    existing.note = input.note?.trim() || null;
  } else {
    store.rows.push({
      id: `cov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      course, topic,
      scope_type: input.scopeType, scope_id: input.scopeId, scope_label: input.scopeLabel,
      covered_at: new Date().toISOString(),
      covered_by: input.coveredBy, covered_by_name: input.coveredByName,
      note: input.note?.trim() || null,
    });
  }
  return (await writeStore(store)) ? (existing ?? store.rows[store.rows.length - 1]) : null;
}

export async function uncover(course: string, scopeType: CoverageScopeType, scopeId: string, topic: string): Promise<boolean> {
  if (await tableUsable()) {
    const { error } = await createAdminClient()
      .from("el_syllabus_coverage")
      .delete()
      .eq("course", course)
      .eq("scope_type", scopeType)
      .eq("scope_id", scopeId)
      .eq("topic", topic);
    if (!error) return true;
  }
  const store = await readStore();
  const before = store.rows.length;
  store.rows = store.rows.filter(
    (r) => !(r.course === course && r.scope_type === scopeType && r.scope_id === scopeId && r.topic === topic),
  );
  if (store.rows.length === before) return false;
  return writeStore(store);
}
