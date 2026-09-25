// src/components/sat/sat-runner-utils.ts
//
// Pure request-body/merge helpers for sat-runner.tsx -- no React import, so
// these can be unit-tested directly with Node (see scripts/test-sat-runner-utils.mjs).

/** Restrict an answers map to one module's question ids -- a save/submit
 *  body must carry only the module on screen, never the whole sitting's map. */
export function pickAnswers(answers: Record<string, string>, ids: string[]): Record<string, string> {
  const allowed = new Set(ids);
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(answers)) if (allowed.has(id)) out[id] = v;
  return out;
}

/** Restrict a flagged list to one module's question ids. */
export function pickFlagged(flagged: string[], ids: string[]): string[] {
  const allowed = new Set(ids);
  return flagged.filter((id) => allowed.has(id));
}

/** Seed a module's answers from the server's copy, but let any local answer
 *  the student already entered for THAT module's ids win -- never resurrect
 *  a server value the student has since cleared, and never drop a value the
 *  student typed before the switch. Every other module's answers pass
 *  through from the server untouched. */
export function mergeAnswers(
  serverAnswers: Record<string, string>, localAnswers: Record<string, string>, ids: string[],
): Record<string, string> {
  const allowed = new Set(ids);
  const out: Record<string, string> = { ...serverAnswers };
  for (const [id, v] of Object.entries(localAnswers)) {
    if (!allowed.has(id)) continue;
    if (v) out[id] = v;
    else delete out[id];
  }
  return out;
}

/** Same merge rule for the flagged set: for the target module's ids, the
 *  local flag state wins outright (the server's flags on those same ids are
 *  dropped); every other module's flags pass through from the server. */
export function mergeFlagged(serverFlagged: string[], localFlagged: string[], ids: string[]): string[] {
  const allowed = new Set(ids);
  const keepServer = serverFlagged.filter((id) => !allowed.has(id));
  const localForIds = localFlagged.filter((id) => allowed.has(id));
  return [...new Set([...keepServer, ...localForIds])];
}
