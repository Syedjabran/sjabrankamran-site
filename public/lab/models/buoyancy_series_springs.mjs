import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeBuoyancySprings(parameters={},seed=2022332){
 const truth={k1:25,k2:25,rho_steel:7800,Lfree_m:.05,nut_masses_kg:[.06,.13],rho_oil:910,clip_mass_kg:0,g:9.81,...parameters};if(!['k1','k2','rho_steel','Lfree_m','rho_oil','g'].every(k=>Number.isFinite(truth[k])&&truth[k]>0)||truth.rho_oil>=truth.rho_steel||!Number.isFinite(truth.clip_mass_kg)||truth.clip_mass_kg<0)throw new RangeError('Invalid buoyancy apparatus');const random=seededRandom(seed),Keq=1/(1/truth.k1+1/truth.k2);
 function ideal(M){if(!Number.isFinite(M)||M<=0)throw new RangeError('Positive nut mass required');const V_m3=M/truth.rho_steel;return {V_m3,deltaL_m:truth.rho_oil*truth.g*V_m3/Keq};}
 function calibration(increment){if(!Number.isFinite(increment)||increment<=0)throw new RangeError('Positive calibration increment required');return {deltaL_m:increment*truth.g/Keq,Keq_N_m:Keq};}
 function mass(load){if(load==='cal100')return .1;if(load==='cal200')return .2;if(load==='M12')return truth.nut_masses_kg[0];if(load==='M16')return truth.nut_masses_kg[1];throw new RangeError('Choose calibration load or nut set');}
 function length(load,immersed=false){const M=mass(load);if(immersed&&!['M12','M16'].includes(load))throw new RangeError('Calibrate in air');return truth.Lfree_m+((M+truth.clip_mass_kg)*truth.g-(immersed?truth.rho_oil*truth.g*ideal(M).V_m3:0))/Keq;}
 function readLength(load,immersed=false){return readInstrument(length(load,immersed),{resolution:.001,halfWidth:.002},random);}
 function readMass(load){if(!['M12','M16'].includes(load))throw new RangeError('Weigh the nut sets');return readInstrument(mass(load),{resolution:.0001,halfWidth:.00005},random);}
 return Object.freeze({ideal,calibration,length,readLength,readMass});
}
