import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeLaminaCentroid(parameters={},seed=2023332){
 const truth={h_m:.06,...parameters};if(!Number.isFinite(truth.h_m)||truth.h_m<=0)throw new RangeError('Positive card height required');const random=seededRandom(seed);
 function ideal(x){if(x!==.09&&x!==.12)throw new RangeError('Use either source card width');const h=truth.h_m,A_m2=h*x+5*x*x/8,c_m=(h*x*x/2+5*x**3/12)/A_m2,d_m=(h*h*x/2+.625*x*x*(h+5*x/12))/A_m2;return {A_m2,c_m,d_m,k:(c_m*A_m2-h*x*x/2)/x**3};}
 function vertices(x){ideal(x);return [[0,0],[x,0],[x,truth.h_m+1.25*x],[0,truth.h_m]];}
 function suspension(x,hole){const p=vertices(x);if(!Number.isInteger(hole)||hole<0||hole>2)throw new RangeError('Choose one of three holes');const origin=p[[0,2,3][hole]],c=ideal(x),angle=-Math.PI/2-Math.atan2(c.d_m-origin[1],c.c_m-origin[0]);return {origin,angle,vertices:p.map(([a,b])=>[(a-origin[0])*Math.cos(angle)-(b-origin[1])*Math.sin(angle),(a-origin[0])*Math.sin(angle)+(b-origin[1])*Math.cos(angle)])};}
 function mark(x,hole,error_deg=0){if(!Number.isFinite(error_deg)||Math.abs(error_deg)>5)throw new RangeError('Set square within five degrees');const s=suspension(x,hole),angle=-Math.PI/2-s.angle+(error_deg+(random()-.5)*1.2)*Math.PI/180;return {hole,origin:s.origin.map(v=>v+(random()-.5)*.001),direction:[Math.cos(angle),Math.sin(angle)]};}
 function readDimensions(x){ideal(x);return {h:readInstrument(truth.h_m,{resolution:.001,halfWidth:.0005},random),x:readInstrument(x,{resolution:.001,halfWidth:.0005},random)};}
 function readMark(x,c,d){ideal(x);if(![c,d].every(Number.isFinite)||c<0||c>x||d<0||d>truth.h_m+1.25*c)throw new RangeError('Mark must lie on the card');return {c:readInstrument(c,{resolution:.001,halfWidth:.001},random),d:readInstrument(d,{resolution:.001,halfWidth:.001},random)};}
 return Object.freeze({ideal,vertices,suspension,mark,readDimensions,readMark});
}
