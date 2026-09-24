// One time scale for apparatus motion AND manual stopwatches. Values in CSV remain
// simulated physical seconds, never wall seconds. No hidden tab catch-up.
let scale = 1;
export function setTimeScale(value) {
  if (![.25,.5,1,2,4].includes(value)) throw new RangeError('Unsupported time scale');
  scale = value;
}
export function getTimeScale() { return scale; }
export function simulationDelta(now, last) {
  if (last === null || !Number.isFinite(now) || !Number.isFinite(last)) return 0;
  return Math.min(.25, Math.max(0, (now-last)/1000)) * scale;
}
