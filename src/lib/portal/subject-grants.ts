/**
 * Per-student direct subject grants. SERVER-ONLY (service-role storage).
 *
 * One doc per student at portal-data/subjects/<uid>.json:
 *   { grants: { [subjectId]: { by, at } }, history: [{ subject, on, by, at }] }
 * Only `grant: "direct"` subjects (subjects.ts) are ever stored; physics
 * stays class-based. Reads fail closed: a failed read throws and is never
 * treated as "no grants" followed by a write (storage-fresh.ts).
 */
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { DIRECT_SUBJECTS, directSubjectOf, subjectOf, type SubjectId } from "@/lib/portal/subjects";

const BUCKET = "portal-data";
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
const HISTORY_CAP = 50;
const docPath = (uid: string) => `subjects/${uid}.json`;

export type SubjectGrants = {
  grants: Partial<Record<SubjectId, { by: string; at: string }>>;
  history: { subject: SubjectId; on: boolean; by: string; at: string }[];
};

const unreadable = () => new Error("The subjects record couldn't be read.");

function safeUid(uid: string): string {
  if (!SAFE_UID.test(uid)) throw new Error("That account id isn't valid.");
  return uid;
}

const isText = (v: unknown): v is string => typeof v === "string";
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A stored doc, cleaned: only direct-grant subjects and well-formed rows
 *  survive. Anything that isn't an object at all is unreadable. */
function normalise(raw: unknown): SubjectGrants {
  if (!isRecord(raw)) throw unreadable();
  const grants: SubjectGrants["grants"] = {};
  const stored = isRecord(raw.grants) ? raw.grants : {};
  for (const subject of DIRECT_SUBJECTS) {
    const grant = stored[subject.id];
    if (isRecord(grant) && isText(grant.by) && isText(grant.at)) grants[subject.id] = { by: grant.by, at: grant.at };
  }
  const history: SubjectGrants["history"] = [];
  for (const row of Array.isArray(raw.history) ? raw.history : []) {
    if (!isRecord(row)) continue;
    const subject = directSubjectOf(row.subject);
    if (subject && typeof row.on === "boolean" && isText(row.by) && isText(row.at)) {
      history.push({ subject: subject.id, on: row.on, by: row.by, at: row.at });
    }
  }
  return { grants, history: history.slice(-HISTORY_CAP) };
}

async function readDoc(uid: string): Promise<SubjectGrants> {
  const fresh = await readFreshJson<unknown>(BUCKET, docPath(uid));
  if (!fresh.ok) throw unreadable();
  return fresh.data == null ? { grants: {}, history: [] } : normalise(fresh.data);
}

/** A student's direct grants: empty when they have none; throws when the
 *  record can't be read. */
export async function readGrants(uid: string): Promise<SubjectGrants> {
  return readDoc(safeUid(uid));
}

/**
 * Switch a direct-grant subject on or off for a student: fresh read, write,
 * then a verifying read. Turning on keeps an existing grant's who/when and
 * writes nothing when nothing changes. History keeps the newest 50 events.
 * Throws on any read, write or verify failure.
 */
export async function setGrant(uid: string, subject: SubjectId, on: boolean, by: string): Promise<SubjectGrants> {
  const path = docPath(safeUid(uid));
  const def = subjectOf(subject);
  if (!def) throw new Error(`"${subject}" isn't a subject.`);
  if (def.grant !== "direct") throw new Error(`${def.label} comes from class enrolment; it isn't granted directly.`);

  const doc = await readDoc(uid);
  if (Boolean(doc.grants[subject]) === on) return doc;

  const at = new Date().toISOString();
  const grants = { ...doc.grants };
  if (on) grants[subject] = { by, at };
  else delete grants[subject];
  const next: SubjectGrants = { grants, history: [...doc.history, { subject, on, by, at }].slice(-HISTORY_CAP) };
  if (!(await writeFreshJson(BUCKET, path, next))) throw new Error("The subjects record couldn't be saved.");

  const saved = await readDoc(uid);
  if (Boolean(saved.grants[subject]) !== on) throw new Error("The subjects record couldn't be confirmed after saving.");
  return saved;
}
