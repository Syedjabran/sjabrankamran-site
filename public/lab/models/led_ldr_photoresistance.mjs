// PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS.
import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makePhotoresistance(parameters={},seed=2025332){
 const truth={E:3,F:33,rwire:20,Iref:.02,Vref:1.9,nVT:.06,Rref:800,dref:.03,ambient:.1,gamma:.75,tau:.2,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive device parameters required');const random=seededRandom(seed);
 function resistance(J){if(!Number.isFinite(J)||J<=0)throw new RangeError('Positive relative irradiance');return truth.Rref*J**(-truth.gamma);}
 function wavelength(k){if(!Number.isFinite(k)||k<=0)throw new RangeError('Positive band-gap voltage');return 6.63e-34*3e8/(1.60e-19*k);}
 function ideal(L,d=.03,angle=0,on=true){if(!Number.isFinite(L)||L<.1||L>.9||!Number.isFinite(d)||d<=0||!Number.isFinite(angle)||angle<0||angle>20||typeof on!=='boolean')throw new RangeError('Wire 0.10–0.90 m, positive gap, angle 0–20°');if(!on)return {I_A:0,V_V:0,R_ohm:resistance(truth.ambient),k_V:null};const series=truth.F+truth.rwire*L;let lo=Number.MIN_VALUE,hi=truth.E/series;for(let i=0;i<100;i++){const mid=(lo+hi)/2,f=mid*series+truth.Vref+truth.nVT*Math.log(mid/truth.Iref)-truth.E;if(f>0)hi=mid;else lo=mid;}const I=(lo+hi)/2,V=truth.E-I*series,J=truth.ambient+(I/truth.Iref)*(truth.dref/d)**2*Math.cos(angle*Math.PI/180),R=resistance(J);return {I_A:I,V_V:V,R_ohm:R,k_V:V-1000*d/R};}
 function createResponse(){let R=resistance(truth.ambient);return Object.freeze({advance(dt,L,d,angle,on){if(!Number.isFinite(dt)||dt<0||dt>60)throw new RangeError('Step up to 60 s');const target=ideal(L,d,angle,on);R=target.R_ohm+(R-target.R_ohm)*Math.exp(-dt/truth.tau);return {V_V:target.V_V,R_ohm:R};}});}
 function readGeometry(L){ideal(L);return {l:readInstrument(L,{resolution:.001,halfWidth:.001},random),d:readInstrument(.03,{resolution:.001,halfWidth:.002},random)};}
 function readMeters(s){if(!Number.isFinite(s.V_V)||!Number.isFinite(s.R_ohm))throw new RangeError('Valid device state');return {v:readInstrument(s.V_V,{resolution:.01,halfWidth:.005},random),r:readInstrument(s.R_ohm,{resolution:10,halfWidth:5},random)};}
 return Object.freeze({ideal,resistance,wavelength,createResponse,readGeometry,readMeters});
}
