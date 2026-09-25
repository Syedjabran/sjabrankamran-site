// src/lib/sat/adaptive.ts
//
// Routing from Module 1 to Module 2.
//
// College Board does not publish the real routing algorithm or its cut
// score. This threshold is therefore a documented, configurable
// approximation, and spec 10.6 requires it to be described as one
// *everywhere it is surfaced* -- hence ROUTING_DISCLOSURE living here, next
// to the number it describes, rather than being retyped in each component
// that happens to show a score.
import { BLUEPRINT } from "./forms.ts";
import type { SATSection } from "./types.ts";

/** Share of Module 1 a student must answer correctly to route upward. 60% is
 *  this module's calibration, chosen to put roughly the upper half of
 *  test-takers into the harder module. It is not College Board's value; no
 *  published value exists. */
const UPPER_SHARE = 0.6;

export const ROUTING: Record<SATSection, { threshold: number; outOf: number }> = {
  rw: {
    threshold: Math.ceil(BLUEPRINT.rw.perModule * UPPER_SHARE),
    outOf: BLUEPRINT.rw.perModule,
  },
  math: {
    threshold: Math.ceil(BLUEPRINT.math.perModule * UPPER_SHARE),
    outOf: BLUEPRINT.math.perModule,
  },
};

export const ROUTING_DISCLOSURE =
  "College Board does not publish the routing rule or cut score the real " +
  "digital SAT uses. This practice form routes on the number of Module 1 " +
  "questions answered correctly, against a threshold this site chose as an " +
  "approximation. It is not the official algorithm.";

/** Which Module 2 a student sits, given their Module 1 raw correct. */
export function routeModule2(section: SATSection, rawCorrect: number): "lower" | "upper" {
  return rawCorrect >= ROUTING[section].threshold ? "upper" : "lower";
}
