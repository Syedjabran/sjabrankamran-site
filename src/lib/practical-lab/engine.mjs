// The Practical Lab's physics engine. SERVER-ONLY.
//
// A port of the lab room's old public/lab/lab-room/adapters.mjs: the same 50
// view cases and 50 reading cases over the same models, run on the server so
// the browser never receives a model, a hidden value or an ideal result. The
// room sends its settings and what it is doing (resting, running, time t); it
// gets back only what the apparatus looks like (quantised: `publicView`) and
// what an instrument shows (readings made by the models' own readInstrument).
//
// Every request builds a fresh model from the attempt's hidden parameters
// (params.ts) and draws its randomness from streams keyed by the attempt:
//   - apparatus draws (a contact offset, resistor tolerances) come from one
//     stream per attempt, so the apparatus is the same on every request;
//   - a reading's noise comes from a stream keyed by the settings, the switch
//     and run state and the frame time, so the same setting always gives the
//     same reading (like a real instrument, and averaging a thousand reads of
//     one setting gets nowhere), while a different setting or moment gives an
//     independent one -- with exactly the old noise model.
// Motion is precomputed as a track (frames at a fixed rate) that the room
// plays back, so the animation and the manual stopwatch need no per-frame
// network call.
import 'server-only';
import { createHmac } from 'node:crypto';
import { EXPERIMENTS } from './experiments.mjs';
import { inRandomScope, readInstrument, seededRandom } from './measurement.mjs';
import { makeAsymmetricChain } from './models/asymmetric_loaded_chain.mjs';
import { makeBuoyancySprings } from './models/buoyancy_series_springs.mjs';
import { makeCatenaryPendulum } from './models/catenary_transverse_pendulum.mjs';
import { makeCollidingBalls } from './models/colliding_pendulum_balls.mjs';
import { makeComplementarySeriesWires } from './models/complementary_series_wires.mjs';
import { makeCompoundTPendulum } from './models/compound_t_pendulum.mjs';
import { makeConfinedBall } from './models/confined_ball_settling.mjs';
import { makeCounterweightedPendulum } from './models/counterweighted_compound_pendulum.mjs';
import { makeCylinderStability } from './models/cylinder_step_stability.mjs';
import { makeCylinderWrappedPendulum } from './models/cylinder_wrapped_pendulum.mjs';
import { makeRotatingCard } from './models/falling_mass_rotating_card.mjs';
import { makeFilterPaperFall } from './models/filter_paper_fall.mjs';
import { makeFoamRingCompression } from './models/foam_ring_compression.mjs';
import { makeFoldedWire } from './models/folded_wire_series_resistivity.mjs';
import { makeGasFlowHole } from './models/gas_flow_hole.mjs';
import { makeHydrostaticUTube } from './models/hydrostatic_u_tube.mjs';
import { makeRollingPendulum } from './models/inclined_board_rolling_pendulum.mjs';
import { makeInclinedRodLift } from './models/inclined_rod_lift.mjs';
import { makeInterruptedPendulum } from './models/interrupted_pendulum.mjs';
import { makeFixedLengthInterruptedPendulum } from './models/interrupted_pendulum_fixed_length.mjs';
import { makeLadderStaticFriction } from './models/ladder_static_friction.mjs';
import { makeLaminaCentroid } from './models/lamina_centroid.mjs';
import { makePhotoresistance } from './models/led_ldr_photoresistance.mjs';
import { makeLensInSolution } from './models/lens_in_solution.mjs';
import { makeLiquidAdhesionDrainage } from './models/liquid_adhesion_drainage.mjs';
import { makeLoadedRuleBalance } from './models/loaded_rule_balance.mjs';
import { makeMagnetCantilever } from './models/magnet_coil_cantilever.mjs';
import { makeMagneticPickup } from './models/magnetic_inelastic_pickup.mjs';
import { makeParallelMeterBridge } from './models/meter_bridge_parallel_resistor.mjs';
import { makeParallelResistors } from './models/parallel_resistor_network.mjs';
import { makeParallelWireDivider } from './models/parallel_wire_voltage_divider.mjs';
import { makeRCDischarge } from './models/rc_discharge_parallel.mjs';
import { makeRodPulleyEquilibrium } from './models/rod_pulley_equilibrium.mjs';
import { makeRubberContraction } from './models/rubber_lateral_contraction.mjs';
import { makeShortedResistanceWire } from './models/shorted_resistance_wire.mjs';
import { makeRailSphere } from './models/sphere_on_two_rails.mjs';
import { makeSpringNetworkOscillator } from './models/spring_network_oscillator.mjs';
import { makeVariablePivotRod } from './models/spring_supported_variable_pivot_rod.mjs';
import { makeSpringTorsionalRod } from './models/spring_torsional_rod.mjs';
import { makeStaticSpringRod } from './models/static_spring_rod.mjs';
import { makeSuspendedRod } from './models/suspended_rod_two_modes.mjs';
import { makeSymmetricPulley } from './models/symmetric_movable_pulley.mjs';
import { makeSyringeDrainage } from './models/syringe_nozzle_drainage.mjs';
import { makeThermalPipeLever } from './models/thermal_pipe_lever.mjs';
import { makeSuspendedThermalLever } from './models/thermal_pipe_suspended_lever.mjs';
import { makeWaterJet } from './models/water_jet_ballistics.mjs';
import { makeWireBridge } from './models/wire_bridge_null.mjs';
import { makeWireShunt } from './models/wire_shunt_equal_resistors.mjs';
import { makeWireVoltageDivider } from './models/wire_voltage_divider_resistivity.mjs';
import { makeWrappingMassDynamics } from './models/wrapping_mass_dynamics.mjs';

