// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
// Suggested empirical geometry scaling, not derived bulk elasticity.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeFoamRingCompression(parameters={},seed=2021342){
 const truth={A_m:.13,B_m:.46,Kmat_N:35,D1_large:.022,D2_large:.055,D1_small:.015,D2_small:.04,h1_large:.061,h1_small:.046,...parameters};
 if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0)||truth.D1_large>=truth.D2_large||truth.D1_small>=truth.D2_small)throw new RangeError('Invalid provisional ring geometry');
 const random=seededRandom(seed);
 function compression(D1,D2,F){if(![D1,D2,F].every(Number.isFinite)||D1<=0||D2<=D1||F<0)throw new RangeError('Physical annulus and nonnegative force required');return F*D2**3/(truth.Kmat_N*(D2**2-D1**2));}
 function ring(name){if(!['large','small'].includes(name))throw new RangeError('Choose large or small ring');return {D1:truth[`D1_${name}`],D2:truth[`D2_${name}`],h1:truth[`h1_${name}`]};}
 function geometry(name,loaded){if(typeof loaded!=='boolean')throw new RangeError('Boolean load state required');const r=ring(name),y=compression(r.D1,r.D2,loaded?.100*9.81*truth.B_m/truth.A_m:0);return {outer_m:r.D2,inner_m:r.D1,compression_m:y,top_m:r.h1-y};}
 const ruler=v=>readInstrument(v,{resolution:.001,halfWidth:.001},random);
 function caliper(v,squeeze){return readInstrument(v,{resolution:.0001,halfWidth:.0001,bias:squeeze?-.0003:0},random);}
 function readInitial(name,{squeeze=false}={}){const r=ring(name);return {d1:ruler(r.D1),d2:readInstrument(r.D2,{resolution:.001,halfWidth:.002},random),a:ruler(truth.A_m),b:ruler(truth.B_m),h1:caliper(r.h1,squeeze)};}
 function readLoaded(name,{squeeze=false}={}){return {h2:caliper(geometry(name,true).top_m,squeeze)};}
 return Object.freeze({compression,geometry,readInitial,readLoaded});
}
