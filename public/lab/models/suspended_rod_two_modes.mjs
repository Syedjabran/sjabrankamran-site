import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeSuspendedRod(parameters={},seed=2021342){
 const truth={Lrod_m:.55,y_m:.456,displacement_m:.02,g:9.81,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0)||truth.y_m>truth.Lrod_m)throw new RangeError('Invalid suspension geometry');const random=seededRandom(seed);
 function ideal(D){if(![.3,.15].includes(D))throw new RangeError('Choose either source suspension setting');const S_s=2*Math.PI*Math.sqrt((D*D+truth.Lrod_m**2/12)/(truth.g*D)),B_s=2*Math.PI*Math.sqrt(D/truth.g);return {S_s,B_s,k_m_s2:D*(S_s*S_s-B_s*B_s),theta_deg:Math.atan(2*D/truth.y_m)*180/Math.PI};}
 function shape(D,mode,t){const s=ideal(D);if(!['S','B'].includes(mode)||!Number.isFinite(t)||t<0)throw new RangeError('Choose S or B and nonnegative time');const angle=Math.asin(truth.displacement_m/D)*Math.cos(2*Math.PI*t/(mode==='S'?s.S_s:s.B_s)),point=x=>mode==='S'?[x*Math.cos(angle)-D*Math.sin(angle),x*Math.sin(angle)+D*Math.cos(angle),0]:[x,D*Math.cos(angle),D*Math.sin(angle)];return {ends:[point(-truth.Lrod_m/2),point(truth.Lrod_m/2)],anchors:[point(-truth.y_m/2),point(truth.y_m/2)],centre:point(0),angle_deg:angle*180/Math.PI};}
 function readGeometry(D){const s=ideal(D);return {y:readInstrument(truth.y_m,{resolution:.001,halfWidth:.001},random),theta:readInstrument(s.theta_deg,{resolution:1,halfWidth:2.5},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive manual timing required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,shape,readGeometry,readElapsed});
}
