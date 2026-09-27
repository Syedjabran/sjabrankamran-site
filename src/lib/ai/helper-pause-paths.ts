// src/lib/ai/helper-pause-paths.ts
//
// Where the site-wide "ask a physics question" helper (Einstein) is not
// shown: the Exam Lab and the SAT Lab, where tests, no-help assignments and
// timed SAT modules are sat -- a helper that answers any pasted question
// would be help in a sitting that allows none (the proctored runner goes
// full-screen on the document, so the floating widget stayed on top of it).
// Pure; the helper's API refuses the same students server-side
// (exam-lab/helper-pause.ts).

export const HELPER_PAUSED_PREFIXES: readonly string[] = ["/portal/exam-lab", "/portal/sat-lab"];

export function helperPausedOnPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.toLowerCase();
  return HELPER_PAUSED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}
