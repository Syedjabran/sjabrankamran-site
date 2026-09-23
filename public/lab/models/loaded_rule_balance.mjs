import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeLoadedRuleBalance(parameters={},seed=2024331){
 const truth={R_kg:.12,M_kg:.01,heavy_kg:.1,g:9.81,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive balance parameters required');const random=seededRandom(seed);
 function ideal(n,a=.475){if(!Number.isInteger(n)||n<1||n>7||!Number.isFinite(a)||a<.46||a>.49)throw new RangeError('Use n=1–7 and a=0.46–0.49 m');const total=truth.R_kg+truth.heavy_kg+8*truth.M_kg;return {y_m:(truth.heavy_kg-truth.M_kg*(n+1))*a/total,P_m:(truth.heavy_kg-truth.M_kg)*a/total,Q_m:truth.M_kg*a/total};}
 function torque(n,a,pivot){const v=ideal(n,a);if(!Number.isFinite(pivot)||pivot<.2||pivot>.5)throw new RangeError('Pivot at 0.20–0.50 m');return (truth.R_kg+truth.heavy_kg+8*truth.M_kg)*truth.g*(.5-v.y_m-pivot);}
 function settled(n,a,pivot){const tau=torque(n,a,pivot),deadband=(truth.R_kg+truth.heavy_kg+8*truth.M_kg)*truth.g*.0008;return {balanced:Math.abs(tau)<=deadband,tilt_deg:Math.abs(tau)<=deadband?0:Math.sign(tau)*Math.min(12,2+Math.abs(tau)*40)};}
 function read(n,a,pivot){torque(n,a,pivot);return {n,a:readInstrument(a,{resolution:.001,halfWidth:.001},random),y:readInstrument(.5-pivot,{resolution:.001,halfWidth:.001},random)};}
 return Object.freeze({ideal,torque,settled,read});
}
