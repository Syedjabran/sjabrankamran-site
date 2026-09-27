// Instrument primitives for the Practical Lab's physics models. SERVER-ONLY.
//
// Moved from public/lab/lib/measurement.mjs (the browser keeps only linearFit
// and readingsCSV, which work on the student's own entries). seededRandom's
// generator, quantize and readInstrument are unchanged; the one addition is a
// random *scope* so the server can decide which stream a model's random draws
// come from without touching the models:
//
//   const scope = { key: apparatusKey };
//   const model = inRandomScope(scope, () => makeX(params));  // construction draws
//   scope.key = readingKey;
//   const r = inRandomScope(scope, () => model.readY(...));     // this reading's draws
//
// A generator created inside a scope mixes its own seed with the scope's key
// *at each draw*, so the draws a model makes while it is built (a contact
// offset, resistor tolerances) come from the attempt's apparatus stream, and
// the draws a reading makes come from that reading's stream. Everything here
// is synchronous, so the scope can't leak between requests. Outside a scope a
// generator behaves exactly as before.

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** murmur3's 32-bit finaliser: a well-mixed 32-bit hash of a 32-bit value. */
function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The stream seed for a model seed within a scope key. */
export function mixSeed(seed, key) {
  return fmix32(fmix32(seed >>> 0) ^ (key >>> 0));
}

let activeScope = null;

/** Run `fn` with `scope` ({ key: uint32 }) as the random scope. */
export function inRandomScope(scope, fn) {
  const previous = activeScope;
  activeScope = scope;
  try {
    return fn();
  } finally {
    activeScope = previous;
  }
}

export function seededRandom(seed) {
  const scope = activeScope;
  if (!scope) return mulberry32(seed);
  const streams = new Map();
  return () => {
    const key = scope.key >>> 0;
    let next = streams.get(key);
    if (!next) {
      next = mulberry32(mixSeed(seed, key));
      streams.set(key, next);
    }
    return next();
  };
}

export function quantize(value, resolution) {
  if (!Number.isFinite(value) || !Number.isFinite(resolution) || resolution <= 0)
    throw new RangeError('Finite value and positive resolution required');
  return Number((Math.round(value / resolution) * resolution).toPrecision(14));
}

// Call once per deliberate instrument reading, never from an animation frame.
// Half-width is a declared uniform error model, NOT a confidence interval.
export function readInstrument(value, { resolution, bias = 0, halfWidth = 0 }, random) {
  if (!Number.isFinite(bias) || !Number.isFinite(halfWidth) || halfWidth < 0)
    throw new RangeError('Invalid instrument error parameters');
  const noise = halfWidth ? (2 * random() - 1) * halfWidth : 0;
  return quantize(value + bias + noise, resolution);
}
