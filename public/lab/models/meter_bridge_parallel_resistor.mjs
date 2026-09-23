import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeParallelMeterBridge(parameters={},seed=2023341){
 const truth={P_ohm:680,Q_ohm:1000,E_V:1.5,L_m:1,tolerance:.01,...parameters};if(!['P_ohm','Q_ohm','E_V','L_m'].every(k=>Number.isFinite(truth[k])&&truth[k]>0)||!Number.isFinite(truth.tolerance)||truth.tolerance<0||truth.tolerance>.05)throw new RangeError('Invalid bridge parameters');const parts=[4700,3300,2200,1000,680,470,330,220],partRandom=seededRandom(seed),random=seededRandom(seed+1),vary=r=>r*(1+(2*partRandom()-1)*truth.tolerance),P=vary(truth.P_ohm),Q=vary(truth.Q_ohm),resistors=new Map(parts.map(r=>[r,vary(r)]));
 function validate(R,a=.5){if(!parts.includes(R)||!Number.isFinite(a)||a<.05||a>.95||a>=truth.L_m)throw new RangeError('Use a source resistor and contact a=0.05–0.95 m');}
 function solve(R,P,Q){const Z=Q*R/(Q+R),a_m=truth.L_m*Z/(Z+P);return {a_m,b_over_a:(truth.L_m-a_m)/a_m};}
 function ideal(R){validate(R);return solve(R,truth.P_ohm,truth.Q_ohm);}
 function voltage(R,a,{nominal=false}={}){validate(R,a);const nullA=nominal?ideal(R).a_m:solve(resistors.get(R),P,Q).a_m;return truth.E_V*(a-nullA)/truth.L_m;}
 function readVoltage(R,a,closed){return readInstrument(closed?voltage(R,a):0,{resolution:.001,halfWidth:closed?.00025:0},random);}
 function readLengths(R,a){validate(R,a);return {a:readInstrument(a,{resolution:.001,halfWidth:.0005},random),b:readInstrument(truth.L_m-a,{resolution:.001,halfWidth:.0005},random)};}
 return Object.freeze({ideal,voltage,readVoltage,readLengths});
}
