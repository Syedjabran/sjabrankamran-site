// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
// Exact integration of the specified constant-Cd ODE, not Stokes' law.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeConfinedBall(parameters={},seed=2025342){
 const truth={D_m:.006,rho_steel:7800,rho_water:1000,Cd:.8,g:9.81,marker_distance_m:.65,upper_marker_from_top_m:.06,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0)||truth.rho_steel<=truth.rho_water)throw new RangeError('Invalid sinking-ball parameters');const random=seededRandom(seed);
 function blockage(D,d){if(![D,d].every(v=>Number.isFinite(v)&&v>0)||d>=D)throw new RangeError('Ball must fit inside tube');return (1-(d/D)**2)**-2;}
 function ideal(d){if(![.004,.005].includes(d))throw new RangeError('Choose 4 or 5 mm ball');const block=blockage(truth.D_m,d),volume=Math.PI*d**3/6,area=Math.PI*d*d/4,force=(truth.rho_steel-truth.rho_water)*volume*truth.g,terminal_speed_m_s=Math.sqrt(2*force/(truth.rho_water*truth.Cd*area*block));return {blockage_multiplier:block,terminal_speed_m_s,terminal_65cm_time_s:truth.marker_distance_m/terminal_speed_m_s};}
 function state(d,t){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');const vt=ideal(d).terminal_speed_m_s,a=(1-truth.rho_water/truth.rho_steel)*truth.g,u=a*t/vt,logcosh=u+Math.log1p(Math.exp(-2*u))-Math.log(2);return {z_m:vt*vt/a*logcosh,v_m_s:vt*Math.tanh(u)};}
 function timeTo(d,z){if(!Number.isFinite(z)||z<0)throw new RangeError('Nonnegative marker depth');const vt=ideal(d).terminal_speed_m_s,a=(1-truth.rho_water/truth.rho_steel)*truth.g,u=a*z/(vt*vt);return vt/a*(u+Math.log1p(Math.sqrt(-Math.expm1(-2*u))));}
 function markerTime(d){return timeTo(d,truth.upper_marker_from_top_m+truth.marker_distance_m)-timeTo(d,truth.upper_marker_from_top_m);}
 function readDiameters(d,squeeze=false){ideal(d);return {d:readInstrument(truth.D_m,{resolution:.0001,halfWidth:.00005,bias:squeeze?-.00015:0},random),d_2:readInstrument(d,{resolution:.0001,halfWidth:.00005},random)};}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive elapsed time required');return readInstrument(t,{resolution:.1},random);}
 return Object.freeze({blockage,ideal,state,timeTo,markerTime,readDiameters,readElapsed});
}
