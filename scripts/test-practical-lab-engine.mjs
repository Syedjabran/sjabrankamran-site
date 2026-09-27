import assert from "node:assert/strict";
import { register } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Practical Lab on the server (Task 2b-B): the engine that replaced the
// browser's models, the per-attempt hidden values, the /api/lab routes, the
// room's thin client, and the guard that public/lab carries no model code.
//
// `@/x` maps to src/x.ts (src/x for .mjs); getPortalUser and the fresh
// Storage reads/writes are stubs driven from globalThis.__labApi, so the real
// routes run under Node with no network and no sign-in.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = new URL("../src/", import.meta.url).href;
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  "server-only": stub(""),
  "@/lib/edu/auth": stub("export const getPortalUser = async () => globalThis.__labApi.user;"),
  "@/lib/exam-lab/storage-fresh": stub([
    "export const readFreshJson = async (bucket, path) => globalThis.__labApi.read(bucket, path);",
    "export const writeFreshJson = async (bucket, path, value) => globalThis.__labApi.write(bucket, path, value);",
  ].join("\n")),
};
register(stub(`
const SRC = ${JSON.stringify(SRC)};
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) return next(new URL(specifier.slice(2) + (specifier.endsWith(".mjs") ? "" : ".ts"), SRC).href, context);
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}`));

const E = await import("../src/lib/practical-lab/engine.mjs");
const P = await import("../src/lib/practical-lab/params.ts");
const A = await import("../src/lib/practical-lab/attempt.ts");
const API = await import("../src/lib/practical-lab/lab-api.ts");
const M = await import("../src/lib/practical-lab/measurement.mjs");
const { rooms } = await import("../public/lab/lab-room/contracts.mjs");

const KEY = Buffer.from("test-attempt-key");
const ids = E.EXPERIMENT_IDS;
const familyOf = (id) => E.experimentOf(id).family;
const rest = (id, params = {}, key = KEY, settings = E.defaultSettings(id)) => E.viewAt({ id, params, attemptKey: key, settings });
const running = (t, extra = {}) => ({ active: true, closed: true, t, run: 1, history: null, ...extra });
/** Readings, or the apparatus's own refusal (a RangeError such as "Level the
 *  string before reading" at a practical's starting settings). */
const trySample = (request) => {
  try { return E.sampleAt(request); } catch (error) { if (error instanceof RangeError) return { refused: error.message }; throw error; }
};

// --- the registry ---------------------------------------------------------------
assert.equal(ids.length, 50, "50 practicals");
assert.equal(E.FAMILIES.length, 50, "50 model families");
assert.deepEqual([...ids].sort(), Object.keys(rooms).sort(), "the server has every practical the room has, and no other");
assert.deepEqual(new Set(ids.map(familyOf)), new Set(E.FAMILIES), "every family is used by a practical");
assert.deepEqual(Object.keys(P.VARIATION).sort(), [...E.FAMILIES].sort(), "every family has a parameter table");
assert.equal(familyOf("9702_w23_33-q1"), "interrupted_pendulum_fixed_length", "w23_33-q1 runs on the fixed-length pendulum, as the room always did");
assert.equal(E.experimentOf("9702_x99_33-q9"), null);
assert.equal(E.experimentOf("__proto__"), null);
assert.equal(E.experimentOf({}), null);

// --- settings and state are whitelisted -------------------------------------------
const bridge = "9702_w21_34-q1"; // wire_bridge_null: p in [0.15, 0.72] step 0.005, q in [0, 0.8] step 0.001
assert.deepEqual(E.normaliseSettings(bridge, { p: 0.4, q: 0.2 }), { p: 0.4, q: 0.2 });
assert.deepEqual(E.normaliseSettings(bridge, { p: "0.4", q: "0.2" }), { p: 0.4, q: 0.2 }, "range values from the DOM are numbers");
assert.deepEqual(E.normaliseSettings(bridge, { p: 0.4012, q: 0.2 }), { p: 0.4, q: 0.2 }, "a range value snaps to its control's step");
assert.throws(() => E.normaliseSettings(bridge, { p: 0.9, q: 0.2 }), E.LabInputError, "out of range");
assert.throws(() => E.normaliseSettings(bridge, { p: 0.4 }), E.LabInputError, "a missing control");
assert.throws(() => E.normaliseSettings(bridge, { p: 0.4, q: 0.2, g: 9.81 }), E.LabInputError, "an unknown key");
assert.throws(() => E.normaliseSettings(bridge, { p: "x", q: 0.2 }), E.LabInputError);
assert.throws(() => E.normaliseSettings(bridge, null), E.LabInputError);
assert.deepEqual(E.normaliseSettings("9702_m21_33-q2", { tool: "nail" }), { tool: "nail" });
assert.throws(() => E.normaliseSettings("9702_m21_33-q2", { tool: "drill" }), E.LabInputError, "a select value must be one of its options");
assert.deepEqual(E.normaliseState(bridge, {}), { active: false, closed: false, t: 0, run: 0, history: null });
assert.deepEqual(E.normaliseState(bridge, { active: true, t: 3, run: 2 }), { active: true, closed: true, t: 3, run: 2, history: null });
assert.equal(E.normaliseState(bridge, { active: true, t: 1e9 }).t, 600, "time is capped at the family's longest trial");
assert.equal(E.normaliseState(bridge, { active: false, closed: true, t: 5 }).closed, false, "not running means not closed and t = 0");
assert.throws(() => E.normaliseState(bridge, { active: true, t: -1 }), E.LabInputError);
assert.throws(() => E.normaliseState(bridge, { run: 1.5 }), E.LabInputError);
const led = "9702_w25_33-q2";
assert.throws(() => E.normaliseState(led, { active: true, history: [{ t: 1, settings: { length: 0.1, angle: 0 } }] }), E.LabInputError, "LED history starts at t = 0");
assert.throws(() => E.normaliseState(led, { active: true, history: Array.from({ length: 33 }, (_, i) => ({ t: i, settings: { length: 0.1, angle: 0 } })) }), E.LabInputError, "at most 32 changes");
assert.equal(E.normaliseState(bridge, { active: true, history: [{ t: 0, settings: {} }] }).history, null, "history is only for the LED practical");

