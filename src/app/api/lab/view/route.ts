// src/app/api/lab/view/route.ts
//
// POST { attempt, settings, state? } -> { view }: what the apparatus looks
// like at these settings, resting or at time t of a running trial --
// quantised, and only the fields the room draws.
import { labAttempt, labBody, labCaller, labError, labJson, viewBody } from "@/lib/practical-lab/lab-api";
import { normaliseSettings, normaliseState, viewAt } from "@/lib/practical-lab/engine.mjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const caller = await labCaller("view");
  if ("refused" in caller) return caller.refused;
  const parsed = await labBody(req, viewBody);
  if ("refused" in parsed) return parsed.refused;
  const attempt = labAttempt(parsed.body.attempt, caller.user, caller.secret);
  if ("refused" in attempt) return attempt.refused;
  try {
    const settings = normaliseSettings(attempt.id, parsed.body.settings);
    const state = parsed.body.state ? normaliseState(attempt.id, parsed.body.state) : undefined;
    return labJson({ view: viewAt({ id: attempt.id, params: attempt.params, attemptKey: attempt.attemptKey, settings, state }) });
  } catch (error) {
    return labError(error);
  }
}
