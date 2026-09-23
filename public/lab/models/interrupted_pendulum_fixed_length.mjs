// 9702_w23_33-q1: fixed total length, movable obstruction; distinct from s25.
import {makeInterruptedPendulum} from './interrupted_pendulum.mjs';
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeFixedLengthInterruptedPendulum(parameters={},seed=2023331){
 const truth={L_m:.53,g:9.81,...parameters};if(!Number.isFinite(truth.L_m)||truth.L_m<=.45||!Number.isFinite(truth.g)||truth.g<=0)throw new RangeError('Invalid fixed pendulum');const core=makeInterruptedPendulum({g:truth.g},seed),random=seededRandom(seed);
 function validate(S){if(!Number.isFinite(S)||S<.05||S>.45||S>=truth.L_m)throw new RangeError('Obstruction S=0.05–0.45 m below upper pivot');}
 function ideal(S){validate(S);return {...core.ideal(truth.L_m,truth.L_m-S),B_s:Math.PI*Math.sqrt(truth.L_m/truth.g)};}
 function shortAmplitude(S,A){validate(S);return core.shortAmplitude(truth.L_m,truth.L_m-S,A);}
 function motion(S,A,t){validate(S);return core.motion(truth.L_m,truth.L_m-S,A,t);}
 function readLengths(S){validate(S);return {l:readInstrument(truth.L_m,{resolution:.001,halfWidth:.001},random),s:readInstrument(S,{resolution:.001,halfWidth:.001},random)};}
 return Object.freeze({ideal,shortAmplitude,motion,readLengths,readElapsed:core.readElapsed});
}