// --- every practical works on the server ----------------------------------------------
const refusedAtStart = [];
const summary = {};
const VIEW_KEYS = new Set(["kind", "status", "dx", "dy", "dx2", "dy2", "angle", "compression", "scaleX", "scaleY", "fill", "left", "right", "topLeft", "topRight", "head", "blur", "hit", "unstable", "powered", "jet"]);
for (const id of ids) {
  const family = familyOf(id);
  const timing = E.timingOf(family);
  const settings = E.defaultSettings(id);
  const v = rest(id);
  assert.equal(typeof v.kind, "string", `${id}: a view has a kind`);
  for (const [k, value] of Object.entries(v)) {
    assert.ok(VIEW_KEYS.has(k), `${id}: view field ${k} is one the room draws`);
    assert.ok(["string", "boolean", "number"].includes(typeof value), `${id}: ${k}`);
  }
  const r = trySample({ id, params: {}, attemptKey: KEY, settings });
  if (r.refused) refusedAtStart.push(`${id}: ${r.refused}`);
  else for (const value of Object.values(r)) assert.ok(Number.isFinite(value), `${id}: readings are finite numbers`);
  const track = E.trackChunk({ id, params: {}, attemptKey: KEY, settings, state: { run: 1 } });
  if (timing.timed) {
    assert.equal(track.frames.count, timing.fps * timing.chunkSeconds, `${id}: a full first chunk`);
    assert.equal(track.done, false);
  } else {
    assert.equal(track.frames.count, 1, `${id}: an untimed practical's trial is its running view`);
    assert.equal(track.done, true);
  }
  assert.equal(Boolean(track.meters), Boolean(timing.meterSeconds), `${id}: meters only for the metered practicals`);
}
// Only the practicals whose starting settings need the student to act first
// (level the string, let the winding stop, find the slip) refuse a reading.
assert.ok(refusedAtStart.length <= 4, refusedAtStart.join("; "));
assert.deepEqual(ids.filter((id) => E.timingOf(familyOf(id)).meterSeconds).map(familyOf).sort(), [
  "led_ldr_photoresistance", "liquid_adhesion_drainage", "rc_discharge_parallel", "syringe_nozzle_drainage",
  "thermal_pipe_lever", "thermal_pipe_suspended_lever",
]);

// Views are quantised: angles to 0.1°, bench offsets to 0.5 px, fill to 1/500.
{
  const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-6;
  const osc = "9702_m24_33-q1"; // compound pendulum (integrator)
  const chunk = E.trackChunk({ id: osc, params: {}, attemptKey: KEY, settings: E.defaultSettings(osc), state: { run: 1 } });
  for (const a of chunk.frames.series.angle) assert.ok(onGrid(a, 0.1), "angles to 0.1°");
  for (const d of chunk.frames.series.dx) assert.ok(onGrid(d, 0.5), "offsets to 0.5 px");
  const flow = "9702_m21_33-q2";
  const fills = E.trackChunk({ id: flow, params: {}, attemptKey: KEY, settings: E.defaultSettings(flow), state: { run: 1 } }).frames.series.fill;
  for (const f of fills) assert.ok(onGrid(f, 0.002), "fill to 1/500");
  assert.deepEqual(E.publicView({ kind: "optics", real: true, blur: 0.12345, f_cm: 21.3, extension: 0.1, device: { R_ohm: 500 } }), { kind: "optics", blur: 0.12 }, "fields the room doesn't draw never leave");
}

// A track is the same view a request for that moment gets, and its meters are
// the same readings "Inspect instruments" gets at those moments.
for (const id of ["9702_m22_33-q2", "9702_m24_33-q1", "9702_w24_33-q2", "9702_s22_34-q1", "9702_m25_33-q2", "9702_w25_33-q2"]) {
  const settings = E.defaultSettings(id);
  const timing = E.timingOf(familyOf(id));
  for (const chunk of [0, 1]) {
    const track = E.trackChunk({ id, params: {}, attemptKey: KEY, settings, state: { run: 3, history: familyOf(id) === "led_ldr_photoresistance" ? [{ t: 0, settings }] : null }, chunk });
    const frameAt = (i) => {
      const f = { ...track.frames.constant };
      for (const [k, values] of Object.entries(track.frames.series)) f[k] = values[i];
      for (const [k, changes] of Object.entries(track.frames.steps)) for (const [at, value] of changes) if (at <= i) f[k] = value;
      return f;
    };
    for (const i of [0, 7, Math.floor(track.frames.count / 2), track.frames.count - 1]) {
      const g = track.first + i;
      const state = running(g / timing.fps, { run: 3, history: familyOf(id) === "led_ldr_photoresistance" ? [{ t: 0, settings }] : null });
      assert.deepEqual(frameAt(i), E.viewAt({ id, params: {}, attemptKey: KEY, settings, state }), `${id} chunk ${chunk} frame ${i}`);
    }
    for (const [g, readings] of (track.meters?.readings ?? []).filter((_, j) => j % 17 === 0)) {
      const state = running(g / timing.fps, { run: 3, history: familyOf(id) === "led_ldr_photoresistance" ? [{ t: 0, settings }] : null });
      assert.deepEqual(readings, E.sampleAt({ id, params: {}, attemptKey: KEY, settings, state }), `${id} meter at frame ${g}`);
    }
  }
}
assert.throws(() => E.trackChunk({ id: "9702_m22_33-q2", params: {}, attemptKey: KEY, settings: E.defaultSettings("9702_m22_33-q2"), chunk: 31 }), E.LabInputError, "no chunk past the longest trial");

