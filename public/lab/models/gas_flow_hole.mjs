// 9702_m21_33-q2: fixed effective-speed approximation over the marked interval.
// Not a coupled air/water hydrostatic solution. No calibration claim is made.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';

export function makeGasFlowHole(parameters = {}, seed = 2021332) {
  // Private closure; no parameter object is returned or serialized.
  const truth = { D: 0.07, L: 0.03, S: 12, pin: 0.0006, nail: 0.0015,
    d_eff_over_tool: 1, ...parameters };
  for (const value of Object.values(truth))
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Positive finite model parameters required');
  const random = seededRandom(seed);
  function diameter(tool) {
    if (!['pin', 'nail'].includes(tool)) throw new RangeError('Choose pin or nail');
    return truth[tool];
  }
  function idealTime(d) {
    if (!Number.isFinite(d) || d <= 0) throw new RangeError('Positive diameter required');
    return truth.D ** 2 * truth.L / (truth.S * (d * truth.d_eff_over_tool) ** 2);
  }
  function intervalTime(tool) { return idealTime(diameter(tool)); }
  // Fraction of interval traversed; includes room before/after marks for manual timing.
  function interfacePosition(tool, seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Nonnegative time required');
    return Math.min(1.2, -0.1 + seconds / intervalTime(tool));
  }
  function readDimensions(tool, { parallax = false } = {}) {
    return {
      l: readInstrument(truth.L, { resolution: .001, halfWidth: .0005, bias: parallax ? .001 : 0 }, random),
      d: readInstrument(truth.D, { resolution: .001, halfWidth: .0005, bias: parallax ? .001 : 0 }, random),
      d_2: readInstrument(diameter(tool), { resolution: .00001, halfWidth: .00001 }, random),
    };
  }
  function readElapsed(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('Positive elapsed time required');
    // User start/stop judgements supply reaction error; do not double-count it here.
    return readInstrument(seconds, { resolution: .1 }, random);
  }
  return Object.freeze({ idealTime, intervalTime, interfacePosition, readDimensions, readElapsed });
}