const RAD = Math.PI / 180;

/** static_spring_rod's model takes its whole truth object: this is its own
 *  default, which the attempt's parameters override key by key. */
export const STATIC_SPRING_ROD_TRUTH = Object.freeze({ h_m: .25, C0_m: .02, ks_N_per_m: 25, mass_kg: .16, centre_m: .205 });

/** Each family's model, built from an attempt's parameter overrides. Every
 *  factory keeps its own default seed; the random scope makes the streams. */
const FACTORIES = Object.freeze({
  static_spring_rod: (p) => makeStaticSpringRod({ ...STATIC_SPRING_ROD_TRUTH, ...p }),
  gas_flow_hole: (p) => makeGasFlowHole(p),
  hydrostatic_u_tube: (p) => makeHydrostaticUTube(p),
  spring_network_oscillator: (p) => makeSpringNetworkOscillator(p),
  rod_pulley_equilibrium: (p) => makeRodPulleyEquilibrium(p),
  lens_in_solution: (p) => makeLensInSolution(p),
  compound_t_pendulum: (p) => makeCompoundTPendulum(p),
  ladder_static_friction: (p) => makeLadderStaticFriction(p),
  shorted_resistance_wire: (p) => makeShortedResistanceWire(p),
  thermal_pipe_lever: (p) => makeThermalPipeLever(p),
  complementary_series_wires: (p) => makeComplementarySeriesWires(p),
  spring_torsional_rod: (p) => makeSpringTorsionalRod(p),
  catenary_transverse_pendulum: (p) => makeCatenaryPendulum(p),
  foam_ring_compression: (p) => makeFoamRingCompression(p),
  parallel_wire_voltage_divider: (p) => makeParallelWireDivider(p),
  wrapping_mass_dynamics: (p) => makeWrappingMassDynamics(p),
  rc_discharge_parallel: (p) => makeRCDischarge(p),
  liquid_adhesion_drainage: (p) => makeLiquidAdhesionDrainage(p),
  cylinder_wrapped_pendulum: (p) => makeCylinderWrappedPendulum(p),
  lamina_centroid: (p) => makeLaminaCentroid(p),
  counterweighted_compound_pendulum: (p) => makeCounterweightedPendulum(p),
  thermal_pipe_suspended_lever: (p) => makeSuspendedThermalLever(p),
  loaded_rule_balance: (p) => makeLoadedRuleBalance(p),
  rubber_lateral_contraction: (p) => makeRubberContraction(p),
  symmetric_movable_pulley: (p) => makeSymmetricPulley(p),
  falling_mass_rotating_card: (p) => makeRotatingCard(p),
  wire_shunt_equal_resistors: (p) => makeWireShunt(p),
  asymmetric_loaded_chain: (p) => makeAsymmetricChain(p),
  interrupted_pendulum: (p) => makeInterruptedPendulum(p),
  confined_ball_settling: (p) => makeConfinedBall(p),
  parallel_resistor_network: (p) => makeParallelResistors(p),
  filter_paper_fall: (p) => makeFilterPaperFall(p),
  wire_bridge_null: (p) => makeWireBridge(p),
  suspended_rod_two_modes: (p) => makeSuspendedRod(p),
  folded_wire_series_resistivity: (p) => makeFoldedWire(p),
  buoyancy_series_springs: (p) => makeBuoyancySprings(p),
  cylinder_step_stability: (p) => makeCylinderStability(p),
  magnet_coil_cantilever: (p) => makeMagnetCantilever(p),
  interrupted_pendulum_fixed_length: (p) => makeFixedLengthInterruptedPendulum(p),
  inclined_rod_lift: (p) => makeInclinedRodLift(p),
  meter_bridge_parallel_resistor: (p) => makeParallelMeterBridge(p),
  water_jet_ballistics: (p) => makeWaterJet(p),
  wire_voltage_divider_resistivity: (p) => makeWireVoltageDivider(p),
  colliding_pendulum_balls: (p) => makeCollidingBalls(p),
  syringe_nozzle_drainage: (p) => makeSyringeDrainage(p),
  magnetic_inelastic_pickup: (p) => makeMagneticPickup(p),
  inclined_board_rolling_pendulum: (p) => makeRollingPendulum(p),
  led_ldr_photoresistance: (p) => makePhotoresistance(p),
  spring_supported_variable_pivot_rod: (p) => makeVariablePivotRod(p),
  sphere_on_two_rails: (p) => makeRailSphere(p),
});

export const FAMILIES = Object.freeze(Object.keys(FACTORIES));

/** A request the lab can't accept (unknown practical, bad settings or state):
 *  the routes answer 400 with the message. A model's own RangeError (a
 *  setting outside what the apparatus allows) is answered 422 instead. */
export class LabInputError extends Error {}

// --- timing ------------------------------------------------------------------

/** Families whose view or readings change with time while a trial runs; the
 *  others (static rigs and plain circuits) show one running state. */
const TIMED = new Set([
  'gas_flow_hole', 'spring_network_oscillator', 'compound_t_pendulum', 'thermal_pipe_lever', 'spring_torsional_rod',
  'catenary_transverse_pendulum', 'wrapping_mass_dynamics', 'rc_discharge_parallel', 'liquid_adhesion_drainage',
  'cylinder_wrapped_pendulum', 'counterweighted_compound_pendulum', 'thermal_pipe_suspended_lever',
  'falling_mass_rotating_card', 'asymmetric_loaded_chain', 'interrupted_pendulum', 'confined_ball_settling',
  'filter_paper_fall', 'suspended_rod_two_modes', 'water_jet_ballistics', 'colliding_pendulum_balls',
  'syringe_nozzle_drainage', 'magnetic_inelastic_pickup', 'inclined_board_rolling_pendulum',
  'led_ldr_photoresistance', 'sphere_on_two_rails', 'interrupted_pendulum_fixed_length',
]);
/** Families whose live meters (A, V, Ω, °C, cm³) change during a trial: the
 *  track carries their readings, which the room shows every 200 ms as it did
 *  when it sampled the model itself. */