// --- the nominal table is the models' own defaults ---------------------------------------
for (const id of ids) {
  const family = familyOf(id);
  const nominal = P.nominalParams(family);
  const settings = E.defaultSettings(id);
  for (const state of [undefined, running(1)]) {
    const a = { v: E.viewAt({ id, params: nominal, attemptKey: KEY, settings, state }), r: trySample({ id, params: nominal, attemptKey: KEY, settings, state }) };
    const b = { v: E.viewAt({ id, params: {}, attemptKey: KEY, settings, state }), r: trySample({ id, params: {}, attemptKey: KEY, settings, state }) };
    assert.deepEqual(a, b, `${id}: VARIATION's nominal values are the model defaults`);
  }
}

// --- per-attempt hidden values ------------------------------------------------------------
{
  const SECRET = "x".repeat(40);
  const UID = "4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f";
  const id = "9702_w22_33-q2"; // buoyancy springs: k1, k2, rho_oil, Lfree_m
  const family = familyOf(id);
  const p1 = P.attemptParams(SECRET, family, UID, id, 1);
  assert.deepEqual(P.attemptParams(SECRET, family, UID, id, 1), p1, "the same attempt always gets the same values");
  assert.deepEqual(Object.keys(p1).sort(), Object.keys(P.VARIATION[family]).sort());
  const differs = (a, b) => Object.keys(a).every((k) => a[k] !== b[k]);
  assert.ok(differs(p1, P.attemptParams(SECRET, family, UID, id, 2)), "another attempt, other values");
  assert.ok(differs(p1, P.attemptParams(SECRET, family, "11111111-2222-4333-8444-555555555555", id, 1)), "another student, other values");
  assert.ok(differs(p1, P.attemptParams("y".repeat(40), family, UID, id, 1)), "another secret, other values");
  // Across many attempts every value stays in its range and uses most of it.
  for (const f of E.FAMILIES) {
    const table = P.VARIATION[f];
    const seen = Object.fromEntries(Object.keys(table).map((k) => [k, []]));
    for (let n = 1; n <= 200; n++) for (const [k, v] of Object.entries(P.attemptParams(SECRET, f, UID, `exp-${f}`, n))) seen[k].push(v);
    for (const [k, values] of Object.entries(seen)) {
      const [nominal, spread] = table[k];
      const [low, high] = P.spreadRange(spread);
      const lo = nominal * (1 + low), hi = nominal * (1 + high);
      for (const v of values) assert.ok(v >= lo - Math.abs(lo) * 1e-5 && v <= hi + Math.abs(hi) * 1e-5, `${f}.${k} = ${v} outside [${lo}, ${hi}]`);
      assert.ok(Math.max(...values) - Math.min(...values) > 0.8 * (hi - lo), `${f}.${k} uses its range`);
    }
  }
  // The readings follow the attempt's values: springs with other constants read other lengths.
  const settings = E.normaliseSettings(id, { load: "M16", medium: "oil" });
  const lengthFor = (params) => E.sampleAt({ id, params, attemptKey: KEY, settings }).l;
  const lengths = new Set(Array.from({ length: 12 }, (_, n) => lengthFor(P.attemptParams(SECRET, family, UID, id, n + 1))));
  assert.ok(lengths.size >= 6, "different attempts measure different spring lengths");
}

// --- readings: repeatable per setting, independent otherwise, with the old noise ----------
{
  const id = "9702_s25_33-q1"; // wire_shunt_equal_resistors: e = readSupply() of a fixed 1.5 V cell, ±0.002 V, 0.001 V
  const settings = E.defaultSettings(id);
  const at = (t, key = KEY) => E.sampleAt({ id, params: {}, attemptKey: key, settings, state: running(t) });
  assert.deepEqual(at(2), at(2), "the same setting at the same moment reads the same");
  assert.deepEqual(E.sampleAt({ id, params: {}, attemptKey: KEY, settings }), E.sampleAt({ id, params: {}, attemptKey: KEY, settings }), "resting too");
  // Server readings: one per distinct moment (each its own stream).
  const N = 6000;
  const counts = (values) => { const c = new Map(); for (const v of values) c.set(v, (c.get(v) ?? 0) + 1); return c; };
  const server = counts(Array.from({ length: N }, (_, k) => Math.round((at(k / 30).e - 1.5) * 1000)));
  // The old room: one seeded stream, read sequentially (adapters.mjs's seededRandom(970234)).
  const random = M.seededRandom(970234);
  const old = counts(Array.from({ length: N }, () => Math.round((M.readInstrument(1.5, { resolution: 0.001, halfWidth: 0.002 }, random) - 1.5) * 1000)));
  // Uniform ±2 mV then rounding to 1 mV: -2 and +2 an eighth each, -1, 0, +1 a quarter each.
  const expected = new Map([[-2, 0.125], [-1, 0.25], [0, 0.25], [1, 0.25], [2, 0.125]]);
  const chi = (observed) => [...expected].reduce((sum, [k, p]) => sum + ((observed.get(k) ?? 0) - N * p) ** 2 / (N * p), 0);
  assert.deepEqual([...server.keys()].sort(), [...expected.keys()].sort(), "server errors take exactly the old values");
  // 4 degrees of freedom: chi² > 18.47 happens by chance one time in a thousand.
  assert.ok(chi(server) < 18.47, `server noise matches the instrument model (chi² ${chi(server).toFixed(2)})`);
  assert.ok(chi(old) < 18.47, `and so did the old room's (chi² ${chi(old).toFixed(2)})`);
  const between = [...expected.keys()].reduce((sum, k) => { const a = server.get(k) ?? 0, b = old.get(k) ?? 0; return sum + (a - b) ** 2 / (a + b); }, 0);
  assert.ok(between < 18.47, `server and old-room distributions agree (chi² ${between.toFixed(2)})`);
  summary.noise = `noise chi² server ${chi(server).toFixed(2)}, old room ${chi(old).toFixed(2)}, between ${between.toFixed(2)} (limit 18.47)`;
  const mean = [...server].reduce((s, [k, c]) => s + k * c, 0) / N;
  assert.ok(Math.abs(mean) < 0.05, `no bias (mean error ${mean.toFixed(3)} mV)`);
  // Different attempts read the same true value with independent noise.
  const keys = Array.from({ length: 400 }, (_, n) => Buffer.from(`attempt-${n}`));
  const perAttempt = counts(keys.map((k) => Math.round((E.sampleAt({ id, params: {}, attemptKey: k, settings }).e - 1.5) * 1000)));
  assert.ok(perAttempt.size >= 4, "attempts don't share one noise pattern");
  // The scoped streams are uniform.
  const scope = { key: 0 };
  const draws = [];
  for (let k = 0; k < 2000; k++) { scope.key = k; const rnd = M.inRandomScope(scope, () => M.seededRandom(2021341)); draws.push(rnd()); }
  const m = draws.reduce((a, b) => a + b, 0) / draws.length;
  const variance = draws.reduce((a, b) => a + (b - m) ** 2, 0) / draws.length;
  assert.ok(Math.abs(m - 0.5) < 0.03 && Math.abs(variance - 1 / 12) < 0.01, `scoped draws are uniform (mean ${m.toFixed(3)}, var ${variance.toFixed(4)})`);
  // Apparatus draws (a contact offset, resistor tolerances) are per attempt, not per reading.
  const network = "9702_w21_33-q1"; // parallel_resistor_network: each resistor's real value is drawn when the model is built
  const s2 = E.defaultSettings(network);
  const i1 = E.sampleAt({ id: network, params: {}, attemptKey: KEY, settings: s2, state: running(1) }).i;
  const again = Array.from({ length: 30 }, (_, k) => E.sampleAt({ id: network, params: {}, attemptKey: KEY, settings: s2, state: running(1 + k) }).i);
  assert.ok(again.every((i) => Math.abs(i - i1) <= 0.0002), "the same resistors on every reading of one attempt");
}

