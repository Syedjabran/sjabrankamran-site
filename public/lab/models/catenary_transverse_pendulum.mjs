// Continuous inextensible chain rotates about its fixed support-to-support axis.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeCatenaryPendulum(parameters={},seed=2021341){
 const truth={contour_length_m:.85,g:9.81,quadrature_intervals:4000,...parameters};
 if(!Number.isFinite(truth.contour_length_m)||truth.contour_length_m<=0||!Number.isFinite(truth.g)||truth.g<=0||!Number.isInteger(truth.quadrature_intervals)||truth.quadrature_intervals<20||truth.quadrature_intervals%2)throw new RangeError('Positive chain parameters and even quadrature count required');
 const random=seededRandom(seed),cache=new Map();
 function periodFromEffectiveLength(L){if(!Number.isFinite(L)||L<=0)throw new RangeError('Positive effective length required');return 2*Math.PI*Math.sqrt(L/truth.g);}
 function fromU(u){if(!Number.isFinite(u)||u<=0||u>10)throw new RangeError('Use positive finite catenary u ≤ 10');const a_m=truth.contour_length_m/(2*Math.sinh(u)),C_m=a_m*(Math.cosh(u)-1),N=truth.quadrature_intervals,h=2*u/N;let I=0,G=0;
  for(let i=0;i<=N;i++){const v=-u+i*h,z=a_m*(Math.cosh(u)-Math.cosh(v)),ds=a_m*Math.cosh(v),w=i===0||i===N?1:i%2?4:2;I+=w*z*z*ds;G+=w*z*ds;}
  const effective_length_m=I/G;return {a_m,C_m,separation_m:2*a_m*u,effective_length_m,T_s:periodFromEffectiveLength(effective_length_m)};
 }
 function configuration(separation){if(!Number.isFinite(separation)||separation<=0||separation>=truth.contour_length_m)throw new RangeError('Separation must lie inside the contour length');if(cache.has(separation))return {...cache.get(separation).result};let lo=1e-8,hi=10;
  for(let i=0;i<70;i++){const u=(lo+hi)/2,s=truth.contour_length_m*u/Math.sinh(u);if(s>separation)lo=u;else hi=u;}
  const u=(lo+hi)/2,result=fromU(u);if(result.C_m<=.15||result.C_m>=.40)throw new RangeError('Adjust supports to keep 0.15 < sag < 0.40 m');cache.set(separation,{u,result});return {...result};
 }
 function shape(separation,angle_deg=0){configuration(separation);const {u,result}=cache.get(separation),a=result.a_m,theta=angle_deg*Math.PI/180;if(!Number.isFinite(angle_deg)||Math.abs(angle_deg)>8)throw new RangeError('Small out-of-plane angle required');return Array.from({length:41},(_,i)=>{const v=-u+2*u*i/40,z=a*(Math.cosh(u)-Math.cosh(v));return {x_m:a*v,down_m:z*Math.cos(theta),out_m:z*Math.sin(theta)};});}
 function angle(separation,A,t){if(!Number.isFinite(A)||A<2||A>8||!Number.isFinite(t)||t<0)throw new RangeError('Amplitude 2–8° and nonnegative time required');return A*Math.cos(2*Math.PI*t/configuration(separation).T_s);}
 function readGeometry(s){const c=configuration(s);return {c:readInstrument(c.C_m,{resolution:.001,halfWidth:.001},random),separation:readInstrument(s,{resolution:.001,halfWidth:.001},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({periodFromEffectiveLength,fromU,configuration,shape,angle,readGeometry,readElapsed});
}
