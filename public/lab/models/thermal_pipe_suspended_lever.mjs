import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeSuspendedThermalLever(parameters={},seed=2023342){
 const truth={alpha_K_inv:.00015,T0_C:22,thermal_tau_s:8,x1_m:.3,holes_from_ends_m:.005,lever_arm_short_m:.04,lever_arm_long_m:.4,...parameters};if(!Object.values(truth).every(Number.isFinite)||['alpha_K_inv','thermal_tau_s','lever_arm_short_m','lever_arm_long_m'].some(k=>truth[k]<=0)||truth.holes_from_ends_m<0)throw new RangeError('Invalid thermal apparatus');const random=seededRandom(seed);
 function length(L){if(![.122,.074].includes(L)||L<=2*truth.holes_from_ends_m)throw new RangeError('Choose a source pipe length with positive active span');}
 function expansion(L,deltaT){length(L);if(!Number.isFinite(deltaT))throw new RangeError('Finite temperature difference required');const deltaX_m=truth.lever_arm_long_m/truth.lever_arm_short_m*truth.alpha_K_inv*(L-2*truth.holes_from_ends_m)*deltaT;return {deltaX_m,k_K:deltaX_m!==0?L*deltaT/deltaX_m:null};}
 function state(L,water_C,t){length(L);if(!Number.isFinite(water_C)||water_C<60||water_C>95||!Number.isFinite(t)||t<0)throw new RangeError('Use water 60–95 °C and nonnegative time');const pipe_C=truth.T0_C+(water_C-truth.T0_C)*(-Math.expm1(-t/truth.thermal_tau_s));return {pointer_m:truth.x1_m-expansion(L,pipe_C-truth.T0_C).deltaX_m,pipe_C};}
 const ruler=v=>readInstrument(v,{resolution:.001,halfWidth:.0015},random);
 function readCold(L){length(L);return {l:readInstrument(L,{resolution:.001,halfWidth:.0005},random),x1:ruler(truth.x1_m),t0:readInstrument(truth.T0_C,{resolution:1,halfWidth:.5},random)};}
 function readHot(L,water_C,t){const v=state(L,water_C,t);return {x2:ruler(v.pointer_m),t:readInstrument(water_C,{resolution:1,halfWidth:.5},random)};}
 return Object.freeze({expansion,state,readCold,readHot});
}
