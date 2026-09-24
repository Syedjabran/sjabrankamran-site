// Readable scale models. Values here are sampled instrument observations, not
// ideal physics. A user-controlled zero/jaw offset remains visible as reading error.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Number(n.toPrecision(5));
const start=(w=300,h=190)=>`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Interactive instrument close-up">`;
const txt=(x,y,t,size=12)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" fill="#24483a">${t}</text>`;
const line=(x,y,xx,yy,colour='#635233',width=1)=>`<path d="M${x} ${y}L${xx} ${yy}" stroke="${colour}" stroke-width="${width}" fill="none"/>`;
export function instrumentDisplay(kind,value,unit,offset=0){
  if(!Number.isFinite(value))throw new RangeError('Instrument requires a finite observation');
  if(kind==='micrometer'){
    const mm=value*1000,reading=Math.max(0,mm+offset*.002),base=Math.floor(reading),fraction=reading-Math.floor(reading/.5)*.5,thimble=fraction/.01;
    let s=start();s+=`<path d="M68 30C5 22 0 145 68 140L100 140V120H70C34 125 34 52 68 52H94V30Z" fill="#427461" stroke="#193d31" stroke-width="3"/><rect x="90" y="52" width="${Math.max(8,25+offset)}" height="58" rx="4" fill="#829a9c"/><rect x="125" y="67" width="85" height="34" fill="#eee8d9" stroke="#806f53"/><rect x="208" y="55" width="67" height="60" rx="5" fill="#b6c6c1" stroke="#526d5f"/>`;
    s+=line(125,84,279,84);for(let k=-2;k<=4;k++){let x=151+k*14;const n=base+k;if(n>=0){s+=line(x,68,x,80);s+=txt(x,64,n,10);s+=line(x+7,89,x+7,99);}}
    for(let k=-3;k<=3;k++){const n=(Math.round(thimble)+k+50)%50,y=84+k*7;s+=line(210,y,220+(n%5===0?10:0),y);if(n%5===0)s+=txt(249,y+4,n,10);}
    s+=txt(153,151,'Sleeve + thimble × 0.01 mm',11)+txt(153,172,offset>1?'Jaws open: turn towards the object.':offset< -1?'Over-tight contact: back off the spindle.':'Light contact. Read sleeve and thimble.',10);
    return{svg:s+'</svg>',note:'Turn the spindle to light contact. The sleeve includes the half-millimetre line; each thimble division is 0.01 mm. No automatic answer entry.',adjust:'Spindle: close ← → open'};
  }
  if(kind==='caliper'){
    const mm=value*1000,reading=Math.max(0,mm+offset*.02),startMm=Math.floor(reading/10)*10-10,px=5,zero=65+(reading-startMm)*px;
    let s=start();s+=`<rect x="20" y="45" width="260" height="42" rx="2" fill="#d9e1dc" stroke="#718274"/><path d="M35 45V136H48V80M${zero} 73V136H${zero-13}V95" fill="none" stroke="#658171" stroke-width="7"/><rect x="${zero-6}" y="86" width="104" height="34" fill="#ccd9cf" stroke="#738c7d"/>`;
    for(let i=0;i<52;i++){const x=25+i*px,n=startMm+(x-65)/px;if(n<0)continue;s+=line(x,47,x,47+(Math.round(n)%10===0?23:Math.round(n)%5===0?16:9));if(Math.round(n)%10===0)s+=txt(x,39,round(n),10);}
    for(let i=0;i<=10;i++){const x=zero+i*4.5;s+=line(x,87,x,101);s+=i%5===0?txt(x,114,i,9):'';}
    s+=txt(153,154,'Main scale / mm + aligned vernier division',10)+txt(153,177,offset>1?'Close the movable jaw.':offset< -1?'Jaws are compressing the specimen.':'Light contact: read the coincident vernier line.',10);
    return{svg:s+'</svg>',note:'Main scale 1 mm; ten vernier divisions span 9 mm (0.1 mm resolution). Find the coincident line after closing the jaws.',adjust:'Move the sliding jaw'};
  }
  if(kind==='protractor'){
    const a=value+offset,cx=150,cy=133,r=105;let s=start();s+=`<path d="M45 133A105 105 0 0 1 255 133Z" fill="#f7e6a9aa" stroke="#997d42"/>`;
    for(let d=0;d<=180;d++){const q=d*Math.PI/180,inner=r-(d%10===0?15:d%5===0?10:5);s+=line(cx+inner*Math.cos(q),cy-inner*Math.sin(q),cx+r*Math.cos(q),cy-r*Math.sin(q));if(d%30===0)s+=txt(cx+(r-28)*Math.cos(q),cy-(r-28)*Math.sin(q)+4,d,10);}
    s+=line(cx,cy,260,cy,'#537761',3)+line(cx,cy,cx+100*Math.cos(a*Math.PI/180),cy-100*Math.sin(a*Math.PI/180),'#d08335',3)+txt(150,172,'Align centre and baseline, then read the arm.',10);
    return{svg:s+'</svg>',note:'Read the scale from the correct zero. Misalignment of the baseline changes your apparent angle.',adjust:'Baseline alignment / degrees'};
  }
  if(kind==='thermometer'){
    let s=start(),h=clamp(value,0,100)*1.18;s+=`<rect x="135" y="12" width="17" height="132" rx="8" fill="#e5efea" stroke="#718b7e"/><circle cx="143.5" cy="148" r="13" fill="#c55e43"/><rect x="140" y="${141-h}" width="7" height="${h+7}" fill="#c55e43"/>`;for(let n=0;n<=100;n+=2){const y=140-1.18*n;s+=line(153,y,n%10?160:168,y);if(n%20===0)s+=txt(185,y+4,n,10);}s+=txt(143,180,'°C · read at eye level',11);return{svg:s+'</svg>',note:'Read the top of the coloured column. The thermometer follows the sampled temperature.',adjust:null};
  }
  if(kind==='newton-meter'){
    const max=Math.max(1,Math.ceil(Math.abs(value))),ratio=clamp(value/max,0,1);let s=start();s+=`<rect x="95" y="15" width="104" height="139" rx="8" fill="#f3edd9" stroke="#809786"/><path d="M147 4V15M146 154V167q15 12 20 0" fill="none" stroke="#6f8377" stroke-width="4"/>`;for(let i=0;i<=20;i++){let y=35+i*5;s+=line(139,y,i%5?152:167,y);if(i%5===0)s+=txt(179,y+4,round(max*i/20),10);}s+=`<path d="M107 ${35+ratio*100}h30" stroke="#c47a33" stroke-width="3"/>`+txt(145,186,'Force / N',11);return{svg:s+'</svg>',note:'Read the pointer on the newton-meter scale. Pull slowly and avoid sideways force.',adjust:null};
  }
  if(['ammeter','voltmeter','ohmmeter','galvanometer','balance'].includes(kind)){
    const v=round(value);return{svg:start()+`<rect x="15" y="20" width="270" height="140" rx="15" fill="#406d59"/><rect x="32" y="40" width="236" height="71" rx="5" fill="#e2eccf"/>`+txt(150,88,`${v} ${unit}`,28)+`<circle cx="80" cy="138" r="9" fill="#bb5d41"/><circle cx="220" cy="138" r="9" fill="#25362d"/>`+txt(150,180,'Observe; transcribe manually.',11)+'</svg>',note:'Sampled instrument display. No ideal values or fitted answers are transferred to the notebook.',adjust:null};
  }
  const displayed=unit==='m'?value*1000:value,step=Math.abs(displayed)<2?.1:Math.abs(displayed)<20?1:Math.abs(displayed)<200?10:100;
  const scale=210/Math.max(step*2,Math.ceil(Math.abs(displayed)/step)*step+step),end=40+Math.abs(displayed)*scale;
  let s=start();s+=`<rect x="40" y="25" width="${Math.abs(displayed)*scale}" height="22" rx="3" fill="#789e8a"/>`+line(40,15,40,106,'#c27830',1.5)+line(end,15,end,106,'#c27830',1.5)+`<g transform="translate(${offset} 0)"><rect x="30" y="60" width="255" height="62" rx="3" fill="#f7dc95" stroke="#a48445"/>`;
  for(let k=0;k<=Math.ceil(250/scale/step)*10;k++){const v=k*step/10,x=40+v*scale;if(x>280)break;s+=line(x,62,x,62+(k%10===0?22:k%5===0?16:9));if(k%10===0)s+=txt(x,105,round(v),10);}
  s+='</g>'+txt(150,150,`${unit==='m'?'mm — convert to m for the table':unit}`,12)+txt(150,174,'Align scale zero with the left endpoint.',10);
  return{svg:s+'</svg>',note:'Read the right endpoint against the graduated scale. A misplaced zero creates an error; the endpoints do not snap to your ruler.',adjust:'Move the ruler zero'};
}
