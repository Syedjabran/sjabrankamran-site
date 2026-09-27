// src/app/api/lab/trial/route.ts
//
// POST { attempt, settings, state?: { run, history }, chunk? } -> { track }:
// one chunk of a released trial -- the frames the room plays back (and, for
// the metered practicals, the live meter readings on the same timeline) --
// so motion needs no request per animation frame.
import { labAttempt, labBody, labCaller, labError, labJson, trialBody } from "@/lib/practical-lab/lab-api";
import { normaliseSettings, normaliseState, trackChunk } from "@/lib/practical-lab/engine.mjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const caller = await labCaller("trial");
  if ("refused" in caller) return caller.refused;
  const parsed = await labBody(req, trialBody);
  if ("refused" in parsed) return parsed.refused;
  const attempt = labAttempt(parsed.body.attempt, caller.user, caller.secret);
  if ("refused" in attempt) return attempt.refused;
  try {
    const settings = normaliseSettings(attempt.id, parsed.body.settings);
    const state = normaliseState(attempt.id, { ...parsed.body.state, active: true });
    const track = trackChunk({ id: attempt.id, params: attempt.params, attemptKey: attempt.attemptKey, settings, state, chunk: parsed.body.chunk ?? 0 });
    return labJson({ track });
  } catch (error) {
    return labError(error);
  }
}
