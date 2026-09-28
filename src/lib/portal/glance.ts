/**
 * The one-line glances on the home page's subject cards and the badges on a
 * subject space's cards, worked out from data the pages already read. Pure:
 * plain Node tests check the wording.
 */

/** "2 open", "1 to do"; null for none (no badge). */
export function countBadge(count: number, word: string): string | null {
  return count > 0 ? `${count} ${word}` : null;
}

/** "3 study-plan activities to do"; null for none. */
export function planLine(openMandatory: number): string | null {
  if (openMandatory <= 0) return null;
  return `${openMandatory} study-plan ${openMandatory === 1 ? "activity" : "activities"} to do`;
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** The SAT card's line from the student's SAT plan settings (`today` is a
 *  Pakistan calendar day, "YYYY-MM-DD"): the exam countdown and target, or
 *  the nudge to set the plan up; null when the settings couldn't be read. */
export function satGlance(
  profile: { examDate: string | null; targetMonth: string | null; targetScore: number } | null | undefined,
  today: string,
): string | null {
  if (profile === undefined) return null;
  if (profile === null) return "Set up your SAT plan to begin.";
  const target = `target ${profile.targetScore}`;
  if (profile.examDate) {
    const days = Math.round((Date.parse(`${profile.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (Number.isNaN(days)) return `Aiming for ${profile.targetScore}`;
    if (days > 1) return `Exam in ${days} days · ${target}`;
    if (days === 1) return `Exam tomorrow · ${target}`;
    if (days === 0) return "Exam today · good luck";
    return "Your exam date has passed: update it in Settings.";
  }
  if (profile.targetMonth) return `Aiming for ${monthLabel(profile.targetMonth)} · ${target}`;
  return `Aiming for ${profile.targetScore}`;
}
