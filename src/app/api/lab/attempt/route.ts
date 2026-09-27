// src/app/api/lab/attempt/route.ts
//
// POST { experiment, fresh? } -> start or resume the caller's attempt at a
// practical. Returns the signed attempt token the room sends with every other
// lab request, the practical's controls and timing, and the resting view at
// the default settings. The attempt's hidden values never leave the server.
import { labAttempt, labBody, labCaller, labError, labJson, attemptBody } from "@/lib/practical-lab/lab-api";
import { openAttempt, signAttempt } from "@/lib/practical-lab/attempt";
import { defaultSettings, experimentOf, timingOf, viewAt } from "@/lib/practical-lab/engine.mjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const caller = await labCaller("attempt");
  if ("refused" in caller) return caller.refused;
  const parsed = await labBody(req, attemptBody);
  if ("refused" in parsed) return parsed.refused;
  const experiment = experimentOf(parsed.body.experiment);
  if (!experiment) return labJson({ error: "That practical isn’t in the lab.", code: "bad-request" }, 400);

  const n = await openAttempt(caller.user.id, experiment.id, parsed.body.fresh === true);
  if (n === null) return labJson({ error: "The Practical Lab couldn’t open your attempt just now. Please reload the page.", code: "unavailable" }, 503);

  const token = signAttempt(caller.secret, { uid: caller.user.id, experiment: experiment.id, n, issuedAt: Date.now() });
  const attempt = labAttempt(token, caller.user, caller.secret);
  if ("refused" in attempt) return attempt.refused;
  try {
    const view = viewAt({ id: attempt.id, params: attempt.params, attemptKey: attempt.attemptKey, settings: defaultSettings(attempt.id) });
    return labJson({
      attempt: token,
      experiment: experiment.id,
      family: experiment.family,
      n,
      controls: experiment.controls,
      timing: timingOf(experiment.family),
      view,
    });
  } catch (error) {
    return labError(error);
  }
}
