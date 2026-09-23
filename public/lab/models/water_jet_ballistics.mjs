import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeWaterJet(parameters={},seed=2023342){
 const truth={hole_from_base_m:.035,hole_diameter_m:.0015,offset_m:.14,C_m:.17,Cv:.96,Cd:.62,bottle_diameter_m:.065,g:9.81,initial_head_m:.12,...parameters};if(!Object.values(truth).every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive jet apparatus parameters required');const random=seededRandom(seed);
 function geometry(base){if(![.27,.32].includes(base))throw new RangeError('Use either source bottle height');const A=base+truth.hole_from_base_m,s=A-truth.C_m;return {a:A,b:Math.hypot(truth.offset_m,s),c:truth.C_m};}
 function reach(x,s){if(![x,s].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Positive offset and drop required');const h_m=x*x/(4*truth.Cv**2*s);return {h_m,k:Math.sqrt(h_m*s)/x};}
 function head(t){if(!Number.isFinite(t)||t<0)throw new RangeError('Nonnegative time required');const rate=truth.Cd*(truth.hole_diameter_m/truth.bottle_diameter_m)**2*Math.sqrt(2*truth.g);return Math.max(0,Math.sqrt(truth.initial_head_m)-rate*t/2)**2;}
 function drop(x,h){if(!Number.isFinite(x)||x<0||!Number.isFinite(h)||h<=0)throw new RangeError('Nonnegative offset and positive head required');const u=truth.Cv*Math.sqrt(2*truth.g*h);return truth.g*x*x/(2*u*u);}
 function state(base,t){const geometryValues=geometry(base),h=head(t),jet_at_rod_m=h>0?geometryValues.a-drop(truth.offset_m,h):null;return {head_m:h,hole_height_m:geometryValues.a,rod_height_m:geometryValues.c,jet_at_rod_m};}
 function readGeometry(base){return Object.fromEntries(Object.entries(geometry(base)).map(([k,v])=>[k,readInstrument(v,{resolution:.001,halfWidth:.001},random)]));}
 function readHead(t){return readInstrument(head(t),{resolution:.001,halfWidth:.003},random);}
 return Object.freeze({reach,head,drop,state,readGeometry,readHead});
}