const METERED = new Set([
  'rc_discharge_parallel', 'led_ldr_photoresistance', 'syringe_nozzle_drainage', 'liquid_adhesion_drainage',
  'thermal_pipe_lever', 'thermal_pipe_suspended_lever',
]);
const SLOW = new Set(['thermal_pipe_lever', 'thermal_pipe_suspended_lever']);

/** Frame rate, chunk length, the longest trial the lab plays and the meter
 *  interval for a family. Thermal practicals change over minutes, so they use
 *  2 frames a second (the room interpolates between frames). */
export function timingOf(family) {
  const timed = TIMED.has(family);
  const slow = SLOW.has(family);
  const fps = slow ? 2 : 30;
  return {
    timed,
    fps,
    chunkSeconds: slow ? 120 : 20,
    maxSeconds: slow ? 1800 : 600,
    meterSeconds: METERED.has(family) ? (slow ? 1 : 0.2) : null,
  };
}

// --- the public shape of a view ----------------------------------------------

/** The view fields the room draws, and how finely each is sent: lengths on
 *  the bench to about a pixel (0.5 px, or 0.5 mm for the metre-valued ones),
 *  angles to 0.1°, fill levels to 1/500. Anything else a view case computes
 *  (ideal image data, device state, sag, temperature...) never leaves. */
const VIEW_FIELDS = Object.freeze({
  kind: 'text', status: 'text',
  dx: .5, dy: .5, dx2: .5, dy2: .5, angle: .1,
  compression: .0005, scaleX: .001, scaleY: .001, fill: .002,
  left: .0005, right: .0005, topLeft: .0005, topRight: .0005, head: .0005, blur: .01,
  hit: 'flag', unstable: 'flag', powered: 'flag', jet: 'flag',
});

const snap = (value, step) => {
  const q = Math.round(value / step) * step;
  return Number(q.toFixed(Math.max(0, Math.ceil(-Math.log10(step)) + 1))) || 0;
};

export function publicView(view) {
  const out = {};
  for (const [key, rule] of Object.entries(VIEW_FIELDS)) {
    const value = view[key];
    if (value === undefined || value === null) continue;
    if (rule === 'text') { if (typeof value === 'string') out[key] = value; }
    else if (rule === 'flag') out[key] = Boolean(value);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = snap(value, rule);
  }
  return out;
}

// --- requests: experiments, settings, state -----------------------------------

export function experimentOf(id) {
  if (typeof id !== 'string' || !Object.hasOwn(EXPERIMENTS, id)) return null;
  const { family, controls } = EXPERIMENTS[id];
  return { id, family, controls };
}

export const EXPERIMENT_IDS = Object.freeze(Object.keys(EXPERIMENTS));

export function defaultSettings(id) {
  const experiment = experimentOf(id);
  if (!experiment) throw new LabInputError('That practical isn’t in the lab.');
  return Object.fromEntries(experiment.controls.map((c) => [c.key, c.value]));
}

/** The settings of a request: exactly the practical's controls, a range value
 *  snapped to its control's step (so a request can't ask for a finer setting
 *  than the apparatus offers, or re-roll a reading with a nudge), a select
 *  value one of its options. */
export function normaliseSettings(id, raw) {
  const experiment = experimentOf(id);
  if (!experiment) throw new LabInputError('That practical isn’t in the lab.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new LabInputError('The apparatus settings are missing.');
  const known = new Set(experiment.controls.map((c) => c.key));
  for (const key of Object.keys(raw)) if (!known.has(key)) throw new LabInputError('The apparatus settings don’t match this practical.');
  const settings = {};
  for (const c of experiment.controls) {
    const value = raw[c.key];
    if (c.type === 'range') {
      const v = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(v) || v < c.min - c.step / 2 || v > c.max + c.step / 2) {
        throw new LabInputError('That setting is outside the range the apparatus allows.');
      }
      const steps = Math.round((v - c.min) / c.step);
      settings[c.key] = Math.min(c.max, Math.max(c.min, Number((c.min + steps * c.step).toPrecision(12))));
    } else {
      const option = c.options.find((o) => String(o.value) === String(value));
      if (!option) throw new LabInputError('Choose one of the listed options for each setting.');
      settings[c.key] = option.value;
    }
  }
  return settings;
}

const settingsKey = (experiment, settings) => experiment.controls.map((c) => `${c.key}=${settings[c.key]}`).join('&');

/** What the room is doing: `active` (a trial started), `closed` (switch
 *  closed / apparatus released), `t` (seconds into the trial), `run` (which
 *  release this is) and, for the LED practical only, `history`: when each
 *  live setting change happened in this trial (its light response carries
 *  over between settings). */
