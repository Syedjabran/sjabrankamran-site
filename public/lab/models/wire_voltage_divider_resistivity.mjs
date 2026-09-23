import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeWireVoltageDivider(parameters={},seed=2024331){
 const truth={R_ohm:33,r_ohm_m:20,d_m:.00025,E_V:1.5,internal_ohm:0,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>=0)||['R_ohm','r_ohm_m','d_m','E_V'].some(k=>truth[k]===0))throw new RangeError('Invalid divider parameters');const random=seededRandom(seed);
 function ideal(L){if(!Number.isFinite(L)||L<.15||L>.95)throw new RangeError('Use L=0.15–0.95 m');const Rw=truth.r_ohm_m*L;return {V_V:truth.E_V*Rw/(truth.R_ohm+truth.internal_ohm+Rw),J_m_V:(truth.R_ohm+truth.internal_ohm)/(truth.E_V*truth.r_ohm_m),W_Vinv:1/truth.E_V};}
 function resistivity(r,d){if(![r,d].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive resistance per length and diameter required');return {rho_ohm_m:r*Math.PI*d*d/4};}
 function readLength(L){ideal(L);return readInstrument(L,{resolution:.001,halfWidth:.001},random);}
 function readDiameter(){return readInstrument(truth.d_m,{resolution:.00001,halfWidth:.000006},random);}
 function readVoltage(L,closed){const s=ideal(L);return readInstrument(closed?s.V_V:0,{resolution:.001,halfWidth:closed?.001:0},random);}
 return Object.freeze({ideal,resistivity,readLength,readDiameter,readVoltage});
}
