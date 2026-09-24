import {seededRandom,readInstrument} from '../lib/measurement.mjs';
export function makeMagneticPickup(parameters={},seed=2024342){
 const truth={M:.031,Mrod:.025,Lrod:.5,r:.48,x0:.15,g:9.81,masses:[.009,.029],...parameters};const random=seededRandom(seed);if(!['M','Lrod','r','g','x0'].every(k=>Number.isFinite(truth[k])&&truth[k]>0)||truth.x0>=truth.r||!Number.isFinite(truth.Mrod)||truth.Mrod<0)throw new RangeError('Invalid rod geometry or mass');
 const I=truth.M*truth.r**2+truth.Mrod*truth.Lrod**2/3,G=truth.g*(truth.M*truth.r+truth.Mrod*truth.Lrod/2);
 function ideal(m){if(!Number.isFinite(m)||m<=0)throw new RangeError('Positive nut mass');const Ip=I+m*truth.r**2,Gp=G+m*truth.g*truth.r,w=Math.sqrt(2*G*(1-Math.sqrt(1-(truth.x0/truth.r)**2))/I),wp=I*w/Ip,h=truth.r*Ip*wp**2/(2*Gp);return {h_m:h,xmax_m:Math.sqrt(2*truth.r*h-h*h),omega_pre:w,omega_post:wp,Ipre:I,Ipost:Ip};}
 function mass(nut){if(![0,1].includes(nut))throw new RangeError('Choose nut A or B');return truth.masses[nut];}
 function createMotion(nut){const m=mass(nut),p=ideal(m);let q=-Math.asin(truth.x0/truth.r),v=0,t=0,hit=false,finished=false;const snapshot=()=>({angle_rad:q,x_m:truth.r*Math.sin(q),elapsed_s:t,hit,finished});
 function rk(q,v,h){const a=q=>-(hit?(G+m*truth.g*truth.r)/p.Ipost:G/I)*Math.sin(q),a1=a(q),v2=v+h*a1/2,a2=a(q+h*v/2),v3=v+h*a2/2,a3=a(q+h*v2/2),v4=v+h*a3,a4=a(q+h*v3);return [q+h*(v+2*v2+2*v3+v4)/6,v+h*(a1+2*a2+2*a3+a4)/6];}
 function advance(dt){if(!Number.isFinite(dt)||dt<0||dt>60)throw new RangeError('Advance 0–60 s');if(dt===0)return snapshot();let left=dt;while(left>1e-12&&!finished){let h=Math.min(.0005,left),n=rk(q,v,h);if(!hit&&n[0]>=0){let lo=0,hi=h;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(rk(q,v,mid)[0]<0)lo=mid;else hi=mid;}h=(lo+hi)/2;v=rk(q,v,h)[1]*I/p.Ipost;q=0;hit=true;}else{const old=q;[q,v]=n;if(hit&&old>0&&q<=0){q=0;finished=true;}}left-=h;t+=h;}return snapshot();}return Object.freeze({snapshot,advance});}
 function readSetup(nut){return {r:readInstrument(truth.r,{resolution:.001,halfWidth:.001},random),m:readInstrument(truth.M,{resolution:.001},random),m_labels:readInstrument(mass(nut),{resolution:.001},random)};}
 function readX(x){if(!Number.isFinite(x)||x<0||x>truth.r)throw new RangeError('Read post-capture excursion');return readInstrument(x,{resolution:.001,halfWidth:.003},random);}
 return Object.freeze({ideal,createMotion,readSetup,readX});
}
