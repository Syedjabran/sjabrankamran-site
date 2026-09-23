// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeSyringeDrainage(parameters={},seed=2024341){
 const truth={A_barrel_m2:.00045,Cd:.75,g:9.81,nozzle_diameter_m:.002,nozzle_height_m:.15,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive drainage parameters required');const random=seededRandom(seed),rate=truth.Cd*(Math.PI*truth.nozzle_diameter_m**2/4)/truth.A_barrel_m2*Math.sqrt(2*truth.g);
 function ideal(Vtop,Vbottom){if(![Vtop,Vbottom].every(v=>Number.isFinite(v)&&v>0)||Vtop>50e-6+1e-12||Vbottom<5e-6-1e-12||Math.abs(Vtop-Vbottom-5e-6)>1e-12)throw new RangeError('Select marks 5 cm³ apart within 5–50 cm³');const top=Vtop/truth.A_barrel_m2,bottom=Vbottom/truth.A_barrel_m2;return {ht_m:truth.nozzle_height_m+top,hb_m:truth.nozzle_height_m+bottom,T_s:2*(Math.sqrt(top)-Math.sqrt(bottom))/rate};}
 function volume(initial_cm3,t){if(!Number.isFinite(initial_cm3)||initial_cm3<=0||initial_cm3>52.5||!Number.isFinite(t)||t<0)throw new RangeError('Valid initial fill and nonnegative time required');const h=Math.max(0,Math.sqrt(initial_cm3*1e-6/truth.A_barrel_m2)-rate*t/2)**2;return truth.A_barrel_m2*h*1e6;}
 function readHeights(top_cm3){const s=ideal(top_cm3*1e-6,(top_cm3-5)*1e-6);return {ht:readInstrument(s.ht_m,{resolution:.001,halfWidth:.001},random),hb:readInstrument(s.hb_m,{resolution:.001,halfWidth:.001},random)};}
 function readTime(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive manual timing required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,volume,readHeights,readTime});
}
