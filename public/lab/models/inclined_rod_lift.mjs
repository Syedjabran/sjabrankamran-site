import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeInclinedRodLift(parameters={},seed=2023332){
 const truth={x_m:.5,y_m:.01,z_m:.02,W_N:.49,g:9.8,rho_wood:600,support_height_m:.3,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0)||truth.support_height_m>=truth.x_m)throw new RangeError('Invalid rod geometry');const random=seededRandom(seed);
 function ideal(d){if(![.15,.3].includes(d)||d>=truth.x_m)throw new RangeError('Use source load position 0.15 or 0.30 m');const V_m3=truth.x_m*truth.y_m*truth.z_m,F_N=truth.W_N*d/truth.x_m+truth.rho_wood*V_m3*truth.g/2;return {F_N,k_Nm:F_N*truth.x_m-truth.W_N*d,V_m3};}
 function state(d,F){const s=ideal(d);if(!Number.isFinite(F)||F<0||F>1)throw new RangeError('Pull force 0–1 N');const moment_Nm=(F-s.F_N)*Math.sqrt(truth.x_m**2-truth.support_height_m**2);return {lifted:F>=s.F_N,moment_Nm};}
 function readDimensions(d){ideal(d);return Object.fromEntries([['x',truth.x_m],['y',truth.y_m],['z',truth.z_m],['d',d]].map(([k,v])=>[k,readInstrument(v,{resolution:.001,halfWidth:.0005},random)]));}
 function readForce(F){if(!Number.isFinite(F)||F<0||F>1)throw new RangeError('Pull force 0–1 N');return readInstrument(F,{resolution:.01,halfWidth:.02},random);}
 return Object.freeze({ideal,state,readDimensions,readForce});
}