export function normaliseState(id, raw = {}) {
  const experiment = experimentOf(id);
  if (!experiment) throw new LabInputError('That practical isn’t in the lab.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new LabInputError('The trial state is missing.');
  const timing = timingOf(experiment.family);
  const active = raw.active === true;
  const closed = active && raw.closed !== false;
  const t = raw.t === undefined ? 0 : Number(raw.t);
  if (!Number.isFinite(t) || t < 0) throw new LabInputError('The trial time must be zero or more seconds.');
  const run = raw.run === undefined ? 0 : Number(raw.run);
  if (!Number.isInteger(run) || run < 0 || run > 1e6) throw new LabInputError('The trial number isn’t valid.');
  let history = null;
  if (experiment.family === 'led_ldr_photoresistance' && active && raw.history !== undefined) {
    if (!Array.isArray(raw.history) || raw.history.length > 32) throw new LabInputError('The trial history isn’t valid.');
    let last = 0;
    history = raw.history.map((entry, i) => {
      const at = Number(entry?.t);
      if (!Number.isFinite(at) || at < last || (i === 0 && at !== 0)) throw new LabInputError('The trial history isn’t valid.');
      last = at;
      return { t: at, settings: normaliseSettings(id, entry?.settings) };
    });
  }
  return { active, closed, t: active ? Math.min(t, timing.maxSeconds) : 0, run, history };
}

// --- random streams ------------------------------------------------------------

/** A 32-bit stream key for `purpose` under an attempt's key (bytes or hex). */
export function streamKey(attemptKey, purpose) {
  return createHmac('sha256', attemptKey).update(`lab-stream|${purpose}`).digest().readUInt32LE(0);
}

// --- a session: the old adapter, one request at a time ------------------------

function createSession({ experiment, params = {}, attemptKey, settings, history = null }) {
  const { family } = experiment;
  const factory = FACTORIES[family];
  if (!factory) throw new LabInputError('That practical isn’t in the lab.');
  const { fps } = timingOf(family);
  const frameSeconds = 1 / fps;
  const scope = { key: streamKey(attemptKey, 'apparatus') };
  const inScope = (fn) => inRandomScope(scope, fn);
  const model = inScope(() => factory(params));
  // The room's own instrument draws (adapters.mjs used seededRandom(970234)).
  const random = inScope(() => seededRandom(970234));
  const key = settingsKey(experiment, settings);
  const viewKey = streamKey(attemptKey, `view|${key}`);
  let frame = 0, active = false, closed = false, motion = null;
  const elapsed = () => frame * frameSeconds;
  const n = (k, fallback = 0) => Number(settings[k] ?? fallback), s = (k, fallback = '') => String(settings[k] ?? fallback);
  const pendulum = (angle, length = .35) => ({ kind: 'swing', angle, dx: length * Math.sin(angle * RAD) * 650, dy: length * (1 - Math.cos(angle * RAD)) * -650 });
  const cylinderVolume = (volume) => ({ kind: 'liquid', fill: Math.max(0, Math.min(1, volume)), volume });
  // LED: the settings in force for the frame ending at time t. A live change
  // made at time c applies from the first frame that ends after c, as it did
  // when the room advanced the model itself frame by frame.
  const ledSettingsAt = (t) => {
    let current = history?.[0]?.settings ?? settings;
    for (const entry of history ?? []) if (entry.t < t - 1e-9) current = entry.settings;
    return current;
  };

  function start(run) {
    frame = 0; active = true; closed = true;
    scope.key = streamKey(attemptKey, `trial|${key}|${run % 5}`);
    inScope(() => {
      switch (family) {
        case 'compound_t_pendulum': motion = model.createMotion(n('position'), n('amplitude')); break;
        case 'counterweighted_compound_pendulum': motion = model.createMotion(n('mass'), n('amplitude')); break;
        case 'falling_mass_rotating_card': motion = model.createMotion(s('card')); break;
        case 'colliding_pendulum_balls': motion = model.createMotion(Boolean(settings.added), s('alignment')); break;
        case 'magnetic_inelastic_pickup': motion = model.createMotion(n('nut')); break;
        case 'wrapping_mass_dynamics': motion = model.trial(n('theta')); break;
        case 'led_ldr_photoresistance': motion = model.createResponse(); break;
      }
    });
  }
  /** One frame forward, as the room's advance(dt) did for a frame. */
  function stepFrame() {
    frame += 1;
    if (!motion) return;
    inScope(() => {
      if (family === 'led_ldr_photoresistance') {
        const at = ledSettingsAt(elapsed());
        motion.advance(frameSeconds, Number(at.length ?? 0), .03, Number(at.angle ?? 0), closed);
      } else if (motion.advance) motion.advance(frameSeconds);
    });
  }
  function advanceTo(t) {
    const target = Math.round(t * fps);
    if (!motion) { frame = Math.max(frame, target); return; }
    while (frame < target) stepFrame();
  }

  function view() {
    return inScope(() => {
      scope.key = viewKey;
      const t = active ? elapsed() : 0;
      let v;
      switch (family) {
        case 'static_spring_rod': v = { kind: 'lever', angle: model.tiltDegrees(n('str') / 1000), extension: model.extension(n('x')), status: Math.abs(n('str')) < 1 ? 'Rod horizontal. Read both ruler marks.' : 'Adjust the string until the rod is horizontal.' }; break;
        case 'gas_flow_hole': v = { ...cylinderVolume(active ? 1 - model.interfacePosition(s('tool'), t) / 1.2 : 1), status: 'Time the interface between the two marks; do not use the fill level as a digital reading.' }; break;
        case 'hydrostatic_u_tube': { const q = model.geometry(n('height')); v = { kind: 'utube', left: q.a_m, right: q.b_m, topLeft: q.surfaceA_m, topRight: q.surfaceB_m, oil: n('height'), status: 'Read the two water–oil interfaces, not the top oil surfaces.' }; break; }
        case 'spring_network_oscillator': v = { kind: 'spring', dy: model.displacement(n('configuration'), n('configuration') === 1 ? 1 : .75, n('amplitude'), t) * 1800, status: 'Count complete oscillations and operate your own stopwatch.' }; break;
        case 'rod_pulley_equilibrium': v = { kind: 'lever', angle: model.equilibrium(n('notch')).theta_deg - 90, status: model.alignment(n('notch'), n('pulleyHeight')) }; break;
        case 'lens_in_solution': v = { kind: 'optics', ...model.image(n('solution'), n('object'), n('screenDistance')), status: 'Slide the torch and screen to obtain the sharpest image.' }; break;
        case 'compound_t_pendulum': v = pendulum((motion ?? model.createMotion(n('position'), n('amplitude'))).snapshot().angle_deg); break;
        case 'ladder_static_friction': { const q = model.trial(s('strip'), s('end'), n('base')); v = { kind: 'lever', angle: active && !q.stable ? 0 : -q.theta_deg, status: q.stable ? 'Strip remains supported.' : 'Strip slips: restore support before reading an angle.', unstable: active && !q.stable }; break; }
        case 'shorted_resistance_wire': v = { kind: 'circuit', powered: closed }; break;
        case 'thermal_pipe_lever': { const q = model.state(n('length'), n('water'), t); v = { kind: 'thermal', angle: active ? (q.pointer_m - .22) * 1800 : 0, temperature: active ? q.water_C : 22, status: 'Observe the lowest pointer position before taking the hot reading.' }; break; }
        case 'complementary_series_wires': v = { kind: 'circuit', powered: closed, status: Math.abs(n('g') - n('h')) <= .002 ? 'Contacts aligned.' : 'Align the two contacts to the same wire coordinate.' }; break;
        case 'spring_torsional_rod': v = { kind: 'lever', angle: active ? model.angle(n('b'), n('amplitude'), t) : model.levelError(n('level')), status: 'Level the loaded strip before releasing a small twist.' }; break;
        case 'catenary_transverse_pendulum': v = { kind: 'chain', dx: active ? model.angle(n('separation'), n('amplitude'), t) * 5 : 0, sag: model.configuration(n('separation')).C_m, status: 'Observe transverse motion; keep both supports at equal height.' }; break;
        case 'foam_ring_compression': v = { kind: 'compression', compression: model.geometry(s('ring'), active).compression_m, status: active ? 'Load applied. Read compressed height.' : 'Read unloaded dimensions before adding the load.' }; break;
        case 'parallel_wire_voltage_divider': v = { kind: 'circuit', powered: closed }; break;
        case 'wrapping_mass_dynamics': v = { kind: 'fall', dy: active ? motion.state(t).fall_m * 750 : 0, status: 'Provisional endpoint surrogate: the wrapping transient is illustrative, not validated contact dynamics.' }; break;
        case 'rc_discharge_parallel': v = { kind: 'circuit', powered: closed, charge: active ? model.voltage(n('resistor'), t) / 6 : 1, status: 'Switch starts discharge. Independently start/stop the watch while reading voltage.' }; break;
        case 'liquid_adhesion_drainage': v = { ...cylinderVolume(active ? model.volume(s('liquid'), t) / 11 : 1), status: 'Time the marked drainage interval; force is measured separately with a slow pull.' }; break;
        case 'cylinder_wrapped_pendulum': v = pendulum(model.angle(n('length'), n('amplitude'), t), n('length')); break;
        case 'lamina_centroid': v = { kind: 'card', angle: model.suspension(n('width'), n('hole')).angle / RAD, status: 'Suspend from each hole and mark plumb lines. Find their intersection yourself.' }; break;
        case 'counterweighted_compound_pendulum': v = pendulum((motion ?? model.createMotion(n('mass'), n('amplitude'))).snapshot().angle_deg); break;
        case 'thermal_pipe_suspended_lever': { const q = model.state(n('length'), n('temperature', 82), t); v = { kind: 'thermal', angle: active ? (q.pointer_m - .3) * 1800 : 0, temperature: active ? q.pipe_C : 22, status: 'Wait for the tube and water to approach thermal equilibrium.' }; break; }
        case 'loaded_rule_balance': { const q = model.settled(n('n'), n('arm', .475), n('pivot')); v = { kind: 'lever', angle: active ? q.tilt_deg : 0, status: q.balanced ? 'Rule balances.' : 'Move the knife edge to balance the rule.', balanced: q.balanced }; break; }
        case 'rubber_lateral_contraction': { model.ideal(n('ratio')); v = { kind: 'stretch', scaleY: n('ratio'), scaleX: 1 / Math.sqrt(n('ratio')), status: 'Use light micrometer contact to avoid compressing the rubber.' }; break; }
        case 'symmetric_movable_pulley': v = { kind: 'pulley', dy: model.ideal(n('mass')).sag_m * 700, status: 'Keep the pulley axes in one plane and read the angle from the vertical.' }; break;
        case 'falling_mass_rotating_card': { const q = (motion ?? model.createMotion(s('card'))).snapshot(); v = { kind: 'spin-fall', dy: q.fraction * 260, angle: q.angle_rad / RAD, status: q.landed ? 'Mass has landed; stop the watch yourself.' : 'Wind up, release and observe the falling mass and rotating card.' }; break; }
        case 'wire_shunt_equal_resistors': v = { kind: 'circuit', powered: closed }; break;
        case 'asymmetric_loaded_chain': v = { kind: 'chain', dx: active ? model.angle(n('condition'), t) * 6 : 0, status: 'Keep the clay at the source-specified clip for the selected condition.' }; break;
        case 'interrupted_pendulum': { const q = model.motion(n('length') + .33, n('length'), n('amplitude'), t); v = { kind: 'swing', angle: q.angle_deg, dx: q.bob_x_m * 650, dy: (q.bob_y_m - (n('length') + .33)) * 650, status: `Bob on ${q.side} arc. One cycle includes both sides.` }; break; }
        case 'confined_ball_settling': v = { kind: 'fall', dy: active ? Math.min(290, model.state(n('diameter'), t).z_m * 360) : 0, status: 'Start and stop as the ball crosses the timing marks.' }; break;
        case 'parallel_resistor_network': v = { kind: 'circuit', powered: closed }; break;
        case 'filter_paper_fall': { const q = model.state(n('stack') === 0 ? 6 : 2, n('stack') === 0 ? .11 : .18, t, n('tilt')); v = { kind: 'fall', dy: active ? q.fraction * 310 : 0, status: q.landed ? 'Stack landed.' : 'Release the horizontal paper stack without a push.' }; break; }
        case 'wire_bridge_null': case 'meter_bridge_parallel_resistor': v = { kind: 'circuit', powered: closed, status: 'Slide the jockey and bracket the detector zero; do not assume a preset null.' }; break;
        case 'suspended_rod_two_modes': { const q = model.shape(n('depth'), s('mode'), t); v = { kind: 'lever', angle: s('mode') === 'S' ? q.angle_deg : 0, dx: q.centre[2] * 1300, status: `Observe ${s('mode') === 'S' ? 'rocking' : 'parallel translation'}; time full cycles.` }; break; }
        case 'folded_wire_series_resistivity': case 'wire_voltage_divider_resistivity': v = { kind: 'circuit', powered: closed }; break;
        case 'buoyancy_series_springs': v = { kind: 'spring', dy: (model.length(s('load'), s('medium') === 'oil') - .15) * 600, status: 'Keep the immersed nut clear of the vessel walls and bottom.' }; break;
        case 'cylinder_step_stability': v = { kind: 'incline', angle: -Math.asin(n('height') / .35) / RAD, unstable: !model.stable(n('pileT'), n('height')), status: model.stable(n('pileT'), n('height')) ? 'Cylinder remains stable.' : 'Toppling boundary reached; reset for another trial.' }; break;
        case 'magnet_coil_cantilever': { const I = model.current(n('rheostat'), closed); v = { kind: 'lever', angle: (model.height(true, I, n('polarity')) - .4) * 700, powered: closed, status: I > .75 ? 'Increase the rheostat resistance: outside the model range.' : 'Observe cantilever deflection as current changes.' }; break; }
        case 'interrupted_pendulum_fixed_length': { const q = model.motion(n('separation'), n('amplitude'), t); v = { kind: 'swing', angle: q.angle_deg, dx: q.bob_x_m * 650, dy: (q.bob_y_m - .53) * 650, status: `Bob on ${q.side} arc.` }; break; }
        case 'inclined_rod_lift': { const q = model.state(n('distance'), n('force')); v = { kind: 'lever', angle: q.lifted ? -40 : -36, status: q.lifted ? 'Rod has just lost contact. Read the newton meter.' : 'Increase the upward pull slowly.' }; break; }
        case 'water_jet_ballistics': v = { kind: 'jet', head: model.head(t), fill: active ? model.head(t) / .12 : 1, jet: active, status: 'Watch the falling jet reach the target rod; mark the water head at that instant.' }; break;
        case 'colliding_pendulum_balls': { const q = (motion ?? model.createMotion(Boolean(settings.added), s('alignment'))).snapshot(); v = { kind: 'collision', dx: Math.sin(q.a_angle_rad) * 280, dy: (Math.cos(q.a_angle_rad) - 1) * 280, dx2: Math.sin(q.b_angle_rad) * 280, dy2: (Math.cos(q.b_angle_rad) - 1) * 280, hit: q.hit, status: q.hit ? 'Observe the first maximum of the second ball.' : 'Release the striker without a push.' }; break; }
        case 'syringe_nozzle_drainage': v = { ...cylinderVolume(model.volume(n('top') + 2.5, t) / 52.5), status: 'Time the meniscus between marks separated by 5 cm³.' }; break;
        case 'magnetic_inelastic_pickup': { const q = (motion ?? model.createMotion(n('nut'))).snapshot(); v = { kind: 'pickup', angle: q.angle_rad / RAD, dx: q.x_m * 650, dy: (Math.cos(q.angle_rad) - 1) * 312, hit: q.hit, status: q.hit ? 'Nut captured; observe the first return excursion.' : 'Release the magnet toward the stationary nut.' }; break; }
        case 'inclined_board_rolling_pendulum': { const q = model.motion(n('height'), t); v = { kind: 'swing', dx: q.x_m * 650, dy: (q.y_m - .375) * 650, angle: q.spin_rad / RAD, status: 'The bob rolls on the inclined board; time full cycles.' }; break; }
        case 'led_ldr_photoresistance': v = { kind: 'circuit', powered: closed, status: 'LED and ohmmeter use separate circuits. Allow the light response to settle.' }; break;
        case 'spring_supported_variable_pivot_rod': { const q = model.state(n('hole'), n('height')); v = { kind: 'lever', angle: -q.angle_rad / RAD, extension: q.L_m, status: q.level ? 'Rod horizontal. Read the spring length.' : 'Adjust the upper nail to bring the rod horizontal.' }; break; }
        case 'sphere_on_two_rails': { const q = model.motion(n('sphere'), n('height'), t); v = { kind: 'roll', dx: active ? q.fraction * 330 : 0, dy: active ? q.fraction * n('height') * 3500 : 0, angle: q.spin_rad / RAD, status: q.arrived ? 'Sphere reached the end. Stop your watch.' : 'Start your stopwatch and release the sphere.' }; break; }
        default: throw new Error(`Missing view case: ${family}`);
      }
      return publicView(v);
    });
  }

  function sample() {
    return inScope(() => {
      scope.key = streamKey(attemptKey, `read|${key}|${closed ? 1 : 0}|${active ? 1 : 0}|${frame}`);
      const t = elapsed();
      let r = {};
      switch (family) {
        case 'static_spring_rod': r = { x: readInstrument(n('x'), { resolution: .001, halfWidth: .001 }, random), c0: readInstrument(params.C0_m ?? STATIC_SPRING_ROD_TRUTH.C0_m, { resolution: .001, halfWidth: .001 }, random), c: readInstrument(model.springMark(n('x')), { resolution: .001, halfWidth: .001 }, random) }; break;
        case 'gas_flow_hole': r = model.readDimensions(s('tool')); break;
        case 'hydrostatic_u_tube': r = model.readColumns(n('height')); break;
        case 'spring_network_oscillator': r = { d: model.readDiameter(n('configuration') === 1 ? 1 : .75) }; break;
        case 'rod_pulley_equilibrium': r = model.read(n('notch'), n('pulleyHeight')); break;
        case 'lens_in_solution': r = model.read(n('solution'), n('object'), n('screenDistance')); break;
        case 'compound_t_pendulum': r = { x: model.readPosition(n('position')) }; break;
        case 'ladder_static_friction': r = { ...model.readSetup(s('strip')), theta: model.readAngle(s('strip'), s('end'), n('base')) }; break;
        case 'shorted_resistance_wire': r = model.read(n('length'), closed); break;
        case 'thermal_pipe_lever': r = { ...model.readCold(n('length')), ...(active ? model.readHot(n('length'), n('water'), t) : {}) }; break;
        case 'complementary_series_wires': if (Math.abs(n('g') - n('h')) > .002) throw new RangeError('Align G and H before taking current readings.'); r = model.read(n('g'), closed); break;
        case 'spring_torsional_rod': r = model.readGeometry(n('b')); break;
        case 'catenary_transverse_pendulum': r = model.readGeometry(n('separation')); break;
        case 'foam_ring_compression': r = { ...model.readInitial(s('ring')), ...(active ? model.readLoaded(s('ring')) : {}) }; break;
        case 'parallel_wire_voltage_divider': r = model.read(n('d'), closed); break;
        case 'wrapping_mass_dynamics': if (!active || !motion.state(t).finished) throw new RangeError('Wait for the winding to stop before reading the height.'); r = motion.read(t); break;
        case 'rc_discharge_parallel': r = { v: model.readVoltage(n('resistor'), active ? t : 0) }; break;
        case 'liquid_adhesion_drainage': r = { w: model.readWeight(), f: model.readPeak(s('liquid'), n('speed')), volume: model.readVolume(s('liquid'), t) }; break;
        case 'cylinder_wrapped_pendulum': r = { l: model.readLength(n('length')) }; break;
        case 'lamina_centroid': r = model.readDimensions(n('width')); break;
        case 'counterweighted_compound_pendulum': r = { mass: model.readMass(n('mass')) }; break;
        case 'thermal_pipe_suspended_lever': r = { ...model.readCold(n('length')), ...(active ? model.readHot(n('length'), n('temperature', 82), t) : {}) }; break;
        case 'loaded_rule_balance': r = model.read(n('n'), n('arm', .475), n('pivot')); break;
        case 'rubber_lateral_contraction': r = { ...model.readRelaxed(s('pressure')), ...model.readStretched(n('ratio'), s('pressure')) }; break;
        case 'symmetric_movable_pulley': r = model.read(n('mass')); break;
        case 'falling_mass_rotating_card': if (s('card') !== 'none') r = model.readDimensions(s('card')); break;
        case 'wire_shunt_equal_resistors': r = { e: model.readSupply(), l: model.readLength(n('length')), v: model.readVoltage(n('length'), closed) }; break;
        case 'asymmetric_loaded_chain': r = model.readGeometry(n('condition')); break;
        case 'interrupted_pendulum': r = model.readLengths(n('length') + .33, n('length')); break;
        case 'confined_ball_settling': r = model.readDiameters(n('diameter')); break;
        case 'parallel_resistor_network': r = { i: model.readCurrent(n('r1'), n('r2'), closed) }; break;
        case 'filter_paper_fall': r = model.readStack(n('stack') === 0 ? 6 : 2, n('stack') === 0 ? .11 : .18); break;
        case 'wire_bridge_null': r = { ...model.readLengths(n('p'), n('q')), v: model.readVoltage(n('p'), n('q'), closed) }; break;
        case 'suspended_rod_two_modes': r = model.readGeometry(n('depth')); break;
        case 'folded_wire_series_resistivity': r = { e: model.readSupply(), d: model.readDiameter(), x: model.readLength(n('x')), v: model.readVoltage(n('x'), closed) }; break;
        case 'buoyancy_series_springs': r = { l: model.readLength(s('load'), s('medium') === 'oil'), ...(['M12', 'M16'].includes(s('load')) ? { m: model.readMass(s('load')) } : {}) }; break;
        case 'cylinder_step_stability': r = { ...model.readSetup(n('pileT')), z: model.readHeight(n('height')) }; break;
        case 'magnet_coil_cantilever': r = { i: model.readCurrent(n('rheostat'), closed), h: model.readHeight(true, model.current(n('rheostat'), closed), n('polarity')), m: model.readMassLabel() }; break;
        case 'interrupted_pendulum_fixed_length': r = model.readLengths(n('separation')); break;
        case 'inclined_rod_lift': r = { ...model.readDimensions(n('distance')), f: model.readForce(n('force')) }; break;
        case 'meter_bridge_parallel_resistor': r = { ...model.readLengths(n('resistor'), n('a')), v: model.readVoltage(n('resistor'), n('a'), closed) }; break;
        case 'water_jet_ballistics': r = { ...model.readGeometry(n('base')), h: model.readHead(t) }; break;
        case 'wire_voltage_divider_resistivity': r = { l: model.readLength(n('length')), d: model.readDiameter(), v: model.readVoltage(n('length'), closed) }; break;
        case 'colliding_pendulum_balls': r = { ...model.readSetup(), ...(motion?.snapshot().hit ? { h: model.readHeight(motion.snapshot().b_height_m) } : {}) }; break;
        case 'syringe_nozzle_drainage': r = { ...model.readHeights(n('top')), volume: readInstrument(model.volume(n('top') + 2.5, t), { resolution: .5 }, random) }; break;
        case 'magnetic_inelastic_pickup': r = { ...model.readSetup(n('nut')), ...(motion?.snapshot().hit && motion.snapshot().x_m >= 0 ? { x: model.readX(motion.snapshot().x_m) } : {}) }; break;
        case 'inclined_board_rolling_pendulum': r = model.readLengths(n('height')); break;
        case 'led_ldr_photoresistance': { const device = motion ?? model.createResponse(); r = { ...model.readGeometry(n('length')), ...model.readMeters(device.advance(0, n('length'), .03, n('angle'), closed)) }; break; }
        case 'spring_supported_variable_pivot_rod': r = model.read(n('hole'), n('height')); break;
        case 'sphere_on_two_rails': r = model.readGeometry(n('sphere'), n('height')); break;
        default: throw new Error(`Missing readings case: ${family}`);
      }
      return Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
    });
  }

  return {
    start, stepFrame, advanceTo, view, sample,
    openSwitch() { closed = false; },
    get frame() { return frame; },
  };
}

// --- what the routes call -------------------------------------------------------

function sessionFor({ id, params, attemptKey, settings, state }) {
  const experiment = experimentOf(id);
  if (!experiment) throw new LabInputError('That practical isn’t in the lab.');
  const session = createSession({ experiment, params, attemptKey, settings, history: state?.history ?? null });
  if (state?.active) {
    session.start(state.run ?? 0);
    session.advanceTo(state.t ?? 0);
    if (state.closed === false) session.openSwitch();
  }
  return session;
}

/** What the apparatus looks like for `settings` in `state` (resting when
 *  state is omitted). */
export function viewAt({ id, params, attemptKey, settings, state }) {
  return sessionFor({ id, params, attemptKey, settings, state }).view();
}

/** What the instruments show for `settings` in `state`. */
export function sampleAt({ id, params, attemptKey, settings, state }) {
  return sessionFor({ id, params, attemptKey, settings, state }).sample();
}

/**
 * Run-length/columnar encoding of a chunk's frames: a key whose value never
 * changes is sent once (`constant`), a numeric key as one array (`series`),
 * anything else (status text, flags) as [frame, value] change points
 * (`steps`).
 */
export function encodeFrames(frames) {
  const keys = [...new Set(frames.flatMap((f) => Object.keys(f)))];
  const constant = {}, series = {}, steps = {};
  for (const k of keys) {
    const values = frames.map((f) => (f[k] === undefined ? null : f[k]));
    if (values.every((v) => v === values[0])) constant[k] = values[0];
    else if (values.every((v) => typeof v === 'number')) series[k] = values;
    else {
      const changes = [];
      values.forEach((v, i) => { if (i === 0 || v !== values[i - 1]) changes.push([i, v]); });
      steps[k] = changes;
    }
  }
  return { count: frames.length, constant, series, steps };
}

/**
 * One chunk of a trial's track: the frames of seconds
 * [chunk × chunkSeconds, (chunk + 1) × chunkSeconds), and for the metered
 * families the live meter readings on the same timeline. An untimed family's
 * track is its single running view. `done` means there is nothing after this
 * chunk (the room holds the last frame).
 */
export function trackChunk({ id, params, attemptKey, settings, state, chunk = 0 }) {
  const experiment = experimentOf(id);
  if (!experiment) throw new LabInputError('That practical isn’t in the lab.');
  if (!Number.isInteger(chunk) || chunk < 0) throw new LabInputError('That part of the trial isn’t valid.');
  const timing = timingOf(experiment.family);
  const running = { active: true, closed: true, t: 0, run: state?.run ?? 0, history: state?.history ?? null };
  const session = createSession({ experiment, params, attemptKey, settings, history: running.history });
  session.start(running.run);
  if (!timing.timed) {
    return { chunk: 0, fps: timing.fps, first: 0, frames: encodeFrames([session.view()]), meters: null, done: true };
  }
  const perChunk = timing.fps * timing.chunkSeconds;
  const last = timing.maxSeconds * timing.fps;
  const first = chunk * perChunk;
  if (first > last) throw new LabInputError('That part of the trial is past its end.');
  session.advanceTo(first / timing.fps);
  const meterEvery = timing.meterSeconds ? Math.round(timing.meterSeconds * timing.fps) : 0;
  const frames = [], meters = [];
  for (let g = first; g < first + perChunk && g <= last; g++) {
    if (g > first) session.stepFrame();
    frames.push(session.view());
    if (meterEvery && g % meterEvery === 0) {
      let readings = null;
      try { readings = session.sample(); } catch (error) { if (!(error instanceof RangeError)) throw error; }
      meters.push([g, readings]);
    }
  }
  return {
    chunk, fps: timing.fps, first, frames: encodeFrames(frames),
    meters: meterEvery ? { every: meterEvery, readings: meters } : null,
    done: first + perChunk > last,
  };
}
