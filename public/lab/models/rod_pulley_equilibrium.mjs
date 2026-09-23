// 9702_m23_33-q1: torque balance, horizontal string, angle from vertical.
import { seededRandom, readInstrument } from '../lib/measurement.mjs';
export function makeRodPulleyEquilibrium(parameters = {}, seed = 2023331) {
  const truth={L_m:.45,m_end_kg:.1,m_hanger_kg:.1,M_kg:.05,H_m:.55,c_m:.225,...parameters};
  for(const value of Object.values(truth)) if(!Number.isFinite(value)||value<=0)throw new RangeError('Positive finite apparatus parameters required');
  if(truth.H_m<=truth.L_m||truth.c_m>truth.L_m)throw new RangeError('Pivot must exceed rod length; centre must lie on rod');
  const random=seededRandom(seed);
  function equilibrium(r) {
    if(!Number.isFinite(r)||r<.04||r>.36||Math.abs(r/.04-Math.round(r/.04))>1e-9)throw new RangeError('Use a source notch from 0.04 to 0.36 m in 0.04 m steps');
    const theta=Math.atan(truth.m_hanger_kg*r/(truth.m_end_kg*truth.L_m+truth.M_kg*truth.c_m));
    return {theta_deg:theta*180/Math.PI,h_m:truth.H_m-r*Math.cos(theta)};
  }
  function geometry(r) {
    const {theta_deg,h_m}=equilibrium(r),theta=theta_deg*Math.PI/180;
    return {pivotHeight_m:truth.H_m,notchX_m:r*Math.sin(theta),notchHeight_m:h_m,
      endX_m:truth.L_m*Math.sin(theta),endHeight_m:truth.H_m-truth.L_m*Math.cos(theta)};
  }
  function alignment(r,pulleyHeight) {
    if(!Number.isFinite(pulleyHeight)||pulleyHeight<.2||pulleyHeight>.55)throw new RangeError('Pulley setting must lie within 0.20–0.55 m');
    const error=pulleyHeight-equilibrium(r).h_m;
    return Math.abs(error)<=.001?'horizontal':error>0?'pulley too high':'pulley too low';
  }
  function read(r,pulleyHeight,{parallax=false}={}) {
    if(alignment(r,pulleyHeight)!=='horizontal')throw new RangeError('Level the string before reading');
    const state=equilibrium(r),ruler=value=>readInstrument(value,{resolution:.001,halfWidth:.001,bias:parallax ? .001 : 0},random);
    return {h:ruler(truth.H_m),h_2:ruler(state.h_m),l:ruler(truth.L_m),
      theta:readInstrument(state.theta_deg,{resolution:1,halfWidth:.5,bias:parallax?1:0},random)};
  }
  return Object.freeze({equilibrium,geometry,alignment,read});
}
// Inference operates only on student-supplied gradient and measured rod length.
export function inferRodMass(gradient_per_m,length_m,N_kg) {
  if(!Number.isFinite(gradient_per_m)||gradient_per_m>=0||!Number.isFinite(length_m)||length_m<=0||!Number.isFinite(N_kg)||N_kg<=0)
    throw new RangeError('Use a negative gradient and positive finite length and N');
  return N_kg*(-1/(gradient_per_m*length_m)-1);
}
