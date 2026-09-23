import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeVariablePivotRod(parameters={},seed=2025341){
 const truth={M:.15,Mrod:.04,g:9.81,mass_arm:.225,rod_arm:.24,ks:25,hyp0:.51,C0:.02,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive spring and rod parameters');const random=seededRandom(seed),holes=[.26,.29,.32,.35,.38,.41,.44,.47];
 function validateW(W){if(!holes.some(x=>Math.abs(x-W)<1e-9))throw new RangeError('Select one of eight pivot holes');}
 function Z(W,N){if(![W,N].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive separations');return W/Math.hypot(W,N);}
 function spring(hyp){if(!Number.isFinite(hyp)||hyp<truth.hyp0)throw new RangeError('Taut spring required');return {L_m:truth.C0+hyp-truth.hyp0,F_N:truth.ks*(hyp-truth.hyp0)};}
 function loadMoment(W){return truth.g*(truth.M*(W-truth.mass_arm)+truth.Mrod*(W-truth.rod_arm));}
 function ideal(W){validateW(W);const load=loadMoment(W),res=h=>spring(h).F_N*Math.sqrt(h*h-W*W)/h*W-load;let lo=Math.max(W,truth.hyp0),hi=lo+.1;while(res(hi)<0)hi*=2;for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(res(mid)>0)hi=mid;else lo=mid;}const hyp=(lo+hi)/2,N=Math.sqrt(hyp*hyp-W*W);return {N_m:N,L_m:spring(hyp).L_m,Z:Z(W,N),torque_residual_Nm:res(hyp)};}
 function state(W,N){validateW(W);if(!Number.isFinite(N)||N<.30||N>.50)throw new RangeError('Upper nail 0.30–0.50 m above pivot');const hyp=truth.hyp0/(1-loadMoment(W)/(truth.ks*W*N)),sine=(hyp*hyp-W*W-N*N)/(2*W*N);if(Math.abs(sine)>=1)throw new RangeError('No supported equilibrium');const angle=Math.asin(sine);return {angle_rad:angle,hyp_m:hyp,L_m:spring(hyp).L_m,s_x_m:-W*Math.cos(angle),s_y_m:-W*Math.sin(angle),level:Math.abs(angle)<=.15*Math.PI/180};}
 function read(W,N){const s=state(W,N);return {w:readInstrument(W,{resolution:.001,halfWidth:.001},random),n:readInstrument(N,{resolution:.001,halfWidth:.001},random),l:readInstrument(s.L_m,{resolution:.001,halfWidth:.001},random)};}
 return Object.freeze({ideal,Z,spring,state,read});
}
