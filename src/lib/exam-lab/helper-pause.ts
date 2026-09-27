// src/lib/exam-lab/helper-pause.ts
//
// SERVER-ONLY. Whether the site-wide physics helper (/api/physics-question,
// the Einstein companion) must refuse a signed-in student right now: while
// they are sitting an Exam Lab test or no-help assignment
// (answer-rules.ts examLabSittingRunning), or an SAT timed module or its
// break (the SAT tutor's own pause rule, sat/coach/tutor-core.ts isPaused).
// null: their sittings could not be read -- the caller refuses (fails closed).
import "server-only";
import { examLabSittingRunning } from "./answer-rules";
import { listAllocations } from "./allocations";
import { isPaused, pauseCandidateIds } from "@/lib/sat/coach/tutor-core";
import { currentStage } from "@/lib/sat/session";
import { listSummaries, loadDocs } from "@/lib/sat/store";

export async function helperPaused(uid: string, now: number): Promise<boolean | null> {
  try {
    if (examLabSittingRunning(await listAllocations(uid), now)) return true;
  } catch {
    return null;
  }
  const summaries = await listSummaries(uid);
  if (summaries === null) return null;
  const ids = pauseCandidateIds(summaries);
  if (!ids.length) return false;
  const docs = await loadDocs(uid, ids);
  if (docs === null) return null;
  return isPaused(docs.flatMap((s) => {
    if (s.kind === "drill") return [];
    const stage = currentStage(s);
    return [{ kind: s.kind, finishedAt: s.finishedAt, stageStartedAt: s.stageStartedAt, breakUntil: s.breakUntil, minutesOfCurrent: stage ? s.minutes[stage] : null }];
  }), now);
}
