// 9702_m24_33-q2: vertical frictionless wall, Coulomb floor friction.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function frictionCoefficient(M,S,L,d,theta_deg){
 if(![M,S,L,d,theta_deg].every(Number.isFinite)||M<=0||S<=0||L<=0||d<0||d>L||theta_deg<=0||theta_deg>=90)throw new RangeError('Use positive masses/length, load on rod, and angle between 0 and 90 degrees');
 return (M/2+S*d/L)/((M+S)*Math.tan(theta_deg*Math.PI/180));
}
export function frictionRatio(FA,FB){if(!Number.isFinite(FA)||!Number.isFinite(FB)||FA<0||FB<=0)throw new RangeError('Finite nonnegative FA and positive FB required');return FA/FB;}
export function makeLadderStaticFriction(parameters={},seed=2024332){
 const truth={S_kg:.1,L_thick_m:.44,L_thin_m:.47,dA_m:.1,M_thick_kg:.14,M_thin_kg:.075,mu_s:.3,...parameters};
 if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0)||truth.dA_m>=Math.min(truth.L_thick_m,truth.L_thin_m))throw new RangeError('Invalid strip parameters');
 const random=seededRandom(seed);
 function setup(strip,orientation='A'){if(!['thick','thin'].includes(strip)||!['A','B'].includes(orientation))throw new RangeError('Choose thick/thin strip and end A/B');const L=truth[`L_${strip}_m`],M=truth[`M_${strip}_kg`];return {L,M,d:orientation==='A'?truth.dA_m:L-truth.dA_m};}
 function limitAngle(strip,orientation){const {L,M,d}=setup(strip,orientation);return Math.atan((M/2+truth.S_kg*d/L)/(truth.mu_s*(M+truth.S_kg)))*180/Math.PI;}
 function trial(strip,orientation,base_m){
  const {L,M,d}=setup(strip,orientation);if(!Number.isFinite(base_m)||base_m<=0||base_m>=L)throw new RangeError('Base must be between wall and rod length');
  const top_m=Math.sqrt(L*L-base_m*base_m),theta_deg=Math.atan2(top_m,base_m)*180/Math.PI;
  return {stable:frictionCoefficient(M,truth.S_kg,L,d,theta_deg)<=truth.mu_s+1e-12,theta_deg,base_m,top_m,loadX_m:base_m*(1-d/L),loadY_m:top_m*d/L};
 }
 function readSetup(strip){const {L,M}=setup(strip),ruler=v=>readInstrument(v,{resolution:.001,halfWidth:.001},random);return {l:ruler(L),da:ruler(truth.dA_m),db:ruler(L-truth.dA_m),m_label:readInstrument(M,{resolution:.001},random)};}
 function readAngle(strip,orientation,base_m,{parallax=false}={}){
  const state=trial(strip,orientation,base_m);if(!state.stable)throw new RangeError('Restore a stable strip before reading the limiting angle');
  // Adapted endpoint/alignment scatter, not just the one-degree scale rounding.
  return readInstrument(state.theta_deg,{resolution:1,halfWidth:2,bias:parallax?2:0},random);
 }
 return Object.freeze({limitAngle,trial,readSetup,readAngle});
}
