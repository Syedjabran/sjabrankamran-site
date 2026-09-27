/**
 * Per-attempt hidden values for the Practical Lab. SERVER-ONLY.
 *
 * Every attempt of a practical gets its own apparatus: each varied value is
 * `nominal × (1 + δ)`, where δ comes from HMAC-SHA256(LAB_SECRET,
 * uid|experiment|attempt number|parameter) mapped into that parameter's range.
 * The same attempt always gets the same values (reload-safe); another
 * attempt, student or practical gets different ones, so a class can't share
 * one answer.
 *
 * What varies is what a real bench would differ in and the student works out:
 * spring constants, resistivities, unknown resistances, densities, expansion
 * coefficients, drag/fit coefficients, friction, capacitance. What stays put:
 * physical constants (g, water and air density), values printed on the page
 * as apparatus facts (mass labels, the 0.80 m bridge wire, the 1.5 V cell,
 * marker positions), numerical settings, and lengths the room draws against a
 * fixed reference. Ranges are a few per cent to ±20%, chosen so every setting
 * that worked with the nominal values still works (test-practical-lab-engine
 * sweeps every practical's settings over many attempts to check).
 *
 * Three practicals get no varied value, only per-attempt reading noise:
 * interrupted_pendulum and interrupted_pendulum_fixed_length hide only g (a
 * constant, and the fixed length is drawn against a fixed reference), and
 * catenary_transverse_pendulum's chain length sets which support separations
 * give a valid sag, so varying it would move the practical's own range.
 */
import "server-only";
import { createHmac } from "node:crypto";

/** ±r as a fraction (0.1 = ±10%), or an explicit [low, high] fraction range. */
export type Spread = number | readonly [number, number];
/** [nominal value (the model's own default), spread]. */
export type Variation = readonly [number, Spread];

