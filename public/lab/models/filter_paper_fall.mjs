import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeFilterPaperFall(parameters={},seed=2021332){
 const truth={areal_density_kg_m2:.08,rho_air:1.2,Cd:1.2,g:9.81,height_m:1,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive paper/air parameters required');const random=seededRandom(seed);
 function ideal(n,d,tilt_deg=0){if(!((n===6&&d===.11)||(n===2&&d===.18))||!Number.isFinite(tilt_deg)||Math.abs(tilt_deg)>20)throw new RangeError('Use a source stack and tilt within 20 degrees');const area=Math.PI*d*d/4,mass_kg=n*truth.areal_density_kg_m2*area,beta_per_m=.5*truth.rho_air*truth.Cd*area*Math.cos(tilt_deg*Math.PI/180)/mass_kg;return {mass_kg,beta_per_m};}
 function fallTime(n,d,tilt_deg=0){const beta=ideal(n,d,tilt_deg).beta_per_m,u=beta*truth.height_m;return (u+Math.log1p(Math.sqrt(-Math.expm1(-2*u))))/Math.sqrt(truth.g*beta);}
 function state(n,d,t,tilt_deg=0){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');const beta=ideal(n,d,tilt_deg).beta_per_m,u=Math.sqrt(truth.g*beta)*t,z=(u+Math.log1p(Math.exp(-2*u))-Math.log(2))/beta;return {drop_m:Math.min(truth.height_m,z),fraction:Math.min(1,z/truth.height_m),landed:z>=truth.height_m};}
 function readStack(n,d){const s=ideal(n,d);return {d:readInstrument(d,{resolution:.001,halfWidth:.001},random),m:readInstrument(s.mass_kg,{resolution:.0001,halfWidth:.00005},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive timing required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,fallTime,state,readStack,readElapsed});
}
