// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
// Circular-plate lubrication and laminar-nozzle surrogates, not calibrated square-block/syringe mechanics.
import {seededRandom,readInstrument,quantize} from '../lib/measurement.mjs';
export function makeLiquidAdhesionDrainage(parameters={},seed=2022342){
 const truth={W_N:.15,Rdisk_m:.015,gap_m:.00025,Fcap_N:.5,water_mu:.001,oil_mu:.02,water_rho:1000,oil_rho:910,nozzle_radius_m:.00065,nozzle_length_m:.01,barrel_area_m2:.00015,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive surrogate parameters required');const random=seededRandom(seed);
 function fluid(liquid){if(!['water','oil'].includes(liquid))throw new RangeError('Choose water or oil');return {mu:truth[liquid+'_mu'],rho:truth[liquid+'_rho']};}
 function adhesion(liquid,speed){const {mu}=fluid(liquid);if(!Number.isFinite(speed)||speed<.0001||speed>.001)throw new RangeError('Pull speed 0.0001–0.001 m/s');return truth.Fcap_N+3*Math.PI*mu*truth.Rdisk_m**4*speed/(2*truth.gap_m**3);}
 function tau(liquid){const {mu,rho}=fluid(liquid),Rh=8*mu*truth.nozzle_length_m/(Math.PI*truth.nozzle_radius_m**4);return Rh*truth.barrel_area_m2/(rho*9.81);}
 function drainTime(liquid){return tau(liquid)*Math.log(10);}
 function volume(liquid,t){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');return 11*Math.exp(-t/tau(liquid));}
 function readWeight(){return readInstrument(truth.W_N,{resolution:.1,halfWidth:.025},random);}
 function readPeak(liquid,speed){return readInstrument(truth.W_N+adhesion(liquid,speed),{resolution:.1,halfWidth:.2},random);}
 function readVolume(liquid,t){return quantize(volume(liquid,t),.1);}
 function readTime(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({adhesion,drainTime,volume,readVolume,readWeight,readPeak,readTime});
}
