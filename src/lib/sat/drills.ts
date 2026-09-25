// src/lib/sat/drills.ts
//
// Drills (spec 4.3): a practice set drawn from the question bank by section,
// domain, skill and difficulty, answered one question at a time with the
// official rationale shown straight after. The FIRST answer to a question is
// the one recorded — re-answering after seeing the rationale changes nothing.
import { filterQuestions, type SATFilter } from "./bank.ts";
import { isCorrect } from "./grade.ts";
import type { Rng } from "./forms.ts";
import { MAX_RESPONSE_CHARS } from "./session.ts";
import type { SATAnswer, SATQuestion } from "./types.ts";
// DOMAIN_LABEL is plain UI copy (no answer data) already shared by the drill
// filter and score report on the client -- imported here too so a drill's
// stored/notified title ("Algebra · Hard drill") matches the client's own
// preview instead of showing the raw domain slug ("algebra · Hard drill").
import { DOMAIN_LABEL } from "./client-types.ts";

export const DRILL_MIN = 5;
export const DRILL_MAX = 30;

export type SATDrill = {
  version: 1;
  id: string;
  uid: string;
  kind: "drill";
  title: string;
  createdAt: number;
  filter: SATFilter;
  questionIds: string[];
  answers: Record<string, string>;
  checked: Record<string, boolean>;
  finishedAt: number | null;
  assignmentId: string | null;
};

const SECTION_LABEL = { rw: "Reading and Writing", math: "Math" } as const;
const DIFFICULTY_LABEL = { E: "Easy", M: "Medium", H: "Hard" } as const;

export function drillTitle(f: SATFilter): string {
  const parts = [
    f.section ? SECTION_LABEL[f.section] : "Mixed",
    f.skill ?? (f.domain ? DOMAIN_LABEL[f.domain] ?? f.domain : null),
    f.difficulty ? DIFFICULTY_LABEL[f.difficulty] : null,
  ].filter(Boolean);
  return `${parts.join(" · ")} drill`;
}

export function startDrill(
  bank: SATQuestion[], filter: SATFilter, count: number, rng: Rng,
  ids: { id: string; uid: string; now: number; assignmentId?: string | null },
  // Ids to keep out of the pool -- e.g. every question already planned for
  // one of the student's own unfinished adaptive/practice sittings, so a
  // drill in another tab can never become a way to look up a mid-exam
  // answer. Filtered before the pool is shuffled.
  exclude?: Set<string>,
): SATDrill {
  const pool = filterQuestions(bank, filter).filter((q) => !exclude?.has(q.id));
  if (!pool.length) throw new Error("No questions match that drill.");
  const n = Math.min(Math.max(Math.round(count) || DRILL_MIN, DRILL_MIN), DRILL_MAX, pool.length);
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    version: 1, id: ids.id, uid: ids.uid, kind: "drill", title: drillTitle(filter), createdAt: ids.now,
    filter, questionIds: order.slice(0, n).map((q) => q.id), answers: {}, checked: {}, finishedAt: null,
    assignmentId: ids.assignmentId ?? null,
  };
}

export function checkDrillAnswer(
  d: SATDrill, questionId: string, response: string,
  answerOf: (id: string) => SATAnswer | null, now: number,
): { drill: SATDrill; correct: boolean } {
  if (!d.questionIds.includes(questionId)) throw new Error("That question is not part of this drill.");
  if (questionId in d.checked) return { drill: d, correct: d.checked[questionId] };
  const key = answerOf(questionId);
  const correct = !!key && isCorrect(key, response);
  const drill: SATDrill = {
    ...d,
    answers: { ...d.answers, [questionId]: response.trim().slice(0, MAX_RESPONSE_CHARS) },
    checked: { ...d.checked, [questionId]: correct },
  };
  if (drill.questionIds.every((id) => id in drill.checked)) drill.finishedAt = now;
  return { drill, correct };
}
