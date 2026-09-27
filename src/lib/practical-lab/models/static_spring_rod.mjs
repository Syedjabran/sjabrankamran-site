// Experiment 9702_m21_33-q1 — wooden rod held horizontal by an expendable spring.
// Physics from reviews/physics-spec.json (Maxwell, source-reviewed 2026-09-23):
//   Torque balance + Hooke's law:  F = m g d * sqrt(x^2 + h^2) / (h x),  E = F/ks,  C = C0 + E.
// The paper's E^-4-vs-x straight line is a finite-range empirical approximation,
// NOT the underlying law, so we model the real geometry and let the transformed
// graph be approximately linear — never forced.
//
// `truth` holds hidden nominal/synthetic parameters (rod mass, ks, C0, geometry).
// It must never be exported to the student layer; only ruler-readable lengths are.
export function makeStaticSpringRod(truth = { h_m:.25, C0_m:.02, ks_N_per_m:25, mass_kg:.16, centre_m:.205 }) {
  const { h_m, C0_m, ks_N_per_m, mass_kg, centre_m, g = 9.81 } = truth;
  for (const [k, v] of Object.entries({ h_m, C0_m, ks_N_per_m, mass_kg, centre_m, g }))
    if (!Number.isFinite(v)) throw new RangeError(`static_spring_rod: ${k} must be finite`);
  if (ks_N_per_m <= 0 || h_m <= 0) throw new RangeError('ks and h must be positive');

  // Spring extension E for a given loop position x (metres). x must be > 0.
  function extension(x_m) {
    if (!Number.isFinite(x_m) || x_m <= 0) throw new RangeError('x must be > 0');
    const F = mass_kg * g * centre_m * Math.sqrt(x_m * x_m + h_m * h_m) / (h_m * x_m);
    return F / ks_N_per_m; // metres
  }
  // What the ruler would measure between the fixed mark and the loop, C = C0 + E.
  function springMark(x_m) { return C0_m + extension(x_m); }
  // Rod stays horizontal only when the string length matches; otherwise it tilts.
  // Positive => rod tilts down at the loaded end (student must re-level before reading).
  function tiltDegrees(stringErr_m) {
    const s = Number.isFinite(stringErr_m) ? stringErr_m : 0;
    return Math.atan2(s, centre_m) * 180 / Math.PI;
  }
  return { extension, springMark, tiltDegrees,
    controls: { x_values: [0.145, 0.17, 0.195, 0.22, 0.245, 0.27, 0.295, 0.32] },
    analysis: { transform: (E) => E ** -4, xLabel: 'x / m', yLabel: 'E^-4 / m^-4' } };
}
