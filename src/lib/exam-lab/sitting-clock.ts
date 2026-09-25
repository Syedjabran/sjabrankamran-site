/**
 * Exam Lab sitting-clock rules. Pure, no imports — shared by the paper runner
 * and the portal rules tests.
 *
 * Only a proctored test resumes its clock across a reload or Back-and-reopen
 * (see PaperRunner); every other sitting starts a fresh clock on each open.
 */

/** Whole seconds left on a countdown (negative = overtime), exactly as the runner displays it. */
export function secondsLeft(startedAt: number, now: number, totalSec: number, pausedMs = 0): number {
  return Math.round(totalSec - (now - startedAt - pausedMs) / 1000);
}

/**
 * A resumed countdown that had already run out before the student came back:
 * the instant it ran out (epoch ms), or null while time is left. Such a
 * sitting is never auto-submitted — the student submits it, recorded late.
 */
export function expiredOnResume(startedAt: number, now: number, totalSec: number, pausedMs = 0): number | null {
  return secondsLeft(startedAt, now, totalSec, pausedMs) <= 0 ? startedAt + totalSec * 1000 + pausedMs : null;
}

/**
 * Is a sitting finishing at `now` late? A relaxed run (practice, daily task)
 * that carries a due time is late only once that due time has passed — its
 * countdown is a pacing guide. Anything else is late once past its countdown.
 */
export function finishedLate(o: { relaxed: boolean; dueAt: number | null; now: number; secondsLeft: number }): boolean {
  if (o.relaxed && o.dueAt !== null) return o.now > o.dueAt;
  return o.secondsLeft <= 0;
}
