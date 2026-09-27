// The 50 Practical Lab experiments: each practical id, its physics model family
// and the student controls the lab room offers (moved from
// public/lab/lab-room/settings.json). SERVER-ONLY: the lab API validates every
// request against these controls and sends them to the room when an attempt
// starts, so the browser needs no copy.
//
// 9702_w23_33-q1 listed "interrupted_pendulum" in settings.json; the room always
// ran it on the fixed-length variant (adapters.mjs), which is written here directly.
export const EXPERIMENTS = Object.freeze({
  "9702_m21_33-q1": { family: "static_spring_rod", controls: [
    {"key":"x","type":"range","label":"Loop position x =  m","value":0.245,"min":0.145,"max":0.32,"step":0.025},
    {"key":"str","type":"range","label":"String length adjust (level the rod first) =  mm","value":0,"min":-30,"max":30,"step":1},
  ] },
  "9702_m21_33-q2": { family: "gas_flow_hole", controls: [
    {"key":"tool","type":"select","label":"Piercing tool","value":"pin","options":[{"value":"pin","label":"Pin (approximately 0.6 mm)"},{"value":"nail","label":"Nail (approximately 1.5 mm)"}]},
  ] },
  "9702_m22_33-q1": { family: "hydrostatic_u_tube", controls: [
    {"key":"height","type":"range","label":"Target oil B column h / m (pipette setting, not a ruler reading)","value":0.03,"min":0.03,"max":0.2,"step":0.005},
  ] },
  "9702_m22_33-q2": { family: "spring_network_oscillator", controls: [
    {"key":"configuration","type":"select","label":"Cut/shape and attach clay","value":"1","options":[{"value":"1","label":"n = 1, whole clay"},{"value":"2","label":"n = 2, three-quarter clay"}]},
    {"key":"amplitude","type":"range","label":"Release displacement / m (adapted control)","value":0.015,"min":0,"max":0.02,"step":0.001},
  ] },
  "9702_m23_33-q1": { family: "rod_pulley_equilibrium", controls: [
    {"key":"notch","type":"select","label":"Notch distance from pivot / m","value":"0.20","options":[{"value":"0.04","label":"0.04"},{"value":"0.08","label":"0.08"},{"value":"0.12","label":"0.12"},{"value":"0.16","label":"0.16"},{"value":"0.20","label":"0.20"},{"value":"0.24","label":"0.24"},{"value":"0.28","label":"0.28"},{"value":"0.32","label":"0.32"},{"value":"0.36","label":"0.36"}]},
    {"key":"pulleyHeight","type":"range","label":"Pulley tangent-height setting / m (adjustment scale)","value":0.4,"min":0.2,"max":0.55,"step":0.001},
  ] },
  "9702_m23_33-q2": { family: "lens_in_solution", controls: [
    {"key":"solution","type":"select","label":"Lens condition / concentration C","value":"0","options":[{"value":"0","label":"Dry lens baseline (C = 0 label)"},{"value":"0.18","label":"Sugar solution C = 0.18"},{"value":"0.33","label":"Sugar solution C = 0.33"}]},
    {"key":"object","type":"range","label":"Object-distance setting u / cm","value":10,"min":3,"max":80,"step":0.1},
    {"key":"screenDistance","type":"range","label":"Screen-distance setting v / cm","value":40,"min":39,"max":41,"step":0.1},
  ] },
  "9702_m24_33-q1": { family: "compound_t_pendulum", controls: [
    {"key":"position","type":"select","label":"Both load centres: x / m from pivot","value":"0.05","options":[{"value":"0.05","label":"0.05"},{"value":"0.07","label":"0.07"},{"value":"0.09","label":"0.09"},{"value":"0.11","label":"0.11"},{"value":"0.13","label":"0.13"},{"value":"0.15","label":"0.15"},{"value":"0.17","label":"0.17"},{"value":"0.19","label":"0.19"}]},
    {"key":"amplitude","type":"range","label":"Release amplitude / degree (adapted control)","value":5,"min":2,"max":8,"step":1},
  ] },
  "9702_m24_33-q2": { family: "ladder_static_friction", controls: [
    {"key":"strip","type":"select","label":"Strip","value":"thick","options":[{"value":"thick","label":"1 — thick, nominal length 0.44 m"},{"value":"thin","label":"2 — thin, nominal length 0.47 m"}]},
    {"key":"end","type":"select","label":"End at floor (reverse the same loaded strip)","value":"A","options":[{"value":"A","label":"A — load near floor"},{"value":"B","label":"B — load near wall"}]},
    {"key":"base","type":"range","label":"Base distance from wall / m (adapted adjustment range)","value":0.2,"min":0.02,"max":0.42,"step":0.001},
  ] },
  "9702_m25_33-q1": { family: "shorted_resistance_wire", controls: [
    {"key":"length","type":"range","label":"Shorted length x / m (adapted range)","value":0.45,"min":0.05,"max":0.95,"step":0.005},
    {"key":"clipPosition","type":"range","label":"F clip position / m (moving this shifts both clips)","value":0.1,"min":0,"max":0.55,"step":0.005},
  ] },
  "9702_m25_33-q2": { family: "thermal_pipe_lever", controls: [
    {"key":"length","type":"select","label":"Heated-length mark / m","value":"0.12","options":[{"value":"0.12","label":"0.12"},{"value":"0.19","label":"0.19"}]},
    {"key":"water","type":"range","label":"Pour-water setting / °C","value":82,"min":60,"max":95,"step":1},
  ] },
  "9702_s21_33-q1": { family: "complementary_series_wires", controls: [
    {"key":"g","type":"range","label":"G clip setting / m","value":0.3,"min":0.05,"max":0.62,"step":0.005},
    {"key":"h","type":"range","label":"H clip setting / m","value":0.3,"min":0.05,"max":0.62,"step":0.005},
  ] },
  "9702_s21_33-q2": { family: "spring_torsional_rod", controls: [
    {"key":"b","type":"select","label":"Spring arm b / m","value":"0.10","options":[{"value":"0.10","label":"0.10"},{"value":"0.20","label":"0.20"}]},
    {"key":"level","type":"range","label":"Spring-preload leveling adjustment / mm","value":5,"min":-10,"max":10,"step":1},
    {"key":"amplitude","type":"range","label":"Release angle / degree","value":3,"min":1,"max":5,"step":1},
  ] },
  "9702_s21_34-q1": { family: "catenary_transverse_pendulum", controls: [
    {"key":"separation","type":"range","label":"Support-separation setting / m (adapted range)","value":0.6,"min":0.25,"max":0.77,"step":0.005},
    {"key":"amplitude","type":"range","label":"Out-of-plane release angle / degree","value":5,"min":2,"max":8,"step":1},
  ] },
  "9702_s21_34-q2": { family: "foam_ring_compression", controls: [
    {"key":"ring","type":"select","label":"Ring","value":"large","options":[{"value":"large","label":"Larger"},{"value":"small","label":"Smaller"}]},
    {"key":"level","type":"range","label":"Initial rod angle / degree (adapted leveling control)","value":2,"min":-5,"max":5,"step":0.5},
  ] },
  "9702_s22_33-q1": { family: "parallel_wire_voltage_divider", controls: [
    {"key":"d","type":"range","label":"Clip H: d / m","value":0.4,"min":0.2,"max":0.7,"step":0.005},
  ] },
  "9702_s22_33-q2": { family: "wrapping_mass_dynamics", controls: [
    {"key":"theta","type":"select","label":"Release-angle setting / degree","value":"90","options":[{"value":"90","label":"90"},{"value":"65","label":"65"},{"value":"45","label":"45"}]},
  ] },
  "9702_s22_34-q1": { family: "rc_discharge_parallel", controls: [
    {"key":"resistor","type":"select","label":"Resistor R / Ω","value":"220000","options":[{"value":"470000","label":"470000"},{"value":"330000","label":"330000"},{"value":"220000","label":"220000"},{"value":"150000","label":"150000"},{"value":"100000","label":"100000"},{"value":"47000","label":"47000"},{"value":"33000","label":"33000"},{"value":"22000","label":"22000"}]},
  ] },
  "9702_s22_34-q2": { family: "liquid_adhesion_drainage", controls: [
    {"key":"liquid","type":"select","label":"Liquid","value":"water","options":[{"value":"water","label":"Water"},{"value":"oil","label":"Vegetable oil"}]},
    {"key":"speed","type":"range","label":"Pull speed / m s⁻¹ (adapted)","value":0.0002,"min":0.0001,"max":0.001,"step":0.0001},
  ] },
  "9702_s23_33-q1": { family: "cylinder_wrapped_pendulum", controls: [
    {"key":"length","type":"range","label":"Unattached string-length setting L / m","value":0.45,"min":0.25,"max":0.6,"step":0.005},
    {"key":"amplitude","type":"range","label":"Release angle / degree","value":5,"min":2,"max":8,"step":1},
  ] },
  "9702_s23_33-q2": { family: "lamina_centroid", controls: [
    {"key":"width","type":"select","label":"Card width / m","value":"0.12","options":[{"value":"0.12","label":"Original: 0.120"},{"value":"0.09","label":"Trim right edge: 0.090"}]},
    {"key":"hole","type":"select","label":"Punch / suspend at corner","value":"0","options":[{"value":"0","label":"Bottom left"},{"value":"1","label":"Top right"},{"value":"2","label":"Top left"}]},
  ] },
  "9702_s23_34-q1": { family: "counterweighted_compound_pendulum", controls: [
    {"key":"mass","type":"select","label":"Upper mass M / kg","value":"0.0","options":[{"value":"0.0","label":"0.00"},{"value":"0.01","label":"0.01"},{"value":"0.02","label":"0.02"},{"value":"0.03","label":"0.03"},{"value":"0.04","label":"0.04"},{"value":"0.05","label":"0.05"},{"value":"0.06","label":"0.06"},{"value":"0.07","label":"0.07"},{"value":"0.08","label":"0.08"},{"value":"0.09","label":"0.09"}]},
    {"key":"amplitude","type":"range","label":"Release angle / degree","value":4,"min":2,"max":6,"step":1},
  ] },
  "9702_s23_34-q2": { family: "thermal_pipe_suspended_lever", controls: [
    {"key":"length","type":"select","label":"Pipe / m","value":"0.122","options":[{"value":"0.122","label":"Long: 0.122"},{"value":"0.074","label":"Short: 0.074"}]},
  ] },
  "9702_s24_33-q1": { family: "loaded_rule_balance", controls: [
    {"key":"n","type":"range","label":"Number n transferred from centre to right end","value":1,"min":1,"max":7,"step":1},
    {"key":"pivot","type":"range","label":"Pivot position from left end / m","value":0.4,"min":0.2,"max":0.5,"step":0.001},
  ] },
  "9702_s24_33-q2": { family: "rubber_lateral_contraction", controls: [
    {"key":"ratio","type":"select","label":"Clamp stretch setting L/L₀","value":"1","options":[{"value":"1","label":"1 — relaxed"},{"value":"1.5","label":"1.5"},{"value":"2","label":"2"}]},
    {"key":"pressure","type":"select","label":"Micrometer pressure","value":"light","options":[{"value":"light","label":"Light contact"},{"value":"over-tight","label":"Over-tight"}]},
  ] },
  "9702_s24_34-q1": { family: "symmetric_movable_pulley", controls: [
    {"key":"mass","type":"select","label":"Added mass x / kg (not a length)","value":"0","options":[{"value":"0","label":"0.00"},{"value":"0.01","label":"0.01"},{"value":"0.02","label":"0.02"},{"value":"0.03","label":"0.03"},{"value":"0.04","label":"0.04"},{"value":"0.05","label":"0.05"},{"value":"0.06","label":"0.06"},{"value":"0.07","label":"0.07"},{"value":"0.1","label":"0.10"},{"value":"0.15","label":"0.15"},{"value":"0.2","label":"0.20"},{"value":"0.24","label":"0.24"}]},
  ] },
  "9702_s24_34-q2": { family: "falling_mass_rotating_card", controls: [
    {"key":"card","type":"select","label":"Card on spindle","value":"none","options":[{"value":"none","label":"None — baseline"},{"value":"A","label":"Card A"},{"value":"B","label":"Card B"}]},
  ] },
  "9702_s25_33-q1": { family: "wire_shunt_equal_resistors", controls: [
    {"key":"length","type":"range","label":"Clip separation L / m","value":0.3,"min":0.3,"max":0.95,"step":0.005},
  ] },
  "9702_s25_33-q2": { family: "asymmetric_loaded_chain", controls: [
    {"key":"condition","type":"select","label":"Source condition","value":"0","options":[{"value":"0","label":"10 g clay; attach at clip 11; stands ≈0.70 m"},{"value":"1","label":"Combine to 30 g clay; attach at clip 7; stands ≈0.80 m"}]},
  ] },
  "9702_s25_34-q1": { family: "interrupted_pendulum", controls: [
    {"key":"length","type":"range","label":"Short-side length L₂ setting / m","value":0.17,"min":0.04,"max":0.17,"step":0.005},
    {"key":"amplitude","type":"range","label":"Long-side release angle / degree","value":2,"min":2,"max":6,"step":1},
  ] },
  "9702_s25_34-q2": { family: "confined_ball_settling", controls: [
    {"key":"diameter","type":"select","label":"Ball","value":"0.005","options":[{"value":"0.005","label":"5 mm steel ball"},{"value":"0.004","label":"4 mm steel ball"}]},
  ] },
  "9702_w21_33-q1": { family: "parallel_resistor_network", controls: [
    {"key":"r1","type":"select","label":"First part R₁","value":"33","options":[{"value":"33","label":"33 Ω"},{"value":"47","label":"47 Ω"},{"value":"56","label":"56 Ω"},{"value":"68","label":"68 Ω"},{"value":"82","label":"82 Ω"}]},
    {"key":"r2","type":"select","label":"Second part R₂","value":"47","options":[{"value":"33","label":"33 Ω"},{"value":"47","label":"47 Ω"},{"value":"56","label":"56 Ω"},{"value":"68","label":"68 Ω"},{"value":"82","label":"82 Ω"}]},
  ] },
  "9702_w21_33-q2": { family: "filter_paper_fall", controls: [
    {"key":"stack","type":"select","label":"Paper stack","value":"0","options":[{"value":"0","label":"Six smaller sheets"},{"value":"1","label":"Two larger sheets"}]},
    {"key":"tilt","type":"range","label":"Release tilt from horizontal / degrees (adapted)","value":0,"min":0,"max":20,"step":1},
  ] },
  "9702_w21_34-q1": { family: "wire_bridge_null", controls: [
    {"key":"p","type":"range","label":"Upper contact A: p / m","value":0.4,"min":0.15,"max":0.72,"step":0.005},
    {"key":"q","type":"range","label":"Lower contact C: q from E / m","value":0.2,"min":0,"max":0.8,"step":0.001},
  ] },
  "9702_w21_34-q2": { family: "suspended_rod_two_modes", controls: [
    {"key":"depth","type":"select","label":"String arrangement","value":"0.3","options":[{"value":"0.3","label":"Long arrangement"},{"value":"0.15","label":"Short arrangement"}]},
    {"key":"mode","type":"select","label":"Displacement direction","value":"S","options":[{"value":"S","label":"S — side-to-side rocking"},{"value":"B","label":"B — parallel transverse translation"}]},
  ] },
  "9702_w22_33-q1": { family: "folded_wire_series_resistivity", controls: [
    {"key":"position","type":"select","label":"Micrometer placement / orientation","value":"1","options":[{"value":"1","label":"Position 1"},{"value":"2","label":"Position 2, rotated"},{"value":"3","label":"Position 3"}]},
    {"key":"x","type":"range","label":"Upper clip Q position x / m","value":0.1,"min":0.1,"max":0.85,"step":0.005},
  ] },
  "9702_w22_33-q2": { family: "buoyancy_series_springs", controls: [
    {"key":"load","type":"select","label":"Suspended load","value":"cal100","options":[{"value":"cal100","label":"Calibration: 100 g"},{"value":"cal200","label":"Calibration: 200 g"},{"value":"M12","label":"Four M12 nuts"},{"value":"M16","label":"Four M16 nuts"}]},
    {"key":"medium","type":"select","label":"Medium","value":"air","options":[{"value":"air","label":"Air"},{"value":"oil","label":"Fully immersed in oil"}]},
  ] },
  "9702_w22_34-q1": { family: "cylinder_step_stability", controls: [
    {"key":"pileT","type":"range","label":"Paper pile setting T / m","value":0.003,"min":0.001,"max":0.01,"step":0.0005},
    {"key":"height","type":"range","label":"Board rise z setting / m","value":0,"min":0,"max":0.28,"step":0.001},
  ] },
  "9702_w22_34-q2": { family: "magnet_coil_cantilever", controls: [
    {"key":"rheostat","type":"range","label":"Rheostat / Ω","value":8,"min":0,"max":8,"step":0.01},
    {"key":"polarity","type":"select","label":"Coil polarity","value":"1","options":[{"value":"1","label":"Attract downward"},{"value":"-1","label":"Reverse — repel upward"}]},
  ] },
  "9702_w23_33-q1": { family: "interrupted_pendulum_fixed_length", controls: [
    {"key":"separation","type":"range","label":"Pivot-to-obstruction separation S / m","value":0.36,"min":0.05,"max":0.45,"step":0.005},
    {"key":"amplitude","type":"range","label":"Long-side release angle / degree","value":2,"min":2,"max":6,"step":1},
  ] },
  "9702_w23_33-q2": { family: "inclined_rod_lift", controls: [
    {"key":"distance","type":"select","label":"Mass position d along strip / m","value":"0.15","options":[{"value":"0.15","label":"0.150"},{"value":"0.3","label":"0.300"}]},
    {"key":"force","type":"range","label":"Applied pull setting / N","value":0,"min":0,"max":1,"step":0.01},
  ] },
  "9702_w23_34-q1": { family: "meter_bridge_parallel_resistor", controls: [
    {"key":"resistor","type":"select","label":"Insert resistor R parallel to Q","value":"4700","options":[{"value":"4700","label":"4700 Ω"},{"value":"3300","label":"3300 Ω"},{"value":"2200","label":"2200 Ω"},{"value":"1000","label":"1000 Ω"},{"value":"680","label":"680 Ω"},{"value":"470","label":"470 Ω"},{"value":"330","label":"330 Ω"},{"value":"220","label":"220 Ω"}]},
    {"key":"a","type":"range","label":"Slide contact a / m (fine placement control)","value":0.5,"min":0.05,"max":0.95,"step":0.0001},
  ] },
  "9702_w23_34-q2": { family: "water_jet_ballistics", controls: [
    {"key":"base","type":"select","label":"Bottle base height / m","value":"0.27","options":[{"value":"0.27","label":"0.270"},{"value":"0.32","label":"0.320"}]},
  ] },
  "9702_w24_33-q1": { family: "wire_voltage_divider_resistivity", controls: [
    {"key":"length","type":"range","label":"Clip F setting L / m","value":0.45,"min":0.15,"max":0.95,"step":0.005},
    {"key":"placement","type":"select","label":"Micrometer placement","value":"1","options":[{"value":"1","label":"Position 1"},{"value":"2","label":"Position 2, rotated"},{"value":"3","label":"Position 3"}]},
  ] },
  "9702_w24_33-q2": { family: "colliding_pendulum_balls", controls: [
    {"key":"alignment","type":"select","label":"Collision alignment","value":"head-on","options":[{"value":"head-on","label":"Head-on"},{"value":"offset","label":"Offset — adapted reduced impulse"}]},
  ] },
  "9702_w24_34-q1": { family: "syringe_nozzle_drainage", controls: [
    {"key":"top","type":"select","label":"Select 5 cm³ interval","value":"30","options":[{"value":"10","label":"10 → 5 cm³"},{"value":"15","label":"15 → 10 cm³"},{"value":"20","label":"20 → 15 cm³"},{"value":"25","label":"25 → 20 cm³"},{"value":"30","label":"30 → 25 cm³"},{"value":"35","label":"35 → 30 cm³"},{"value":"40","label":"40 → 35 cm³"},{"value":"45","label":"45 → 40 cm³"},{"value":"50","label":"50 → 45 cm³"}]},
  ] },
  "9702_w24_34-q2": { family: "magnetic_inelastic_pickup", controls: [
    {"key":"nut","type":"select","label":"Nut label","value":"0","options":[{"value":"0","label":"A (approximately 10 g)"},{"value":"1","label":"B (approximately 30 g)"}]},
  ] },
  "9702_w25_33-q1": { family: "inclined_board_rolling_pendulum", controls: [
    {"key":"height","type":"range","label":"Support height h / m","value":0.22,"min":0.1,"max":0.38,"step":0.001},
  ] },
  "9702_w25_33-q2": { family: "led_ldr_photoresistance", controls: [
    {"key":"length","type":"range","label":"Selected wire length L / m","value":0.1,"min":0.1,"max":0.9,"step":0.001},
    {"key":"angle","type":"range","label":"Alignment angle / degrees (adaptation)","value":0,"min":0,"max":20,"step":1},
  ] },
  "9702_w25_34-q1": { family: "spring_supported_variable_pivot_rod", controls: [
    {"key":"hole","type":"select","label":"Pivot hole distance W from S / m","value":"0.35","options":[{"value":"0.26","label":"0.26"},{"value":"0.29","label":"0.29"},{"value":"0.32","label":"0.32"},{"value":"0.35","label":"0.35"},{"value":"0.38","label":"0.38"},{"value":"0.41","label":"0.41"},{"value":"0.44","label":"0.44"},{"value":"0.47","label":"0.47"}]},
    {"key":"height","type":"range","label":"Upper nail adjustment above pivot","value":0.4,"min":0.3,"max":0.5,"step":0.001},
  ] },
  "9702_w25_34-q2": { family: "sphere_on_two_rails", controls: [
    {"key":"sphere","type":"select","label":"Sphere","value":"0.019","options":[{"value":"0.019","label":"Small (nominal 19 mm)"},{"value":"0.025","label":"Large (nominal 25 mm)"}]},
    {"key":"height","type":"range","label":"Set initial underside clearance h / m","value":0.008,"min":0.004,"max":0.016,"step":0.001},
  ] },
});
