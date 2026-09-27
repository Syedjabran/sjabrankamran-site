// src/lib/exam-lab/paper-meta.ts
//
// Exam Lab facts the browser may hold: paper names, marks and durations, the
// paper index, and the shape of a question as a student receives it. NO
// answers, mark-scheme paths or secure-bank content ever live here -- the
// banks themselves stay on the server (image-bank.ts, bank-all.ts; see
// scripts/check-exam-lab-client-imports.mjs).

export type ExamCourse = "9702" | "5054";
export type PaperType = "P1" | "P2" | "P4";
export type Level = "LOT" | "HOT";

/** A question as a student's browser receives it: what the paper shows, and
 *  whether a mark scheme exists -- never the answer or where the scheme is. */
export type SafeQuestion = {
  id: string;
  course: ExamCourse;
  paperType: PaperType;
  code: string;
  qnum: number;
  topic: string | null;
  level: Level;
  marks: number | null;
  img: string;
  ref: string;
  duration: number;
  hasMs: boolean;
};

type Canon = Record<PaperType, { marks: number; duration: number; name: string }>;

/** Canonical Cambridge 9702 paper facts. */
export const CANON_9702: Canon = {
  P1: { marks: 40, duration: 75, name: "Paper 1 · Multiple Choice" },
  P2: { marks: 60, duration: 75, name: "Paper 2 · AS Structured" },
  P4: { marks: 100, duration: 120, name: "Paper 4 · A2 Structured" },
};

/** Canonical Cambridge 5054 paper facts, taken from the papers themselves. */
export const CANON_5054: Canon = {
  P1: { marks: 40, duration: 60, name: "Paper 1 · Multiple Choice" },
  P2: { marks: 80, duration: 105, name: "Paper 2 · Theory" },
  P4: { marks: 40, duration: 60, name: "Paper 4 · Alternative to Practical" },
};

const SESS_9702: Record<string, number> = { m: 0, s: 1, w: 2 };
const SESS_5054: Record<string, number> = { sp: 0, m: 1, s: 2, w: 3 };

export function chrono9702(code: string): number {
  const m = code.match(/9702_([smw])(\d\d)_(\d\d)/);
  if (!m) return 9e9;
  return parseInt(m[2]) * 1000 + (SESS_9702[m[1]] ?? 9) * 100 + parseInt(m[3]);
}

export function chrono5054(code: string): number {
  const m = code.match(/5054_([a-z]+)(\d\d)_(\d\d)/);
  if (!m) return 9e9;
  return parseInt(m[2]) * 1000 + (SESS_5054[m[1]] ?? 9) * 100 + parseInt(m[3]);
}

export type PaperMeta = { code: string; paperType: PaperType; count: number; marks: number; duration: number; ref: string; chrono: number };

/** One row per paper code, oldest first (the order the banks list them). */
export function buildPaperIndex(
  questions: { code: string; paperType: PaperType; ref: string }[], canon: Canon, chrono: (code: string) => number,
): PaperMeta[] {
  const byCode = new Map<string, { paperType: PaperType; ref: string; count: number }>();
  for (const q of questions) {
    const row = byCode.get(q.code);
    if (row) row.count += 1;
    else byCode.set(q.code, { paperType: q.paperType, ref: q.ref, count: 1 });
  }
  return [...byCode].map(([code, r]) => ({
    code, paperType: r.paperType, count: r.count, marks: canon[r.paperType].marks,
    duration: canon[r.paperType].duration, ref: r.ref.replace(/ Q.*$/, ""), chrono: chrono(code),
  })).sort((a, b) => a.chrono - b.chrono);
}

/** How many questions of one paper type / topic / level a course holds --
 *  enough for the hub to count a drill's pool without the bank. */
export type PoolCount = { paperType: PaperType; topic: string | null; level: Level; n: number };

export function poolCounts(questions: { paperType: PaperType; topic: string | null; level: Level }[]): PoolCount[] {
  const m = new Map<string, PoolCount>();
  for (const q of questions) {
    const key = `${q.paperType}\u001f${q.topic ?? ""}\u001f${q.level}`;
    const row = m.get(key);
    if (row) row.n += 1;
    else m.set(key, { paperType: q.paperType, topic: q.topic, level: q.level, n: 1 });
  }
  return [...m.values()];
}

/** Questions in a course's pool matching a drill's paper, topics (none = all) and levels. */
export function countPool(pool: PoolCount[], paperType: PaperType, topics: ReadonlySet<string>, levels: ReadonlySet<Level>): number {
  let n = 0;
  for (const r of pool) {
    if (r.paperType !== paperType || !levels.has(r.level)) continue;
    if (topics.size && !(r.topic && topics.has(r.topic))) continue;
    n += r.n;
  }
  return n;
}

/** The topics a course's pool holds for one paper type, sorted. */
export function poolTopics(pool: PoolCount[], paperType: PaperType): string[] {
  const set = new Set<string>();
  for (const r of pool) if (r.paperType === paperType && r.topic) set.add(r.topic);
  return [...set].sort();
}

export type CourseCatalog = { papers: PaperMeta[]; pool: PoolCount[]; questions: number };
/** What the Exam Lab hub renders from: per course, the paper list and the drill pool counts. */
export type ExamLabCatalog = Record<ExamCourse, CourseCatalog>;

/** The course of a question id or paper code (5054 codes start `5054_`). */
export function courseOfCode(code: string): ExamCourse {
  return code.startsWith("5054_") ? "5054" : "9702";
}