// --- no hidden value reaches what the room gets -----------------------------------------------
{
  const SECRET = "z".repeat(40);
  const numbers = (value, out = []) => {
    if (typeof value === "number") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => numbers(v, out));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => numbers(v, out));
    return out;
  };
  for (const id of ids) {
    const family = familyOf(id);
    for (const n of [1, 2]) {
      const params = P.attemptParams(SECRET, family, "u-leak-check", id, n);
      const key = A.attemptKey(SECRET, { uid: "u-leak-check", experiment: id, n });
      const settings = E.defaultSettings(id);
      const sent = [
        rest(id, params, key),
        trySample({ id, params, attemptKey: key, settings }),
        trySample({ id, params, attemptKey: key, settings, state: running(2) }),
        E.trackChunk({ id, params, attemptKey: key, settings, state: { run: 1 } }),
      ];
      const text = JSON.stringify(sent);
      assert.ok(!/truth|ideal|params|nominal/i.test(text), `${id}: no hidden-value names in the responses`);
      const sentNumbers = numbers(sent);
      for (const [name, hidden] of Object.entries(params)) {
        assert.ok(!sentNumbers.some((x) => Math.abs(x - hidden) <= Math.abs(hidden) * 1e-9), `${id}: ${name} = ${hidden} appears in a response`);
      }
    }
  }
}

