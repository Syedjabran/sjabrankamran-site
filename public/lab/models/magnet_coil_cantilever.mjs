// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeMagnetCantilever(parameters={},seed=2022342){
 const truth={S_N_m:.4,magnet_mass_kg:.00045,h0_m:.4,force_per_A_N_A:.006,coil_resistance_ohm:1.2,supply_V:1.5,g:9.81,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive apparatus parameters required');const random=seededRandom(seed);
 function ideal(I,polarity=1){if(!Number.isFinite(I)||I<0||I>.75||![1,-1].includes(polarity))throw new RangeError('Local model limited to 0–0.75 A and either polarity');const dm_m=truth.magnet_mass_kg*truth.g/truth.S_N_m,h_minus_H_m=polarity*truth.force_per_A_N_A*I/truth.S_N_m;return {dm_m,h_minus_H_m,k_N_A:polarity*truth.force_per_A_N_A};}
 function current(R,closed){if(!Number.isFinite(R)||R<0||R>8)throw new RangeError('Rheostat 0–8 Ω');return closed?truth.supply_V/(truth.coil_resistance_ohm+R):0;}
 function height(attached,I=0,polarity=1){const s=ideal(I,polarity);return truth.h0_m-(attached?s.dm_m+s.h_minus_H_m:0);}
 function readHeight(attached,I=0,polarity=1){return readInstrument(height(attached,I,polarity),{resolution:.001,halfWidth:.002},random);}
 function readCurrent(R,closed){return readInstrument(current(R,closed),{resolution:.01,halfWidth:.005},random);}
 function readMassLabel(){return readInstrument(truth.magnet_mass_kg,{resolution:.00001},random);}
 return Object.freeze({ideal,current,height,readHeight,readCurrent,readMassLabel});
}
