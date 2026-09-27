// src/components/exam-lab/selection-summary.ts
//
// Totals for a hand-picked or edited Exam Lab paper (pure; Node-testable):
// the staff question picker, the class-drill assign panel and the assign
// form show these, and the assign panel's default duration comes from them.
import type { SafeQuestion } from "../../lib/exam-lab/paper-meta.ts";
import { minutesFromSeconds, questionSeconds } from "../../lib/portal/timing.ts";

const PAPERS = ["P1", "P2", "P4"] as const;

/** `complete`: every id was found (in the loaded bank, or among the
 *  questions already on screen). Until then the totals are partial and must
 *  be shown as loading, never offered as the paper's duration. */
export type SelectionSummary = { count: number; marks: number; minutes: number; mix: string; complete: boolean };

/** Totals for an ordered id list: marks, estimated minutes (Σ questionSeconds)
 *  and paper mix. `bank`: the staff bank once loaded (null before); `known`:
 *  questions already on screen, so a paper sums before the bank arrives. */
export function selectionSummary(
  ids: string[], bank: { byId: Map<string, { q: SafeQuestion }> } | null, known: SafeQuestion[] = [],
): SelectionSummary {
  let marks = 0;
  let seconds = 0;
  let complete = true;
  const perPaper: Partial<Record<SafeQuestion["paperType"], number>> = {};
  const onScreen = new Map(known.map((q) => [q.id, q] as const));
  for (const id of ids) {
    const q = bank?.byId.get(id)?.q ?? onScreen.get(id);
    if (!q) { complete = false; continue; }
    marks += q.marks ?? 0;
    seconds += questionSeconds({ paper: q.paperType, difficulty: q.level, marks: q.marks });
    perPaper[q.paperType] = (perPaper[q.paperType] ?? 0) + 1;
  }
  return {
    count: ids.length,
    marks,
    minutes: seconds ? minutesFromSeconds(seconds) : 0,
    mix: PAPERS.filter((p) => perPaper[p]).map((p) => `${p} ×${perPaper[p]}`).join(" · "),
    complete,
  };
}
