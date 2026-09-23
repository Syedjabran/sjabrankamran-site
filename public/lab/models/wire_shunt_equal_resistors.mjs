import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeWireShunt(parameters={},seed=2025331){
 const truth={R_ohm:22,r_ohm_m:20,E_V:1.5,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive electrical parameters required');const random=seededRandom(seed);
 function ideal(L){if(!Number.isFinite(L)||L<.3||L>.95)throw new RangeError('Set L from 0.30 to 0.95 m');const Rw=truth.r_ohm_m*L,Z=truth.R_ohm*Rw/(truth.R_ohm+Rw),V_V=truth.E_V*truth.R_ohm/(truth.R_ohm+Z);return {V_V,Y_V_m:(truth.E_V-V_V)/L};}
 function readSupply(){return readInstrument(truth.E_V,{resolution:.001,halfWidth:.002},random);}
 function readLength(L){ideal(L);return readInstrument(L,{resolution:.001,halfWidth:.001},random);}
 function readVoltage(L,closed){const s=ideal(L);return readInstrument(closed?s.V_V:0,{resolution:.001,halfWidth:closed?.002:0},random);}
 return Object.freeze({ideal,readSupply,readLength,readVoltage});
}
