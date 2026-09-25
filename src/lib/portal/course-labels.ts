/**
 * Pure, alias-free course label helpers.
 *
 * Split out of course-access.ts (which re-exports these) so plain Node can
 * import them without a bundler: course-access.ts pulls in `@/lib/...`
 * aliases that only the Next.js/tsconfig build resolves, which breaks
 * `node --experimental-strip-types` in scripts/test-sat-access.mjs.
 */

export type Course = "9702" | "5054" | "SAT";

/** Map a class `year` label to an awarding-body course, or null if it names none. */
export function courseFromYear(year: string): Course | null {
  const y = (year || "").toUpperCase();
  if (y.includes("O LEVEL") || y.includes("O-LEVEL") || y.includes("OLEVEL") || y.includes("5054") || /^O[\s-]?\d/.test(y)) return "5054";
  // Word-boundary match: a bare substring test would route "Saturday Batch"
  // to the SAT platform.
  if (/\bSAT\b/.test(y) || y.includes("DIGITAL SAT")) return "SAT";
  if (
    y.includes("A LEVEL") || y.includes("A-LEVEL") || y.includes("9702") ||
    y === "AS" || y === "A2" || y.includes("YEAR 1") || y.includes("YEAR 2")
  ) return "9702";
  return null;
}

export const COURSE_LABEL: Record<Course, string> = {
  "9702": "Cambridge A Level Physics · 9702",
  "5054": "Cambridge O Level Physics · 5054",
  "SAT": "Digital SAT",
};
