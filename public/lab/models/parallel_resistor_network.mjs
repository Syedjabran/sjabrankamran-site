import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeParallelResistors(parameters={},seed=2021331){
 const truth={E_V:3,Z_ohm:10,r_internal_ohm:0,tolerance:.05,meter_halfwidth_A:.00005,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>=0)||truth.E_V===0||truth.tolerance>.05)throw new RangeError('Invalid circuit parameters');const parts=[33,47,56,68,82],partRandom=seededRandom(seed),random=seededRandom(seed+1),real=new Map(parts.map(R=>[R,R*(1+(2*partRandom()-1)*truth.tolerance)]));
 function validate(R1,R2){if(!parts.includes(R1)||!parts.includes(R2)||R1===R2)throw new RangeError('Select two different resistor parts');}
 function solve(R1,R2){const Rp_ohm=R1*R2/(R1+R2);return {Rp_ohm,I_A:truth.E_V/(truth.Z_ohm+Rp_ohm+truth.r_internal_ohm)};}
 function ideal(R1,R2){validate(R1,R2);return solve(R1,R2);}
 function infer(P,Q){if(!Number.isFinite(P)||P<=0||!Number.isFinite(Q))throw new RangeError('Finite intercept and positive slope required');return {E_V:1/P,Z_ohm:Q/P};}
 function readCurrent(R1,R2,closed){validate(R1,R2);return readInstrument(closed?solve(real.get(R1),real.get(R2)).I_A:0,{resolution:.0001,halfWidth:closed?truth.meter_halfwidth_A:0},random);}
 return Object.freeze({ideal,infer,readCurrent});
}
