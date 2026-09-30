// src/lib/sat/adaptive.ts
//
// Routing from Module 1 to Module 2.
//
// College Board does not publish the real routing algorithm or its cut
// score. This threshold is therefore a documented, configurable
// approximation, and spec 10.6 requires it to be described as one
// *everywhere it is surfaced*. ROUTING_DISCLOSURE is defined once, in
// client-types.ts (the public /sat pages render it too), and re-exported
// here next to the number it describes.
import { BLUEPRINT } from "./forms.ts";
import { ROUTING_DISCLOSURE } from "./client-types.ts";
import type { SATSection } from "./types.ts";

export { ROUTING_DISCLOSURE };

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

/** Which Module 2 a student sits, given their Module 1 raw correct. */
export function routeModule2(section: SATSection, rawCorrect: number): "lower" | "upper" {
  return rawCorrect >= ROUTING[section].threshold ? "upper" : "lower";
}
