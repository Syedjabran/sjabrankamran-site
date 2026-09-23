import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeCylinderStability(parameters={},seed=2022341){
 const truth={w_m:.3,radius_m:.03,pile_compression_fraction:0,...parameters};if(!Number.isFinite(truth.w_m)||truth.w_m<=.28||!Number.isFinite(truth.radius_m)||truth.radius_m<=.01||!Number.isFinite(truth.pile_compression_fraction)||truth.pile_compression_fraction<0||truth.pile_compression_fraction>=1)throw new RangeError('Invalid board/cylinder geometry');const random=seededRandom(seed);
 function ideal(T){if(!Number.isFinite(T)||T<.001||T>.01)throw new RangeError('Paper pile from 1 to 10 mm');const effective=T*(1-truth.pile_compression_fraction),cos_theta=1-effective/truth.radius_m;return {cos_theta,z_m:truth.w_m*Math.sqrt(1-cos_theta*cos_theta)};}
 function stable(T,z){if(!Number.isFinite(z)||z<0||z>.28)throw new RangeError('Board rise from 0 to 0.28 m');return z<ideal(T).z_m;}
 function readSetup(T){ideal(T);return {t:readInstrument(T,{resolution:.0001,halfWidth:.00005},random),w:readInstrument(truth.w_m,{resolution:.001,halfWidth:.001},random)};}
 function readHeight(z){if(!Number.isFinite(z)||z<0||z>.28)throw new RangeError('Valid board rise required');return readInstrument(z,{resolution:.001,halfWidth:.001},random);}
 return Object.freeze({ideal,stable,readSetup,readHeight});
}
