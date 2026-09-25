// src/lib/sat/scoring.ts
//
// Official scores come from an ingested conversion table and nowhere else
// (spec 10.5). Everything else is an estimate and is labelled one.
//
// College Board scores a linear paper to a RANGE, not a point: the guides
// map a section raw score to a lower and an upper bound and instruct the
// student to add the bounds separately. This module does the same rather
// than inventing a precision College Board does not claim.
import { loadPracticeTests, practiceTest } from "./bank.ts";
import { BLUEPRINT } from "./forms.ts";
import type {
  SATConversionTable, SATPracticeTest, SATScore, SATSection,
} from "./types.ts";

const TOTAL_MIN = 400;
const TOTAL_MAX = 1600;

/** The paper (linear) raw-score ceiling per section -- 33+33 for R&W, 27+27
 *  for Math (spec 3.1). A conversion table is "ingested" only when it has a
 *  row for every raw score on this scale; anything less is a partial parse,
 *  not official data (spec 10.5). */
const PAPER_MAX: Record<SATSection, number> = { rw: 66, math: 54 };

/**
 * True only when `table` has an entry for every raw score from 0 through
 * that section's paper maximum, inclusive.
 *
 * `!test?.conversion?.rw` being false for `{}` was the bug: an empty or
 * partially-parsed table would pass that guard and get scored as official.
 * Completeness -- not mere presence -- is what "ingested" means here.
 */
function isCompleteTable(
  table: SATConversionTable | undefined, section: SATSection,
): table is SATConversionTable {
  if (!table) return false;
  for (let raw = 0; raw <= PAPER_MAX[section]; raw++) {
    if (!table[raw]) return false;
  }
  return true;
}

/**
 * [lower, upper] for a raw score, interpolating between rows when the exact
 * raw score is absent.
 *
 * A complete ingested table has every row, so interpolation should never
 * fire on real data. It exists so that a partially-parsed table degrades to
 * a slightly-off score rather than throwing at the moment a student submits.
 */
export function scoreFromTable(table: SATConversionTable, raw: number): [number, number] {
  const exact = table[raw];
  if (exact) return [exact[0], exact[1]];
  const rows = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!rows.length) return [200, 200];
  if (raw <= rows[0]) return table[rows[0]];
  if (raw >= rows[rows.length - 1]) return table[rows[rows.length - 1]];
  const above = rows.findIndex((r) => r > raw);
  const [lo, hi] = [rows[above - 1], rows[above]];
  const t = (raw - lo) / (hi - lo);
  const at = (i: 0 | 1) => Math.round(table[lo][i] + t * (table[hi][i] - table[lo][i]));
  return [at(0), at(1)];
}

/** Add the two section ranges, bounds separately, as the guides instruct. */
export function totalRange(rw: [number, number], math: [number, number]): [number, number] {
  return [
    Math.max(TOTAL_MIN, rw[0] + math[0]),
    Math.min(TOTAL_MAX, rw[1] + math[1]),
  ];
}

/**
 * The pure scoring logic, taking an already-resolved test (or null) rather
 * than a testNo, so it is testable against synthetic conversion tables
 * without depending on practice-tests.json actually holding any (it is
 * `{"tests": []}` until ingestion lands).
 *
 * Returns null — never an official score — unless the test exists AND both
 * of its section tables are complete (spec 10.5).
 */
export function scoreOfficialFrom(
  test: SATPracticeTest | null, raw: Record<SATSection, number>,
): SATScore | null {
  if (!test) return null;
  if (!isCompleteTable(test.conversion?.rw, "rw")) return null;
  if (!isCompleteTable(test.conversion?.math, "math")) return null;
  const [lower, upper] = totalRange(
    scoreFromTable(test.conversion.rw, raw.rw),
    scoreFromTable(test.conversion.math, raw.math),
  );
  return { authority: "official", lower, upper, testNo: test.testNo };
}

/** An official score for a practice test, or null if that test has no
 *  complete ingested table — in which case nothing may claim officiality. */
export function scoreOfficial(
  testNo: number, raw: Record<SATSection, number>,
): SATScore | null {
  return scoreOfficialFrom(practiceTest(testNo), raw);
}

/**
 * An estimated score for an assembled adaptive form.
 *
 * There is no published curve for a form College Board never published, so
 * this averages the ingested official curves and maps the adaptive raw
 * score onto the paper scale by proportion — an adaptive section is out of
 * 54 (R&W) or 44 (Math) where the paper is out of 66 or 54. That mapping is
 * an approximation on top of an average, which is exactly why the result is
 * labelled "estimated" and carries its basis in the value itself.
 *
 * Only *complete* curves are averaged (see `isCompleteTable`); a partially-
 * ingested table is excluded rather than skewing the mean. Callers must
 * still independently confirm at least one complete table exists before
 * treating this result as meaningful — with zero complete curves this
 * floors to the 400-400 minimum like any other estimate with no data, it
 * does not refuse to run (the SAT Lab route layer, plan 3, is what gates
 * showing an estimate on `hasConversionTables`, not this function).
 */
export function scoreEstimated(raw: Record<SATSection, number>): SATScore {
  const tests = loadPracticeTests();
  const adaptiveMax: Record<SATSection, number> = {
    rw: BLUEPRINT.rw.perModule * 2,
    math: BLUEPRINT.math.perModule * 2,
  };

  const sectionRange = (section: SATSection): [number, number] => {
    const scaled = Math.round((raw[section] / adaptiveMax[section]) * PAPER_MAX[section]);
    const curves = tests
      .map((t) => t.conversion?.[section])
      .filter((c): c is SATConversionTable => isCompleteTable(c, section));
    if (!curves.length) return [200, 200];
    const bounds = curves.map((c) => scoreFromTable(c, scaled));
    const mean = (i: 0 | 1) =>
      Math.round(bounds.reduce((n, b) => n + b[i], 0) / bounds.length);
    return [mean(0), mean(1)];
  };

  const [lower, upper] = totalRange(sectionRange("rw"), sectionRange("math"));
  return {
    authority: "estimated",
    lower,
    upper,
    basis:
      `Estimated from the average of ${tests.length} official conversion ` +
      "tables. No published curve exists for an assembled adaptive form, so " +
      "this is not an official SAT score.",
  };
}
