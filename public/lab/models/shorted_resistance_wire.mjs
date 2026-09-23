// 9702_m25_33-q1: F–G jumper bypasses x, leaving (wire_length - x) active.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function reciprocalCurrent(I){if(!Number.isFinite(I)||I<0)throw new RangeError('Nonnegative finite current required');return I===0?null:1/I;}
export function makeShortedResistanceWire(parameters={},seed=2025331){
 const truth={E_V:1.5,Rseries_ohm:18,wire_r_ohm_m:20,wire_length_m:1,r_internal_ohm:.5,...parameters};
 for(const [k,v]of Object.entries(truth))if(!Number.isFinite(v)||v<0||(k!=='r_internal_ohm'&&v===0))throw new RangeError('Invalid circuit parameters');
 if(truth.wire_length_m<.95)throw new RangeError('Wire must accommodate the adapted range');
 const random=seededRandom(seed),contactOffset=.2+.8*random(); // fixed per apparatus/run, not per sample
 function validate(x,closed){if(!Number.isFinite(x)||x<.05||x>.95||typeof closed!=='boolean')throw new RangeError('Use x=0.05–0.95 m and a boolean switch state');}
 function current(x,closed=true){validate(x,closed);return closed?truth.E_V/(truth.Rseries_ohm+truth.wire_r_ohm_m*(truth.wire_length_m-x)+truth.r_internal_ohm):0;}
 function read(x,closed,{poorContact=false,parallax=false}={}){
  validate(x,closed);let I=current(x,closed);
  if(closed&&poorContact)I=truth.E_V/(truth.E_V/I+contactOffset);
  return {x:readInstrument(x,{resolution:.001,halfWidth:.001,bias:parallax ? .002 : 0},random),i:closed?readInstrument(I,{resolution:.0001,halfWidth:.0001},random):0};
 }
 return Object.freeze({current,read});
}
