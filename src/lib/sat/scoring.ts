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
import type { SATConversionTable, SATScore, SATSection } from "./types.ts";

const TOTAL_MIN = 400;
const TOTAL_MAX = 1600;

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

/** An official score for a practice test, or null if that test has no
 *  ingested table — in which case nothing may claim officiality. */
export function scoreOfficial(
  testNo: number, raw: Record<SATSection, number>,
): SATScore | null {
  const test = practiceTest(testNo);
  if (!test?.conversion?.rw || !test?.conversion?.math) return null;
  const [lower, upper] = totalRange(
    scoreFromTable(test.conversion.rw, raw.rw),
    scoreFromTable(test.conversion.math, raw.math),
  );
  return { authority: "official", lower, upper, testNo };
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
 */
export function scoreEstimated(raw: Record<SATSection, number>): SATScore {
  const tests = loadPracticeTests();
  const paperMax: Record<SATSection, number> = { rw: 66, math: 54 };
  const adaptiveMax: Record<SATSection, number> = {
    rw: BLUEPRINT.rw.perModule * 2,
    math: BLUEPRINT.math.perModule * 2,
  };

  const sectionRange = (section: SATSection): [number, number] => {
    const scaled = Math.round((raw[section] / adaptiveMax[section]) * paperMax[section]);
    const curves = tests
      .map((t) => t.conversion?.[section])
      .filter((c): c is SATConversionTable => Boolean(c && Object.keys(c).length));
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
