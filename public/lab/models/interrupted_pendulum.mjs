import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeInterruptedPendulum(parameters={},seed=2025341){
 const truth={g:9.81,...parameters};if(!Number.isFinite(truth.g)||truth.g<=0)throw new RangeError('Positive gravity required');const random=seededRandom(seed);
 function ideal(L1,L2){if(![L1,L2].every(v=>Number.isFinite(v)&&v>0)||L1<=L2)throw new RangeError('Require L1 > L2 > 0');return {T_s:Math.PI*(Math.sqrt(L1/truth.g)+Math.sqrt(L2/truth.g))};}
 function gravityFromSlope(a){if(!Number.isFinite(a)||a<=0)throw new RangeError('Positive slope required');return (Math.PI/a)**2;}
 function shortAmplitude(L1,L2,A){ideal(L1,L2);if(!Number.isFinite(A)||A<2||A>6)throw new RangeError('Release angle 2–6 degrees');return A*Math.sqrt(L1/L2);}
 function motion(L1,L2,A,t){const T=ideal(L1,L2).T_s,B=shortAmplitude(L1,L2,A);if(B>10)throw new RangeError('Reduce release angle: short side must remain within 10 degrees');if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');const w1=Math.sqrt(truth.g/L1),w2=Math.sqrt(truth.g/L2),q1=Math.PI/(2*w1),half2=Math.PI/w2,phase=t%T;let angle,velocity,length,side;
 if(phase<q1){angle=-A*Math.cos(w1*phase);velocity=A*w1*Math.sin(w1*phase);length=L1;side='long';}
 else if(phase<q1+half2){const u=phase-q1;angle=B*Math.sin(w2*u);velocity=B*w2*Math.cos(w2*u);length=L2;side='short';}
 else{const u=phase-q1-half2;angle=-A*Math.sin(w1*u);velocity=-A*w1*Math.cos(w1*u);length=L1;side='long';}
 const rad=angle*Math.PI/180;return {angle_deg:angle,tangential_speed_m_s:length*velocity*Math.PI/180,side,bob_x_m:length*Math.sin(rad),bob_y_m:(side==='short'?L1-L2:0)+length*Math.cos(rad)};}
 function readLengths(L1,L2){ideal(L1,L2);return {l1:readInstrument(L1,{resolution:.001,halfWidth:.001},random),l2:readInstrument(L2,{resolution:.001,halfWidth:.001},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive timing required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({ideal,gravityFromSlope,shortAmplitude,motion,readLengths,readElapsed});
}
