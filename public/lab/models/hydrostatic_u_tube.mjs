// 9702_m22_33-q1: static, immiscible columns, equal bore, atmospheric surfaces.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function makeHydrostaticUTube(parameters = {}, seed = 2022331) {
  const truth = { z0_m: .25, F_m: .07, rho_water_kg_m3: 1000, rho_oil_kg_m3: 910, ...parameters };
  for (const value of Object.values(truth))
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Positive finite column parameters required');
  const random = seededRandom(seed);
  function validate(h) {
    if (!Number.isFinite(h) || h < .03 || h > .2) throw new RangeError('Oil B column must be between 0.03 and 0.20 m');
  }
  function interfaces(h) {
    validate(h);
    const y_m = truth.rho_oil_kg_m3 / truth.rho_water_kg_m3 * (truth.F_m - h);
    return { a_m: truth.z0_m - y_m / 2, b_m: truth.z0_m + y_m / 2, y_m };
  }
  function geometry(h) {
    const { a_m, b_m } = interfaces(h);
    return { a_m, b_m, surfaceA_m: a_m + truth.F_m, surfaceB_m: b_m + h };
  }
  function readColumns(h, { parallax = false } = {}) {
    const { a_m, b_m } = interfaces(h);
    // Endpoint errors independent; parallax is a separate student-selected bias.
    const ruler = (value, bias = 0) => readInstrument(value, { resolution: .001, halfWidth: .001, bias }, random);
    return { f: ruler(truth.F_m), h: ruler(h), a: ruler(a_m, parallax ? .002 : 0), b: ruler(b_m) };
  }
  return Object.freeze({ interfaces, geometry, readColumns });
}
