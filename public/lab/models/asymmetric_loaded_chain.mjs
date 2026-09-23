// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
// The timing law is inverted by construction, not independently verified.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeAsymmetricChain(parameters={},seed=2025332){
 const truth={rho_clay:1600,k_fit_s2_m:4,clip_length_m:.03,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive surrogate parameters required');const random=seededRandom(seed),conditions=[{mass:.01,n:11,x:.7},{mass:.03,n:7,x:.8}];
 function config(condition){if(!Number.isInteger(condition)||condition<0||condition>1)throw new RangeError('Choose either source condition');return conditions[condition];}
 function transformed(n){if(!Number.isInteger(n)||n<=0)throw new RangeError('Positive clip count required');return n**(2/3);}
 function ideal(condition){const {mass,n,x}=config(condition),N=transformed(n),d_m=Math.cbrt(6*mass/(Math.PI*truth.rho_clay));return {N,d_m,T_s:Math.sqrt(truth.k_fit_s2_m*d_m*N/x**2)};}
 function angle(condition,t){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');return 5*Math.cos(2*Math.PI*t/ideal(condition).T_s);}
 function shape(condition,angle_deg=0){const {n,x}=config(condition),left=n*truth.clip_length_m,right=(30-n)*truth.clip_length_m;if(left+right<=x||Math.abs(left-right)>=x)throw new RangeError('Chain cannot span these supports');if(!Number.isFinite(angle_deg)||Math.abs(angle_deg)>5)throw new RangeError('Small transverse angle required');const cx=(x*x+left*left-right*right)/(2*x),h=Math.sqrt(left*left-cx*cx),a=angle_deg*Math.PI/180,centre=[cx,h*Math.cos(a),h*Math.sin(a)],points=[];for(let i=0;i<=30;i++){const u=i<=n?i/n:(i-n)/(30-n);points.push(i<=n?centre.map(v=>u*v):[centre[0]+u*(x-centre[0]),centre[1]*(1-u),centre[2]*(1-u)]);}return {points,clay:centre,attachment_index:n};}
 function readGeometry(condition){const s=ideal(condition),c=config(condition);return {d:readInstrument(s.d_m,{resolution:.001,halfWidth:.0025},random),x:readInstrument(c.x,{resolution:.001,halfWidth:.001},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive elapsed time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({transformed,ideal,angle,shape,readGeometry,readElapsed});
}
