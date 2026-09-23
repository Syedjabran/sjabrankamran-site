import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeRollingPendulum(parameters={},seed=2025331){
 const truth={L:.375,S:.4,g:9.81,theta0:.411516846067488,bob_radius:.015,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0)||truth.theta0>=Math.PI/2)throw new RangeError('Positive rolling geometry required');const random=seededRandom(seed);
 let a=1,b=Math.cos(truth.theta0/2);for(let i=0;i<20;i++){const c=(a+b)/2;b=Math.sqrt(a*b);a=c;}const amplitudeFactor=1/a;
 function ideal(h){if(!Number.isFinite(h)||h<.1||h>.38||h>=truth.S)throw new RangeError('Height 0.10–0.38 m below board length');const A=28*Math.PI**2*truth.L/(5*truth.g),Tsmall=Math.sqrt(A*truth.S/h);return {A_s2:A,Tsmall_s:Tsmall,T_s:Tsmall*amplitudeFactor,T_ratio_to_h22:Math.sqrt(.22/h)};}
 function motion(h,t){const s=ideal(h);if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');let u=(t%s.T_s)*Math.sqrt(5*truth.g*h/(7*truth.L*truth.S)),q=-truth.theta0,v=0;while(u>1e-12){const d=Math.min(.01,u),f=q=>-Math.sin(q),a1=f(q),v2=v+d*a1/2,a2=f(q+d*v/2),v3=v+d*a2/2,a3=f(q+d*v2/2),v4=v+d*a3,a4=f(q+d*v3);q+=d*(v+2*v2+2*v3+v4)/6;v+=d*(a1+2*a2+2*a3+a4)/6;u-=d;}return {angle_rad:q,x_m:truth.L*Math.sin(q),y_m:truth.L*Math.cos(q),spin_rad:truth.L*(q+truth.theta0)/truth.bob_radius,direction:v>=0?'right':'left'};}
 function readLengths(h){ideal(h);return {s:readInstrument(truth.S,{resolution:.001,halfWidth:.001},random),l:readInstrument(truth.L,{resolution:.001,halfWidth:.001},random),h:readInstrument(h,{resolution:.001,halfWidth:.001},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive timing required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,motion,readLengths,readElapsed});
}
