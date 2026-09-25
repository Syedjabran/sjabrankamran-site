// src/lib/sat/drills.ts
//
// Drills (spec 4.3): a practice set drawn from the question bank by section,
// domain, skill and difficulty, answered one question at a time with the
// official rationale shown straight after. The FIRST answer to a question is
// the one recorded — re-answering after seeing the rationale changes nothing.
import { filterQuestions, type SATFilter } from "./bank.ts";
import { isCorrect, validateSPR } from "./grade.ts";
import { shuffle, type Rng } from "./shuffle.ts";
import { MAX_RESPONSE_CHARS } from "./session.ts";
import type { SATAnswer, SATQuestion } from "./types.ts";
// drillTitle is the same pure function the staff assign panel previews
// with, so a drill's stored/notified title matches that preview exactly.
import { DRILL_COUNT_MAX, DRILL_COUNT_MIN, drillTitle } from "./client-types.ts";

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
  const n = Math.min(Math.max(Math.round(count) || DRILL_COUNT_MIN, DRILL_COUNT_MIN), DRILL_COUNT_MAX, pool.length);
  const order = shuffle(pool, rng);
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
  // A grid-in entry the answer box would refuse is not an answer: reject it
  // and record nothing, so the question's one recorded (first) answer is
  // still the student's to give. The client disables Check meanwhile.
  if (key?.kind === "spr") {
    const entry = validateSPR(response);
    if (!entry.ok) throw new Error(entry.reason);
  }
  const correct = !!key && isCorrect(key, response);
  const drill: SATDrill = {
    ...d,
    answers: { ...d.answers, [questionId]: response.trim().slice(0, MAX_RESPONSE_CHARS) },
    checked: { ...d.checked, [questionId]: correct },
  };
  if (drill.questionIds.every((id) => id in drill.checked)) drill.finishedAt = now;
  return { drill, correct };
}
