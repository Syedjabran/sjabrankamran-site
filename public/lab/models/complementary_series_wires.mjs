import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function inferResistivityRatio(P,L,Q){if(![P,L,Q].every(Number.isFinite)||L<=0||Q<=0)throw new RangeError('Finite gradient, positive length and intercept required');return 1+P*L/Q;}
export function makeComplementarySeriesWires(parameters={},seed=20213311){
 const truth={L_m:.65,E_V:1.5,rA_ohm_m:25,rB_ohm_m:10,r_contact_ohm:0,...parameters};
 if(!Object.values(truth).every(Number.isFinite)||truth.r_contact_ohm<0||['L_m','E_V','rA_ohm_m','rB_ohm_m'].some(k=>truth[k]<=0))throw new RangeError('Invalid circuit parameters');
 const random=seededRandom(seed),contact=.3+.4*random();
 function current(x,closed=true,poorContact=false){if(!Number.isFinite(x)||x<.05||x>.62||x>truth.L_m||typeof closed!=='boolean')throw new RangeError('Use x=0.05–0.62 m and boolean switch');return closed?truth.E_V/(truth.rA_ohm_m*x+truth.rB_ohm_m*(truth.L_m-x)+truth.r_contact_ohm+(poorContact?contact:0)):0;}
 function read(x,closed,{poorContact=false}={}){const I=current(x,closed,poorContact),overrange=I>.2;return {l:readInstrument(truth.L_m,{resolution:.001,halfWidth:.001},random),x:readInstrument(x,{resolution:.001,halfWidth:.001},random),i:overrange?null:closed?readInstrument(I,{resolution:.0001,halfWidth:.0001},random):0,overrange};}
 return Object.freeze({current,read});
}
