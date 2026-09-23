// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
// Endpoint surrogate and illustrative easing only; NOT contact dynamics.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeWrappingMassDynamics(parameters={},seed=20223312){
 const truth={A_m:.18,k_fit:.9,animation_duration_s:1.5,string_length_m:.7,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Invalid endpoint parameters');const random=seededRandom(seed);
 function endpoint(theta){if(![90,65,45].includes(theta))throw new RangeError('Choose 90, 65 or 45 degrees');const H=truth.A_m*(1+truth.k_fit*Math.cos(theta*Math.PI/180)**2);if(H>=truth.string_length_m)throw new RangeError('Endpoint exceeds available string; calibration invalid');return H;}
 function trial(theta){const H=endpoint(theta)+(random()*2-1)*.003,angle=readInstrument(theta,{resolution:1,halfWidth:.5},random);
  function state(t){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative animation time required');const q=Math.min(1,t/truth.animation_duration_s);return {fall_m:H*q*q*(3-2*q),phase:q,finished:q===1};}
  function read(t){if(!state(t).finished)throw new RangeError('Wait for winding to stop');return {h:readInstrument(H,{resolution:.001,halfWidth:.001},random),theta:angle};}
  return Object.freeze({state,read});
 }
 return Object.freeze({endpoint,trial});
}
