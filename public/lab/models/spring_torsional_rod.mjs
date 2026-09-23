import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeSpringTorsionalRod(parameters={},seed=20213312){
 const truth={ks_N_m:25,Lrod_m:.6,d_m:.28,Mrod_kg:.018,gamma_s_inv:.04,...parameters};
 if(!Object.values(truth).every(Number.isFinite)||truth.Mrod_kg<0||truth.gamma_s_inv<0||['ks_N_m','Lrod_m','d_m'].some(k=>truth[k]<=0))throw new RangeError('Invalid rod parameters');
 const random=seededRandom(seed);
 function period(b){if(![.1,.2].includes(b))throw new RangeError('Choose b=0.10 or 0.20 m');return 2*Math.PI*Math.sqrt((.3*truth.d_m**2+truth.Mrod_kg*truth.Lrod_m**2/12)/(truth.ks_N_m*b*b));}
 function angle(b,A,t){if(!Number.isFinite(A)||A<1||A>5||!Number.isFinite(t)||t<0)throw new RangeError('Small release angle and nonnegative time required');return A*Math.exp(-truth.gamma_s_inv*t)*Math.cos(2*Math.PI*t/period(b));}
 function levelError(offset_mm){if(!Number.isFinite(offset_mm)||Math.abs(offset_mm)>10)throw new RangeError('Level adjustment must be ±10 mm');return Math.atan2(offset_mm/1000,truth.d_m)*180/Math.PI;}
 function readGeometry(b){period(b);return {b:readInstrument(b,{resolution:.001,halfWidth:.001},random),d:readInstrument(truth.d_m,{resolution:.001,halfWidth:.002},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive elapsed time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({period,angle,levelError,readGeometry,readElapsed});
}
