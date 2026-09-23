import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeFoldedWire(parameters={},seed=2022331){
 const truth={E_V:3,R_ohm:22,d_m:.000315,r_ohm_m:15,Lpath_m:1.9,contact_ohm:0,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>=0)||['E_V','R_ohm','d_m','r_ohm_m','Lpath_m'].some(k=>truth[k]===0))throw new RangeError('Invalid folded-wire circuit');const random=seededRandom(seed);
 function ideal(x){if(!Number.isFinite(x)||x<.1||x>.85||x>=truth.Lpath_m)throw new RangeError('Use x=0.10–0.85 m');return {V_V:truth.E_V*truth.R_ohm/(truth.R_ohm+truth.r_ohm_m*(truth.Lpath_m-x)+truth.contact_ohm),A_Vinv_minv:-truth.r_ohm_m/(truth.E_V*truth.R_ohm)};}
 function resistivity(r,d){if(![r,d].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive r and d required');return {rho_ohm_m:r*Math.PI*d*d/4};}
 function readSupply(){return readInstrument(truth.E_V,{resolution:.01,halfWidth:.005},random);}
 function readDiameter(){return readInstrument(truth.d_m,{resolution:1e-5,halfWidth:.000006},random);}
 function readLength(x){ideal(x);return readInstrument(x,{resolution:.001,halfWidth:.001},random);}
 function readVoltage(x,closed){const v=ideal(x).V_V;return readInstrument(closed?v:0,{resolution:.01,halfWidth:closed?.005:0},random);}
 return Object.freeze({ideal,resistivity,readSupply,readDiameter,readLength,readVoltage});
}
