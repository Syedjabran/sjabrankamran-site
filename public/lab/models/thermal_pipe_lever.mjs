// 9702_m25_33-q2 — thermal lag and small-angle lever amplification.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeThermalPipeLever(parameters={},seed=2025332){
 const truth={s_m:.095,d_m:.475,alpha_K_inv:.00015,T0_C:22,H1_m:.22,tau_heat_s:8,tau_cool_s:400,...parameters};
 if(!Object.values(truth).every(Number.isFinite)||['s_m','d_m','alpha_K_inv','tau_heat_s','tau_cool_s'].some(k=>truth[k]<=0))throw new RangeError('Invalid thermal apparatus');
 const random=seededRandom(seed);
 function length(L){if(![.12,.19].includes(L))throw new RangeError('Choose 0.12 or 0.19 m heated length');}
 function expansion(L,Tp){length(L);if(!Number.isFinite(Tp))throw new RangeError('Finite pipe temperature required');const deltaL_m=truth.alpha_K_inv*L*(Tp-truth.T0_C);return {deltaL_m,deltaH_m:truth.d_m/truth.s_m*deltaL_m};}
 function state(L,water_C,time_s){length(L);if(!Number.isFinite(water_C)||water_C<60||water_C>95||!Number.isFinite(time_s)||time_s<0)throw new RangeError('Water 60–95 °C and nonnegative time required');
  const a=1/truth.tau_heat_s,b=1/truth.tau_cool_s,excess=water_C-truth.T0_C;
  const water=truth.T0_C+excess*Math.exp(-b*time_s);
  const pipe=truth.T0_C+excess*(Math.abs(a-b)<1e-12?a*time_s*Math.exp(-a*time_s):a/(a-b)*(Math.exp(-b*time_s)-Math.exp(-a*time_s)));
  return {water_C:water,pipe_C:pipe,pointer_m:truth.H1_m-expansion(L,pipe).deltaH_m};
 }
 const ruler=v=>readInstrument(v,{resolution:.001,halfWidth:.001},random);
 function readCold(L){length(L);return {l:ruler(L),s:ruler(truth.s_m),d:ruler(truth.d_m),h1:ruler(truth.H1_m),t0:readInstrument(truth.T0_C,{resolution:1,halfWidth:.5},random)};}
 function readHot(L,water_C,time_s){const v=state(L,water_C,time_s);return {h2:ruler(v.pointer_m),t:readInstrument(v.water_C,{resolution:1,halfWidth:.5},random)};}
 return Object.freeze({expansion,state,readCold,readHot});
}
