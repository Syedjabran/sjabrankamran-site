import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeParallelWireDivider(parameters={},seed=20223311){
 const truth={L_m:.75,r_ohm_m:10,Ry_ohm:10,E_V:1.5,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive circuit parameters required');const random=seededRandom(seed);
 function ideal(d,closed=true){if(!Number.isFinite(d)||d<.2||d>.7||d>=truth.L_m||typeof closed!=='boolean')throw new RangeError('Use d=0.20–0.70 m, d<L and boolean switch');const Rleft_ohm=truth.r_ohm_m*d*truth.L_m/(d+truth.L_m),Rright=truth.r_ohm_m*(truth.L_m-d),I=closed?truth.E_V/(truth.Ry_ohm+Rleft_ohm+Rright):0;return {Rleft_ohm,V1_V:I*Rleft_ohm,V2_V:I*Rright};}
 function read(d,closed){const v=ideal(d,closed),ruler=x=>readInstrument(x,{resolution:.001,halfWidth:.001},random),meter=x=>closed?readInstrument(x,{resolution:.001,halfWidth:.001},random):0;return {l:ruler(truth.L_m),d:ruler(d),v1:meter(v.V1_V),v2:meter(v.V2_V)};}
 return Object.freeze({ideal,read});
}
