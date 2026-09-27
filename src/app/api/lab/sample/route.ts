// src/app/api/lab/sample/route.ts
//
// POST { attempt, settings, state? } -> { readings }: what the instruments
// show, made on the server with each instrument's resolution and noise. The
// same setting at the same moment always reads the same (as a real
// instrument does); another setting or moment reads independently.
import { labAttempt, labBody, labCaller, labError, labJson, sampleBody } from "@/lib/practical-lab/lab-api";
import { normaliseSettings, normaliseState, sampleAt } from "@/lib/practical-lab/engine.mjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const caller = await labCaller("sample");
  if ("refused" in caller) return caller.refused;
  const parsed = await labBody(req, sampleBody);
  if ("refused" in parsed) return parsed.refused;
  const attempt = labAttempt(parsed.body.attempt, caller.user, caller.secret);
  if ("refused" in attempt) return attempt.refused;
  try {
    const settings = normaliseSettings(attempt.id, parsed.body.settings);
    const state = parsed.body.state ? normaliseState(attempt.id, parsed.body.state) : undefined;
    return labJson({ readings: sampleAt({ id: attempt.id, params: attempt.params, attemptKey: attempt.attemptKey, settings, state }) });
  } catch (error) {
    return labError(error);
  }
}
