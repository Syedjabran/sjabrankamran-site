import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeRailSphere(parameters={},seed=2025342){
 const truth={track_length_m:.6,x_m:.016,g:9.81,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive track geometry');const random=seededRandom(seed);
 function ideal(d,h=.008){if(!Number.isFinite(d)||d<=truth.x_m||!Number.isFinite(h)||h<=0||h>=truth.track_length_m)throw new RangeError('Sphere must bridge rails; positive rise less than track length');const J=1-(truth.x_m/d)**2,factor=1+.4/J,a=truth.g*h/truth.track_length_m/factor;return {effectivefactor:factor,k_s2_m:2*truth.track_length_m**2/(5*truth.g),acceleration_m_s2:a,time_s:Math.sqrt(2*truth.track_length_m/a),contact_radius_m:.5*Math.sqrt(d*d-truth.x_m**2)};}
 function motion(d,h,t){const s=ideal(d,h);if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time');const distance=Math.min(truth.track_length_m,.5*s.acceleration_m_s2*t*t);return {distance_m:distance,fraction:distance/truth.track_length_m,spin_rad:distance/s.contact_radius_m,arrived:t>=s.time_s};}
 function readGeometry(d,h){ideal(d,h);return {x:readInstrument(truth.x_m,{resolution:.001,halfWidth:.0005},random),h:readInstrument(h,{resolution:.001,halfWidth:.001},random),d:readInstrument(d,{resolution:.001,halfWidth:.0005},random)};}
 function readTime(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive manual timing');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,motion,readGeometry,readTime});
}