// --- every setting that worked still works on every attempt ------------------------------------
{
  const SECRET = "w".repeat(40);
  // Level/slip thresholds move with the hidden values (finding them is the
  // practical); they're checked for reachability below instead.
  const THRESHOLD_MESSAGES = new Set(["Level the string before reading", "Restore a stable strip before reading the limiting angle"]);
  const outcome = (fn) => { try { fn(); return "ok"; } catch (e) { return THRESHOLD_MESSAGES.has(e.message) ? "ok" : e.message; } };
  const grid = (c) => c.type === "select" ? c.options.map((o) => o.value)
    : [...new Set([c.min, c.max, c.value, ...[0.25, 0.5, 0.75].map((f) => Number((c.min + Math.round((c.max - c.min) * f / c.step) * c.step).toPrecision(12)))])];
  let checked = 0;
  for (const id of ids) {
    const { family, controls } = E.experimentOf(id);
    let combos = [{}];
    for (const c of controls) combos = combos.flatMap((m) => grid(c).map((v) => ({ ...m, [c.key]: v })));
    const attempts = Array.from({ length: 6 }, (_, n) => P.attemptParams(SECRET, family, `sweep-${n}`, id, n + 1));
    for (const raw of combos) {
      const settings = E.normaliseSettings(id, raw);
      for (const state of [undefined, running(0), running(5)]) {
        const expected = [outcome(() => E.viewAt({ id, params: {}, attemptKey: KEY, settings, state })), outcome(() => E.sampleAt({ id, params: {}, attemptKey: KEY, settings, state }))];
        for (const params of attempts) {
          const got = [outcome(() => E.viewAt({ id, params, attemptKey: KEY, settings, state })), outcome(() => E.sampleAt({ id, params, attemptKey: KEY, settings, state }))];
          assert.deepEqual(got, expected, `${id} ${JSON.stringify(raw)} ${state ? `t=${state.t}` : "resting"} with ${JSON.stringify(params)}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 10_000, `${checked} setting checks`);
  summary.sweep = `${checked} setting checks across attempts`;

  // Every threshold can still be found on every attempt.
  const THRESHOLDS = {
    rod_pulley_equilibrium: { vary: "pulleyHeight", ok: (a) => a.readable, need: ["ok"] },
    ladder_static_friction: { vary: "base", ok: (a) => a.readable, need: ["ok", "not"] },
    loaded_rule_balance: { vary: "pivot", ok: (a) => a.view.status === "Rule balances.", need: ["ok", "not"] },
    spring_supported_variable_pivot_rod: { vary: "height", ok: (a) => a.view.status?.startsWith("Rod horizontal"), need: ["ok", "not"] },
    cylinder_step_stability: { vary: "height", ok: (a) => a.view.unstable === false, need: ["ok", "not"] },
    inclined_rod_lift: { vary: "force", ok: (a) => a.view.status?.includes("lost contact"), need: ["ok", "not"] },
  };
  for (const id of ids) {
    const { family, controls } = E.experimentOf(id);
    const spec = THRESHOLDS[family];
    if (!spec) continue;
    const c = controls.find((x) => x.key === spec.vary);
    const values = [];
    for (let k = 0; c.min + k * c.step <= c.max + 1e-9; k++) values.push(Number((c.min + k * c.step).toPrecision(12)));
    let others = [{}];
    for (const o of controls.filter((x) => x.key !== spec.vary)) others = others.flatMap((m) => (o.type === "select" ? o.options.map((p) => p.value) : [o.value]).map((v) => ({ ...m, [o.key]: v })));
    for (let n = 0; n <= 12; n++) {
      const params = n ? P.attemptParams(SECRET, family, `threshold-${n}`, id, n) : {};
      for (const base of others) {
        const found = values.map((v) => {
          const settings = E.normaliseSettings(id, { ...base, [spec.vary]: v });
          let readable = true;
          try { E.sampleAt({ id, params, attemptKey: KEY, settings }); } catch { readable = false; }
          return { view: E.viewAt({ id, params, attemptKey: KEY, settings }), readable };
        }).filter(spec.ok).length;
        if (spec.need.includes("ok")) assert.ok(found > 0, `${id} ${JSON.stringify(base)} attempt ${n}: the threshold is reachable`);
        if (spec.need.includes("not")) assert.ok(found < values.length, `${id} ${JSON.stringify(base)} attempt ${n}: the threshold is inside the range`);
      }
    }
  }
}

// --- the attempt token ------------------------------------------------------------------------
{
  const SECRET = "s".repeat(40);
  const claims = { uid: "4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f", experiment: bridge, n: 3, issuedAt: 1_790_000_000_000 };
  const token = A.signAttempt(SECRET, claims);
  assert.deepEqual(A.readAttempt(SECRET, token), claims);
  assert.equal(A.readAttempt("t".repeat(40), token), null, "another secret");
  const [v, body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ u: claims.uid, e: bridge, n: 4, i: claims.issuedAt })).toString("base64url");
  assert.equal(A.readAttempt(SECRET, `${v}.${forged}.${mac}`), null, "a changed attempt number");
  assert.equal(A.readAttempt(SECRET, `${v}.${body}.${mac.slice(0, -2)}`), null, "a cut signature");
  for (const bad of [null, 42, "", "v1.x", "v2." + body + "." + mac, "x".repeat(700)]) assert.equal(A.readAttempt(SECRET, bad), null, String(bad).slice(0, 20));
  assert.notDeepEqual(A.attemptKey(SECRET, claims), A.attemptKey(SECRET, { ...claims, n: 4 }));

  // The secret: required in production, a fixed one in development.
  const saved = { NODE_ENV: process.env.NODE_ENV, LAB_SECRET: process.env.LAB_SECRET };
  const warn = console.warn;
  console.warn = () => {};
  process.env.NODE_ENV = "production";
  delete process.env.LAB_SECRET;
  assert.equal(A.labSecret(), null, "production without a secret: none (the API refuses)");
  process.env.LAB_SECRET = "short";
  assert.equal(A.labSecret(), null, "production with a short secret: none");
  process.env.LAB_SECRET = "p".repeat(32);
  assert.equal(A.labSecret(), "p".repeat(32));
  process.env.NODE_ENV = "development";
  delete process.env.LAB_SECRET;
  assert.ok((A.labSecret() ?? "").length >= 32, "development falls back to a fixed secret");
  console.warn = warn;
  for (const [k, value] of Object.entries(saved)) if (value === undefined) delete process.env[k]; else process.env[k] = value;
}

// --- the attempts record -------------------------------------------------------------------------
const UID = "4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f";
const OTHER = "11111111-2222-4333-8444-555555555555";
/** An in-memory portal-data bucket with a log, driven by the stubs. */
function store(initial = {}, { failRead = false, failWrite = false } = {}) {
  const files = new Map(Object.entries(initial));
  const log = [];
  globalThis.__labApi = {
    ...globalThis.__labApi,
    read: async (bucket, path) => { log.push(`read ${bucket}/${path}`); return failRead ? { ok: false } : { ok: true, data: files.has(path) ? structuredClone(files.get(path)) : null }; },
    write: async (bucket, path, value) => { log.push(`write ${bucket}/${path}`); if (failWrite) return false; files.set(path, structuredClone(value)); return true; },
  };
  return { files, log };
}
{
  let s = store();
  assert.equal(await A.openAttempt(UID, bridge, false), 1, "a first visit starts attempt 1");
  assert.deepEqual(s.log, [`read portal-data/lab-attempts/${UID}.json`, `write portal-data/lab-attempts/${UID}.json`]);
  s.log.length = 0;
  assert.equal(await A.openAttempt(UID, bridge, false), 1, "a reload resumes it");
  assert.deepEqual(s.log, [`read portal-data/lab-attempts/${UID}.json`], "resuming writes nothing");
  assert.equal(await A.openAttempt(UID, bridge, true), 2, "fresh starts the next attempt");
  assert.equal(await A.openAttempt(UID, "9702_m21_33-q1", false), 1, "each practical has its own count");
  const doc = s.files.get(`lab-attempts/${UID}.json`);
  assert.equal(doc.experiments[bridge].n, 2);
  assert.deepEqual(doc.experiments[bridge].history.map((h) => h.n), [1, 2]);
  s = store({}, { failRead: true });
  assert.equal(await A.openAttempt(UID, bridge, false), null, "a failed read opens nothing");
  assert.deepEqual(s.log, [`read portal-data/lab-attempts/${UID}.json`], "and writes nothing");
  store({}, { failWrite: true });
  assert.equal(await A.openAttempt(UID, bridge, false), null, "a failed write opens nothing");
  store({ [`lab-attempts/${UID}.json`]: [1, 2] });
  assert.equal(await A.openAttempt(UID, bridge, false), null, "a doc that isn't an object is unreadable");
  store();
  assert.equal(await A.openAttempt("../../x", bridge, false), null, "an unsafe id opens nothing");
}

// --- the routes -----------------------------------------------------------------------------------
const routes = Object.fromEntries(await Promise.all(["attempt", "view", "sample", "trial"].map(async (r) => [r, await import(`../src/app/api/lab/${r}/route.ts`)])));
const post = (route, body) => routes[route].POST(new Request(`https://sjabrankamran.com/api/lab/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const user = (roles = ["student"], id = UID, status = "active") => ({ id, email: "", fullName: "", roles, status });
const GRANTED = (uid) => ({ [`subjects/${uid}.json`]: { grants: { "practical-lab": { by: "admin-1", at: "t" } }, history: [] } });
process.env.LAB_SECRET = "route-test-secret-".padEnd(40, "r");
const asJson = async (res) => ({ status: res.status, body: await res.json(), cache: res.headers.get("cache-control") });

// Who may use the lab API.
{
  const token = A.signAttempt(process.env.LAB_SECRET, { uid: UID, experiment: bridge, n: 1, issuedAt: 1 });
  const bodies = {
    attempt: { experiment: bridge },
    view: { attempt: token, settings: { p: 0.4, q: 0.2 } },
    sample: { attempt: token, settings: { p: 0.4, q: 0.2 } },
    trial: { attempt: token, settings: { p: 0.4, q: 0.2 } },
  };
  const cases = [
    ["signed out", null, {}, 401],
    ["switch off", user(), {}, 403],
    ["SAT only", user(), { [`subjects/${UID}.json`]: { grants: { sat: { by: "a", at: "t" } }, history: [] } }, 403],
    ["archived, switch on", user(["student"], UID, "archived"), GRANTED(UID), 403],
    ["archived teacher", user(["teacher"], UID, "archived"), {}, 403],
    ["parent", user(["parent"]), {}, 403],
    ["switch on", user(), GRANTED(UID), 200],
    ["teacher, no switch", user(["teacher"]), {}, 200],
    ["coordinator, no switch", user(["coordinator"]), {}, 200],
  ];
  for (const [label, who, files, status] of cases) {
    for (const route of Object.keys(bodies)) {
      API.resetLabApiState();
      store(files);
      globalThis.__labApi.user = who;
      const res = await asJson(await post(route, bodies[route]));
      assert.equal(res.status, status, `${label}: ${route}`);
      assert.equal(res.cache, "no-store", `${label}: ${route} is never cached`);
      if (status !== 200) assert.equal(typeof res.body.error, "string", `${label}: a plain-sentence error`);
    }
  }
  // A grants read that fails refuses (fail closed); staff need no read.
  for (const route of Object.keys(bodies)) {
    API.resetLabApiState();
    store(GRANTED(UID), { failRead: true });
    globalThis.__labApi.user = user();
    const res = await asJson(await post(route, bodies[route]));
    assert.equal(res.status, 503, `failed grants read: ${route}`);
    assert.equal(res.body.code, "unavailable");
  }
  // No LAB_SECRET in production: refused, never run with a guessable secret.
  const saved = { NODE_ENV: process.env.NODE_ENV, LAB_SECRET: process.env.LAB_SECRET };
  process.env.NODE_ENV = "production";
  delete process.env.LAB_SECRET;
  API.resetLabApiState();
  store(GRANTED(UID));
  globalThis.__labApi.user = user();
  const unset = await asJson(await post("attempt", { experiment: bridge }));
  assert.equal(unset.status, 503);
  assert.equal(unset.body.code, "not-configured");
  process.env.NODE_ENV = saved.NODE_ENV;
  process.env.LAB_SECRET = saved.LAB_SECRET;
}

// What the routes do for a switched-on student.
{
  API.resetLabApiState();
  const s = store({ ...GRANTED(UID), ...GRANTED(OTHER) });
  globalThis.__labApi.user = user();
  let res = await asJson(await post("attempt", { experiment: bridge }));
  assert.equal(res.status, 200);
  const opened = res.body;
  assert.deepEqual(Object.keys(opened).sort(), ["attempt", "controls", "experiment", "family", "n", "timing", "view"]);
  assert.equal(opened.n, 1);
  assert.equal(opened.family, "wire_bridge_null");
  assert.deepEqual(opened.controls, E.experimentOf(bridge).controls);
  assert.ok(!/truth|ideal|params/i.test(JSON.stringify(opened)));
  assert.equal((await asJson(await post("attempt", { experiment: bridge }))).body.n, 1, "a reload resumes the attempt");
  const token = opened.attempt;
  const settings = { p: 0.4, q: 0.2 };
  res = await asJson(await post("view", { attempt: token, settings }));
  assert.deepEqual(res.body, { view: opened.view }, "the resting view");
  const r1 = await asJson(await post("sample", { attempt: token, settings, state: { active: true, closed: true, t: 1.5 } }));
  const r2 = await asJson(await post("sample", { attempt: token, settings, state: { active: true, closed: true, t: 1.5 } }));
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body, r2.body, "the same reading twice");
  assert.deepEqual(Object.keys(r1.body.readings).sort(), ["p", "q", "v"]);
  res = await asJson(await post("trial", { attempt: token, settings, state: { run: 1 } }));
  assert.equal(res.status, 200);
  assert.equal(res.body.track.done, true);
  // Another attempt reads the same setting differently (its own apparatus).
  const fresh = (await asJson(await post("attempt", { experiment: bridge, fresh: true }))).body;
  assert.equal(fresh.n, 2);
  const freshReads = await Promise.all(Array.from({ length: 5 }, (_, k) => post("sample", { attempt: fresh.attempt, settings: { p: 0.4, q: 0.05 * k }, state: { active: true, closed: true, t: 1 } }).then((r) => r.json())));
  const firstReads = await Promise.all(Array.from({ length: 5 }, (_, k) => post("sample", { attempt: token, settings: { p: 0.4, q: 0.05 * k }, state: { active: true, closed: true, t: 1 } }).then((r) => r.json())));
  assert.notDeepEqual(freshReads.map((r) => r.readings.v), firstReads.map((r) => r.readings.v), "a fresh attempt is a different apparatus");
  assert.equal(s.files.get(`lab-attempts/${UID}.json`).experiments[bridge].n, 2);

  // Bad requests: plain 400s; a setting the apparatus refuses: 422 with its reason.
  const bad = async (route, body, status, code) => {
    const out = await asJson(await post(route, body));
    assert.equal(out.status, status, JSON.stringify(body).slice(0, 80));
    if (code) assert.equal(out.body.code, code);
    return out.body;
  };
  await bad("view", "not json", 400, "bad-request");
  await bad("view", { attempt: token, settings, extra: 1 }, 400, "bad-request");
  await bad("view", { attempt: token, settings: { p: 5, q: 0.2 } }, 400, "bad-request");
  await bad("view", { attempt: token, settings: { p: 0.4, q: 0.2, truth: 1 } }, 400, "bad-request");
  await bad("sample", { attempt: token, settings, state: { active: true, t: -2 } }, 400, "bad-request");
  await bad("trial", { attempt: token, settings, chunk: 1001 }, 400, "bad-request");
  await bad("attempt", { experiment: "9702_x99_33-q9" }, 400, "bad-request");
  await bad("sample", { attempt: `${token}x`, settings }, 400, "attempt");
  await bad("sample", { attempt: A.signAttempt("another-secret".padEnd(40, "a"), { uid: UID, experiment: bridge, n: 1, issuedAt: 1 }), settings }, 400, "attempt");
  const pulley = (await asJson(await post("attempt", { experiment: "9702_m23_33-q1" }))).body;
  const refused = await bad("sample", { attempt: pulley.attempt, settings: { notch: "0.20", pulleyHeight: 0.2 } }, 422, "apparatus");
  assert.equal(refused.error, "Level the string before reading", "the apparatus's own reason, as the room always showed");
  const osc = (await asJson(await post("attempt", { experiment: "9702_m22_33-q2" }))).body;
  await bad("trial", { attempt: osc.attempt, settings: { configuration: "1", amplitude: 0.015 }, chunk: 31 }, 400, "bad-request");
  const chunk1 = await asJson(await post("trial", { attempt: osc.attempt, settings: { configuration: "1", amplitude: 0.015 }, chunk: 1 }));
  assert.equal(chunk1.body.track.first, 600, "chunk 1 starts at 20 s");

  // Someone else's token is refused, even with the switch on.
  globalThis.__labApi.user = user(["student"], OTHER);
  const theirs = await asJson(await post("sample", { attempt: token, settings }));
  assert.equal(theirs.status, 403);
  assert.equal(theirs.body.code, "attempt");

  // The rate limit.
  API.resetLabApiState();
  globalThis.__labApi.user = user();
  const limit = API.LAB_RATE_LIMITS.sample;
  let last;
  for (let i = 0; i <= limit; i++) last = await post("sample", { attempt: token, settings });
  assert.equal(last.status, 429, `request ${limit + 1} in a minute is refused`);
  assert.equal((await last.json()).code, "slow-down");
  assert.equal((await post("view", { attempt: token, settings })).status, 200, "each route has its own allowance");

  // A successful access check is reused briefly; a refusal never is.
  API.resetLabApiState();
  store({});
  globalThis.__labApi.user = user();
  assert.equal((await post("view", { attempt: token, settings })).status, 403);
  store(GRANTED(UID));
  assert.equal((await post("view", { attempt: token, settings })).status, 200, "switched on: works at once");
  const cached = store({}, { failRead: true });
  assert.equal((await post("view", { attempt: token, settings })).status, 200, "within 30 s the check is reused");
  assert.deepEqual(cached.log, []);
}

// --- the room's client against the real routes ----------------------------------------------------
{
  API.resetLabApiState();
  store({ ...GRANTED(UID) });
  globalThis.__labApi.user = user();
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, init) => { requests++; return routes[String(url).split("/").pop()].POST(new Request(`https://sjabrankamran.com${url}`, init)); };
  const { createExperiment } = await import("../public/lab/lab-room/adapters.mjs");
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  // An oscillator: the track plays with no request per frame.
  let e = await createExperiment("9702_m22_33-q2");
  assert.equal(e.family, "spring_network_oscillator");
  assert.equal(e.attemptNumber, 1);
  await e.start();
  const before = requests;
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(e.advance(1 / 60).dy);
  assert.ok(seen.size > 100, "the spring moves");
  assert.ok(requests - before <= 1, "no request per frame (at most the next chunk)");
  for (let i = 0; i < 60 * 25; i++) e.advance(1 / 60);
  await settle();
  e.advance(1 / 60);
  assert.ok(Number.isFinite(e.currentView().dy), "past 20 s the next chunk plays");
  assert.deepEqual(Object.keys(await e.sample()), ["d"]);
  const restView = await e.reset();
  assert.equal(e.active, false);
  assert.equal(typeof restView.dy, "number");

  // A setting the apparatus refuses is refused and not kept.
  e = await createExperiment("9702_m23_33-q1");
  await e.set("pulleyHeight", 0.2);
  await assert.rejects(e.sample(), /Level the string/);
  await assert.rejects(e.set("pulleyHeight", 9), /outside the range/);
  assert.equal(e.settings.pulleyHeight, 0.2, "a refused setting isn't kept");

  // RC discharge: the live voltmeter follows the track's meter readings.
  e = await createExperiment("9702_s22_34-q1");
  await e.start();
  for (let i = 0; i < 60; i++) e.advance(1 / 60);
  const live = e.liveReadings();
  assert.ok(Number.isFinite(live?.v), "a live voltmeter reading");
  for (let i = 0; i < 600; i++) e.advance(1 / 60);
  assert.ok(e.liveReadings().v < live.v, "and it falls as the capacitor discharges");

  // LED: live adjustments while running carry the light response over.
  e = await createExperiment("9702_w25_33-q2");
  await e.start();
  for (let i = 0; i < 90; i++) e.advance(1 / 60);
  const r0 = await e.sample();
  await e.set("length", 0.5);
  for (let i = 0; i < 90; i++) e.advance(1 / 60);
  await settle();
  const r1 = await e.sample();
  assert.ok(r1.r !== r0.r || r1.v !== r0.v, "the meters respond to the new wire length");
  assert.ok(e.liveReadings(), "live meters continue after the change");

  // A live adjustment of an untimed rig while it runs stays on screen (the
  // magnet's cantilever follows the rheostat, frame after frame).
  e = await createExperiment("9702_w22_34-q2");
  await e.set("rheostat", 8);
  await e.start();
  const low = e.advance(1 / 60).angle;
  await e.set("rheostat", 1);
  for (let i = 0; i < 30; i++) e.advance(1 / 60);
  assert.notEqual(e.currentView().angle, low, "the running view follows a live adjustment");
  await e.set("rheostat", 8);
  for (let i = 0; i < 30; i++) e.advance(1 / 60);
  assert.equal(e.currentView().angle, low, "and back");

  // A fresh attempt: a new apparatus.
  e = await createExperiment("9702_w22_33-q2");
  const n1 = e.attemptNumber;
  await e.fresh();
  assert.equal(e.attemptNumber, n1 + 1);
  globalThis.fetch = realFetch;
}

// --- public/lab carries no model code or hidden value -----------------------------------------------
{
  const LAB = join(ROOT, "public", "lab");
  const files = readdirSync(LAB, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => join(d.parentPath ?? d.path, d.name));
  const rel = (f) => relative(ROOT, f).replaceAll("\\", "/");
  const texts = files.filter((f) => /\.(?:mjs|js|json|html?|css)$/i.test(f));
  assert.ok(texts.length >= 10, "the lab is where the test expects it");
  for (const f of files) {
    assert.ok(!/\/(models|practicals)\//.test(rel(f)), `${rel(f)}: models and standalone pages are retired`);
    assert.ok(!/settings\.json$/.test(rel(f)), `${rel(f)}: the controls come from the server`);
  }
  const serverModels = readdirSync(join(ROOT, "src", "lib", "practical-lab", "models"));
  const factoryNames = serverModels.flatMap((name) => [...readFileSync(join(ROOT, "src", "lib", "practical-lab", "models", name), "utf8").matchAll(/export function (\w+)/g)].map((m) => m[1]));
  assert.ok(factoryNames.length >= 50);
  for (const f of texts) {
    const text = readFileSync(f, "utf8");
    const where = rel(f);
    assert.ok(!/\btruth\b/i.test(text), `${where} mentions truth`);
    assert.ok(!/\bmake[A-Z]\w*\s*\(/.test(text), `${where} calls a model factory`);
    assert.ok(!text.includes("seededRandom("), `${where} seeds random readings`);
    assert.ok(!text.includes("readInstrument("), `${where} makes instrument readings`);
    assert.ok(!text.includes("quantize("), `${where} quantises readings`);
    assert.ok(!/lab\/models\/|\.\.\/models\/|practicals\//.test(text), `${where} links to model code or a standalone page`);
    for (const name of factoryNames) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), `${where} names the model function ${name}`);
  }
  // The student guides carry no mark-scheme content (M3).
  const guides = JSON.parse(readFileSync(join(LAB, "content", "student-guides.json"), "utf8"));
  const msPhrase = /\bMS\b|mark scheme|criterion\b.*\d|\d\s*%|steeper|negative gradient|current falls|theta ?B ?> ?theta ?A|hide centroid|accepted by|uncertainty ?\d|negative y allowed/i;
  const walk = (v, path) => {
    if (typeof v === "string") { if (!path.endsWith("provenance.statement")) assert.ok(!msPhrase.test(v), `${path}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(guides, "student-guides");
  for (const g of guides.guides) {
    assert.ok(g.calculations.graph.comparisonPercent == null, `${g.id}: no comparison criterion`);
    assert.ok(!g.provenance?.sourcePages?.ms, `${g.id}: no mark-scheme page references`);
  }
  const teacher = JSON.parse(readFileSync(join(ROOT, "src", "content", "lab", "teacher-guides.json"), "utf8"));
  assert.match(teacher.markSchemeNote, /student guides/);
  assert.ok(teacher.guides.some((g) => /MS/.test(g.physics.uncertainty)), "the mark-scheme uncertainty text is kept for teachers");
  assert.ok(statSync(join(ROOT, "src", "lib", "practical-lab", "engine.mjs")).isFile());
}

console.log(`practical-lab engine tests passed (${summary.sweep}; ${summary.noise}; refused at starting settings: ${refusedAtStart.join(", ") || "none"})`);
