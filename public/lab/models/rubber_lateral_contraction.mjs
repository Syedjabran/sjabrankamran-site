import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeRubberContraction(parameters={},seed=2024332){
 const truth={L0_m:.15,w0_m:.005,t0_m:.001,E_Pa:1e6,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive rubber parameters required');const random=seededRandom(seed);
 function ideal(lambda){if(![1,1.5,2].includes(lambda))throw new RangeError('Use source stretch ratios');const w_m=truth.w0_m/Math.sqrt(lambda),thickness_m=truth.t0_m/Math.sqrt(lambda);return {L_m:truth.L0_m*lambda,w_m,thickness_m,k:lambda===1?null:truth.L0_m*(lambda-1)/(truth.w0_m-w_m),F_source_N:2*truth.E_Pa*truth.w0_m*truth.t0_m*(lambda-1),F_neo_N:2*truth.E_Pa/3*truth.w0_m*truth.t0_m*(lambda-lambda**-2)};}
 function micro(v,pressure){if(!['light','over-tight'].includes(pressure))throw new RangeError('Choose micrometer pressure');return readInstrument(v,{resolution:1e-5,halfWidth:2e-5,bias:pressure==='over-tight'?-.05*v:0},random);}
 function readRelaxed(pressure='light'){return {l0:readInstrument(truth.L0_m,{resolution:.001,halfWidth:.003},random),w0:micro(truth.w0_m,pressure),t:micro(truth.t0_m,pressure)};}
 function readStretched(lambda,pressure='light'){const s=ideal(lambda);return {l:readInstrument(s.L_m,{resolution:.001,halfWidth:.002},random),w:micro(s.w_m,pressure)};}
 return Object.freeze({ideal,readRelaxed,readStretched});
}
