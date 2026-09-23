import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeRCDischarge(parameters={},seed=2022341){
 const truth={C_F:47e-6,RF_ohm:220000,V0_V:6,Rmeter_ohm:1e7,...parameters};
 if(![truth.C_F,truth.RF_ohm,truth.V0_V].every(v=>Number.isFinite(v)&&v>0)||!(truth.Rmeter_ohm>0)||truth.V0_V<=.8)throw new RangeError('Invalid RC parameters');
 const resistors=[470000,330000,220000,150000,100000,47000,33000,22000];
 function resistance(R){if(!resistors.includes(R))throw new RangeError('Choose a source resistor');return 1/(1/R+1/truth.RF_ohm+1/truth.Rmeter_ohm);}
 function voltage(R,t){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');return truth.V0_V*Math.exp(-t/(truth.C_F*resistance(R)));}
 function thresholdTime(R){return truth.C_F*resistance(R)*Math.log(truth.V0_V/.8);}
 function readVoltage(R,t){voltage(R,t);const tick=Math.floor(t*10+1e-9),sampleTime=tick/10,random=seededRandom((seed^R^Math.imul(tick,2654435761))>>>0);return Math.max(0,readInstrument(voltage(R,sampleTime),{resolution:.01,halfWidth:.005},random));}
 function readElapsed(t){if(!Number.isFinite(t)||t<=0)throw new RangeError('Positive timing required');return readInstrument(t,{resolution:.1},seededRandom(seed));}
 return Object.freeze({voltage,thresholdTime,readVoltage,readElapsed});
}
