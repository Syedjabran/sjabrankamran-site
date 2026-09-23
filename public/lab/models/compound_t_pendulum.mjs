// 9702_m24_33-q1: loads move symmetrically; central pivot never moves.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function makeCompoundTPendulum(parameters = {}, seed = 2024331) {
 const truth={L_m:.4,m_load_kg:.05,m_cross_kg:.05,m_stem_kg:.05,g:9.81,...parameters};
 if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive finite pendulum parameters required');
 const random=seededRandom(seed);
 function validate(x){if(!Number.isFinite(x)||x<.05-1e-12||x>.19+1e-12||Math.abs((x-.05)/.02-Math.round((x-.05)/.02))>1e-9)throw new RangeError('Choose a source hole from 0.05 to 0.19 m in 0.02 m steps');}
 function omegaSquared(x){validate(x);const I0=truth.m_cross_kg*truth.L_m**2/12+truth.m_stem_kg*truth.L_m**2/3;return truth.m_stem_kg*truth.g*truth.L_m/2/(I0+2*truth.m_load_kg*x*x);}
 function smallAnglePeriod(x){return 2*Math.PI/Math.sqrt(omegaSquared(x));}
 function createMotion(x,amplitude_deg){
  const w2=omegaSquared(x);if(!Number.isFinite(amplitude_deg)||amplitude_deg<2||amplitude_deg>8)throw new RangeError('Release amplitude must be 2–8 degrees');
  let theta=amplitude_deg*Math.PI/180,velocity=0,elapsed=0;
  const snapshot=()=>({angle_deg:theta*180/Math.PI,velocity_deg_s:velocity*180/Math.PI,elapsed_s:elapsed});
  function advance(seconds){
   if(!Number.isFinite(seconds)||seconds<=0||seconds>60)throw new RangeError('Advance by 0–60 seconds, excluding zero');
   // Fixed upper step for frame-rate-independent nonlinear ODE integration.
   // No damping value is specified: use the undamped ideal limit explicitly.
   const steps=Math.ceil(seconds/.002),dt=seconds/steps,acc=q=>-w2*Math.sin(q);
   for(let i=0;i<steps;i++){
    const a1=velocity,b1=acc(theta),a2=velocity+dt*b1/2,b2=acc(theta+dt*a1/2),a3=velocity+dt*b2/2,b3=acc(theta+dt*a2/2),a4=velocity+dt*b3,b4=acc(theta+dt*a3);
    theta+=dt*(a1+2*a2+2*a3+a4)/6;velocity+=dt*(b1+2*b2+2*b3+b4)/6;
   }
   elapsed+=seconds;return snapshot();
  }
  return Object.freeze({snapshot,advance});
 }
 function readPosition(x,{parallax=false}={}){validate(x);return readInstrument(x,{resolution:.001,halfWidth:.001,bias:parallax ? .002 : 0},random);}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive elapsed time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({smallAnglePeriod,createMotion,readPosition,readElapsed});
}
