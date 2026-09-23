// 9702_m23_33-q2: empirical paper-specific optical calibration; lengths in cm.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function focalLengthFromReadings(u_cm, v_cm) {
  if (![u_cm,v_cm].every(v=>Number.isFinite(v)&&v>0)) throw new RangeError('Positive distances in cm required');
  return u_cm*v_cm/(u_cm+v_cm);
}
export function makeLensInSolution(parameters = {}, seed = 2023332) {
  const truth={f_air_cm:5,beta:.4,blur_gain:80,...parameters};
  if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive finite optical parameters required');
  const random=seededRandom(seed);
  function calibration(C){
    if(![0,.18,.33].includes(C))throw new RangeError('Choose dry lens or a source solution');
    // C=0 denotes the dry-lens baseline, NOT n(0) of the empirical solution law.
    if(C===0)return {f_cm:truth.f_air_cm};
    const n=1.31+truth.beta*C,denominator=.553-.333*n;
    if(denominator<=0)throw new RangeError('Solution lies outside empirical calibration');
    return {n,f_cm:n/denominator};
  }
  function validate(C,u,v){calibration(C);if(!Number.isFinite(u)||u<3||u>80||!Number.isFinite(v)||v<39||v>41)throw new RangeError('Use u=3–80 cm and v=39–41 cm');}
  function image(C,u,v){
    validate(C,u,v);const {f_cm}=calibration(C);
    const defocus=Math.abs(1/f_cm-1/u-1/v);
    return {real:u>f_cm,blur:truth.blur_gain*defocus};
  }
  function read(C,u,v,{parallax=false}={}){
    validate(C,u,v);
    const ruler=value=>readInstrument(value,{resolution:.1,halfWidth:.1,bias:parallax ? .2 : 0},random);
    // Focusing error is the student's choice of u, not extra random displacement.
    return {C,u0:C===0?ruler(u):null,u:C===0?null:ruler(u),v:ruler(v)};
  }
  return Object.freeze({calibration,image,read});
}
