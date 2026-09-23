import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeWireBridge(parameters={},seed=2021341){
 const truth={M_ohm:220,N_ohm:100,E_V:3,r_ohm_m:15,active_L_m:.8,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive bridge parameters required');const random=seededRandom(seed);
 function validate(p,q){if(!Number.isFinite(p)||p<.15||p>.72||!Number.isFinite(q)||q<0||q>truth.active_L_m)throw new RangeError('Use p=0.15–0.72 m and q within the wire');}
 function nullPosition(p){validate(p,0);return {q_null_m:truth.active_L_m-truth.N_ohm/truth.M_ohm*p};}
 function voltage(p,q){validate(p,q);return truth.E_V*(truth.M_ohm/(truth.M_ohm+truth.N_ohm)-truth.r_ohm_m*p/(truth.r_ohm_m*p+truth.r_ohm_m*(truth.active_L_m-q)));}
 function readVoltage(p,q,closed){const v=voltage(p,q);return readInstrument(closed?v:0,{resolution:.01,halfWidth:closed?.002:0},random);}
 function readLengths(p,q){validate(p,q);return {p:readInstrument(p,{resolution:.001,halfWidth:.001},random),q:readInstrument(q,{resolution:.001,halfWidth:.001},random)};}
 return Object.freeze({nullPosition,voltage,readVoltage,readLengths});
}
