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
// offset, resistor tolerances) come from the attempt's apparatus stream.
//
// Instrument readings inside a scope that has a `readKey` take their noise
// from what they read instead of from a stream: the attempt (readKey), the
// instrument (resolution, half-width, bias) and the true value to the
// instrument's resolution. So a quantity reads the same whenever its true
// value is in the same resolution step -- at any setting, at any moment of a
// trial, however often it is read -- and repeating or averaging readings
// can't dig below the instrument's resolution. A reading changes only when
// what it measures moves by a resolution step. The noise distribution is the
// declared one (uniform over +-halfWidth, then quantised).
//
// Everything here is synchronous, so the scope can't leak between requests.
// Outside a scope a generator and readInstrument behave exactly as before.

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

/** A 32-bit hash of a string (FNV-1a, then murmur's finaliser). */
function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return fmix32(h);
}

/** The uniform draw behind a reading of `value` by this instrument, under
 *  the scope's read key. */
export function valueDraw(readKey, value, { resolution, bias = 0, halfWidth = 0 }) {
  const step = Math.round(value / resolution);
  return mulberry32(mixSeed(hashString(`${step}|${resolution}|${halfWidth}|${bias}`), readKey))();
}

let activeScope = null;

/** Run `fn` with `scope` ({ key: uint32, readKey?: uint32 }) as the random scope. */
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
  const readKey = activeScope?.readKey;
  const u = !halfWidth ? 0 : readKey === undefined ? random() : valueDraw(readKey, value, { resolution, bias, halfWidth });
  const noise = halfWidth ? (2 * u - 1) * halfWidth : 0;
  return quantize(value + bias + noise, resolution);
}
