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

/** The subset of a module's ids the local student has actually edited
 *  (answered or flagged) since the last adopted server snapshot -- as
 *  opposed to every id local merely *inherited* by copying the server's own
 *  map during an earlier load/apply. Only THESE ids may have local win a
 *  merge; a module the student has never looked at has touched none of its
 *  ids at all, so the server's own copy for it always survives untouched. */
function winningIds(ids: string[], touched: Iterable<string>): Set<string> {
  const touchedSet = new Set(touched);
  return new Set(ids.filter((id) => touchedSet.has(id)));
}

/** Seed a module's answers from the server's copy, but let any local answer
 *  the student actually TOUCHED for that module's ids win -- never resurrect
 *  a server value the student has since cleared, and never drop a value the
 *  student typed before the switch. An id the student never touched (even
 *  if local happens to carry a value for it, inherited from an earlier
 *  snapshot) always keeps the server's copy. Every id outside `ids` -- i.e.
 *  every other module -- passes through from the server untouched. */
export function mergeAnswers(
  serverAnswers: Record<string, string>, localAnswers: Record<string, string>, ids: string[], touched: Iterable<string>,
): Record<string, string> {
  const winIds = winningIds(ids, touched);
  const out: Record<string, string> = { ...serverAnswers };
  for (const [id, v] of Object.entries(localAnswers)) {
    if (!winIds.has(id)) continue;
    if (v) out[id] = v;
    else delete out[id];
  }
  return out;
}

/** Same merge rule for the flagged set: for the target module's TOUCHED
 *  ids, the local flag state wins outright (the server's flag on those same
 *  ids is dropped); every untouched id in the module -- and every id
 *  outside it -- passes through from the server unchanged. */
export function mergeFlagged(serverFlagged: string[], localFlagged: string[], ids: string[], touched: Iterable<string>): string[] {
  const winIds = winningIds(ids, touched);
  const keepServer = serverFlagged.filter((id) => !winIds.has(id));
  const localForIds = localFlagged.filter((id) => winIds.has(id));
  return [...new Set([...keepServer, ...localForIds])];
}

/** Whether a merged answers map actually differs from the server's own copy
 *  over a module's ids -- used to decide whether a stage-switch merge needs
 *  to be resaved, rather than always assuming it does. */
export function answersChangedFor(serverAnswers: Record<string, string>, merged: Record<string, string>, ids: string[]): boolean {
  return ids.some((id) => (serverAnswers[id] ?? "") !== (merged[id] ?? ""));
}

/** Same comparison for the flagged set. */
export function flaggedChangedFor(serverFlagged: string[], merged: string[], ids: string[]): boolean {
  const allowed = new Set(ids);
  const a = new Set(serverFlagged.filter((id) => allowed.has(id)));
  const b = new Set(merged.filter((id) => allowed.has(id)));
  if (a.size !== b.size) return true;
  for (const id of a) if (!b.has(id)) return true;
  return false;
}
