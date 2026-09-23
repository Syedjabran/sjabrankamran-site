// 9702_m22_33-q2: four identical springs split into two tensioned series branches.
// Finite spring mass is retained; no artificial period offset is imposed.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function makeSpringNetworkOscillator(parameters = {}, seed = 2022332) {
  const truth = { ks_N_per_m: 25, m1_kg: .15, rho_clay_kg_m3: 1600,
    m_spring_kg: .003, gamma_s_inv: .06, ...parameters };
  for (const key of ['ks_N_per_m', 'm1_kg', 'rho_clay_kg_m3'])
    if (!Number.isFinite(truth[key]) || truth[key] <= 0) throw new RangeError('Positive finite mass, density and stiffness required');
  for (const key of ['m_spring_kg', 'gamma_s_inv'])
    if (!Number.isFinite(truth[key]) || truth[key] < 0) throw new RangeError('Nonnegative spring mass and damping required');
  const random = seededRandom(seed);
  function fraction(f) { if (![1,.75].includes(f)) throw new RangeError('Use whole or three-quarter clay'); }
  function period(n, f) {
    fraction(f); if (![1,2].includes(n)) throw new RangeError('Choose joint 1 or 2');
    const stiffness = truth.ks_N_per_m/n + truth.ks_N_per_m/(4-n);
    return 2*Math.PI*Math.sqrt((truth.m1_kg*f + 4*truth.m_spring_kg/3)/stiffness);
  }
  function displacement(n, f, amplitude, seconds) {
    if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > .02) throw new RangeError('Amplitude must be 0–0.02 m');
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Nonnegative finite time required');
    return amplitude*Math.exp(-truth.gamma_s_inv*seconds)*Math.cos(2*Math.PI*seconds/period(n,f));
  }
  function readDiameter(f, { anisotropy = false } = {}) {
    fraction(f);
    const diameter = Math.cbrt(6*truth.m1_kg*f/(Math.PI*truth.rho_clay_kg_m3));
    return readInstrument(diameter, { resolution:.001, halfWidth:.002, bias:anisotropy ? .002 : 0 }, random);
  }
  function readElapsed(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('Positive elapsed time required');
    // Manual timing supplies start/stop error independently of the ideal oscillator.
    return readInstrument(seconds, { resolution:.1 }, random);
  }
  return Object.freeze({ period, displacement, readDiameter, readElapsed });
}
