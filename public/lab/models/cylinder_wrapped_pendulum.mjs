import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeCylinderWrappedPendulum(parameters={},seed=20233311){
 const truth={radius_m:.04,g:9.81,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive cylinder parameters required');const random=seededRandom(seed);
 function ideal(L){if(!Number.isFinite(L)||L<.25||L>.6)throw new RangeError('Use L=0.25–0.60 m');const ell_m=L-Math.PI*truth.radius_m/2;if(ell_m<=0)throw new RangeError('No free string remains');return {ell_m,T_s:2*Math.PI*Math.sqrt(ell_m/truth.g)};}
 function angle(L,A,t){if(!Number.isFinite(A)||A<2||A>8||!Number.isFinite(t)||t<0)throw new RangeError('Small angle and nonnegative time required');return A*Math.cos(2*Math.PI*t/ideal(L).T_s);}
 function shape(L,theta_deg){ideal(L);if(!Number.isFinite(theta_deg)||Math.abs(theta_deg)>8)throw new RangeError('Contact geometry only for small angles');const q=theta_deg*Math.PI/180,r=truth.radius_m,arc_length_m=r*(Math.PI/2-q),free=L-arc_length_m,tx=r*Math.cos(q),ty=-r*Math.sin(q);return {attachment_y_m:-r,tangent_x_m:tx,tangent_y_m:ty,bob_x_m:tx+free*Math.sin(q),bob_y_m:ty+free*Math.cos(q),arc_length_m};}
 function readLength(L){ideal(L);return readInstrument(L,{resolution:.001,halfWidth:.001},random);}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive elapsed time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,angle,shape,readLength,readElapsed});
}