export const VARIATION: Readonly<Record<string, Readonly<Record<string, Variation>>>> = {
  static_spring_rod: { ks_N_per_m: [25, 0.1], mass_kg: [0.16, 0.08], C0_m: [0.02, 0.1] },
  gas_flow_hole: { S: [12, 0.1], pin: [0.0006, 0.05], nail: [0.0015, 0.05], d_eff_over_tool: [1, 0.05] },
  hydrostatic_u_tube: { rho_oil_kg_m3: [910, 0.04] },
  spring_network_oscillator: { ks_N_per_m: [25, 0.1], m1_kg: [0.15, 0.08], rho_clay_kg_m3: [1600, 0.08], gamma_s_inv: [0.06, 0.15] },
  rod_pulley_equilibrium: { M_kg: [0.05, 0.1] },
  lens_in_solution: { beta: [0.4, 0.1], f_air_cm: [5, 0.06] },
  compound_t_pendulum: { m_cross_kg: [0.05, 0.08], m_stem_kg: [0.05, 0.08] },
  ladder_static_friction: { mu_s: [0.3, 0.1] },
  shorted_resistance_wire: { wire_r_ohm_m: [20, 0.08], Rseries_ohm: [18, 0.05], r_internal_ohm: [0.5, 0.2] },
  thermal_pipe_lever: { alpha_K_inv: [0.00015, 0.1], T0_C: [22, 0.08], tau_heat_s: [8, 0.15], tau_cool_s: [400, 0.15] },
  complementary_series_wires: { rA_ohm_m: [25, 0.08], rB_ohm_m: [10, 0.08] },
  spring_torsional_rod: { ks_N_m: [25, 0.1], Mrod_kg: [0.018, 0.1], gamma_s_inv: [0.04, 0.15] },
  catenary_transverse_pendulum: {},
  foam_ring_compression: { Kmat_N: [35, 0.12] },
  parallel_wire_voltage_divider: { r_ohm_m: [10, 0.08], Ry_ohm: [10, 0.05] },
  wrapping_mass_dynamics: { k_fit: [0.9, 0.1] },
  rc_discharge_parallel: { C_F: [47e-6, 0.1], RF_ohm: [220000, 0.05] },
  liquid_adhesion_drainage: { Fcap_N: [0.5, 0.1], gap_m: [0.00025, 0.08], oil_mu: [0.02, 0.1], nozzle_radius_m: [0.00065, 0.04] },
  cylinder_wrapped_pendulum: { radius_m: [0.04, 0.05] },
  lamina_centroid: { h_m: [0.06, 0.05] },
  counterweighted_compound_pendulum: { Mrod_kg: [0.026, 0.1], rod_COM_offset_m: [0.015, 0.15] },
  thermal_pipe_suspended_lever: { alpha_K_inv: [0.00015, 0.1], T0_C: [22, 0.08], thermal_tau_s: [8, 0.15] },
  loaded_rule_balance: { R_kg: [0.12, 0.08] },
  rubber_lateral_contraction: { w0_m: [0.005, 0.04], t0_m: [0.001, 0.05] },
  symmetric_movable_pulley: { pulley_mass_kg: [0.01, 0.2] },
  falling_mass_rotating_card: { tau_f_Nm: [2e-5, 0.15], I_spindle: [1e-7, 0.1], Cd: [1.2, 0.08], areal_density_kg_m2: [0.6, 0.08] },
  wire_shunt_equal_resistors: { r_ohm_m: [20, 0.08], R_ohm: [22, 0.05] },
  asymmetric_loaded_chain: { k_fit_s2_m: [4, 0.1], rho_clay: [1600, 0.08] },
  interrupted_pendulum: {},
  confined_ball_settling: { Cd: [0.8, 0.1], D_m: [0.006, 0.03] },
  parallel_resistor_network: { Z_ohm: [10, 0.1], E_V: [3, 0.03] },
  filter_paper_fall: { Cd: [1.2, 0.08], areal_density_kg_m2: [0.08, 0.05] },
  wire_bridge_null: { M_ohm: [220, 0.05], N_ohm: [100, 0.05], r_ohm_m: [15, 0.08] },
  suspended_rod_two_modes: { Lrod_m: [0.55, 0.03] },
  folded_wire_series_resistivity: { r_ohm_m: [15, 0.08], d_m: [0.000315, 0.04], R_ohm: [22, 0.05] },
  buoyancy_series_springs: { k1: [25, 0.1], k2: [25, 0.1], rho_oil: [910, 0.04], Lfree_m: [0.05, 0.1] },
  cylinder_step_stability: { radius_m: [0.03, 0.05] },
  magnet_coil_cantilever: { force_per_A_N_A: [0.006, 0.1], S_N_m: [0.4, 0.08] },
  interrupted_pendulum_fixed_length: {},
  inclined_rod_lift: { rho_wood: [600, 0.1] },
  meter_bridge_parallel_resistor: { P_ohm: [680, 0.05], Q_ohm: [1000, 0.05] },
  water_jet_ballistics: { Cv: [0.96, 0.03], Cd: [0.62, 0.08], hole_diameter_m: [0.0015, 0.05] },
  wire_voltage_divider_resistivity: { r_ohm_m: [20, 0.08], d_m: [0.00025, 0.04], R_ohm: [33, 0.05] },
  colliding_pendulum_balls: { e: [0.9, 0.05], eta: [1, [-0.06, 0]], mB_kg: [0.0035, 0.05] },
  syringe_nozzle_drainage: { Cd: [0.75, 0.08], nozzle_diameter_m: [0.002, 0.05] },
  magnetic_inelastic_pickup: { Mrod: [0.025, 0.1], M: [0.031, 0.05] },
  inclined_board_rolling_pendulum: { S: [0.4, 0.02] },
  led_ldr_photoresistance: { Vref: [1.9, 0.03], Rref: [800, 0.1], gamma: [0.75, 0.08], F: [33, 0.05], rwire: [20, 0.08] },
  spring_supported_variable_pivot_rod: { ks: [25, 0.1], Mrod: [0.04, 0.1], C0: [0.02, 0.1] },
  sphere_on_two_rails: { x_m: [0.016, 0.04] },
};

/** The fraction range [low, high] of a spread. */
export function spreadRange(spread: Spread): readonly [number, number] {
  return typeof spread === "number" ? [-spread, spread] : spread;
}

/** A uniform number in [0, 1) from HMAC(secret, message). */
function unit(secret: string, message: string): number {
  return createHmac("sha256", secret).update(message).digest().readUInt32LE(0) / 2 ** 32;
}

/**
 * The hidden parameter overrides for attempt `n` of `experiment` by `uid`,
 * as the model factory takes them. Rounded to six significant figures.
 */
export function attemptParams(secret: string, family: string, uid: string, experiment: string, n: number): Record<string, number> {
  const table = VARIATION[family];
  if (!table) throw new Error(`No parameter table for ${family}.`);
  const params: Record<string, number> = {};
  for (const [name, [nominal, spread]] of Object.entries(table)) {
    const [low, high] = spreadRange(spread);
    const u = unit(secret, `lab-param|${uid}|${experiment}|${n}|${name}`);
    params[name] = Number((nominal * (1 + low + (high - low) * u)).toPrecision(6));
  }
  return params;
}

/** The nominal values (every varied parameter at its model default). */
export function nominalParams(family: string): Record<string, number> {
  const table = VARIATION[family];
  if (!table) throw new Error(`No parameter table for ${family}.`);
  return Object.fromEntries(Object.entries(table).map(([name, [nominal]]) => [name, nominal]));
}
