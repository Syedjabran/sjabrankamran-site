import {rooms} from './contracts.mjs';
import {createExperiment} from './adapters.mjs';
import {shape,bounds} from './sprites.mjs';
import {instrumentDisplay} from './instruments.mjs';
import {applyPoses,dragControls} from './poses.mjs';
import {quantityInfo} from './quantities.mjs';
import {questionTasks} from './question-tasks.mjs';
import {linearFit,readingsCSV} from '../lib/measurement.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const svg=(name,attrs={})=>{const e=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
const id=new URL(location.href).searchParams.get('experiment')||'9702_m22_33-q2';
const room=rooms[id];
if(!room){$('title').textContent='Experiment not found';throw new Error('Unknown experiment');}
const definitions=await fetch('./settings.json').then(r=>{if(!r.ok)throw new Error('Settings unavailable');return r.json();});
const engine=await createExperiment(id,definitions[id]);
const question=questionTasks[id];
document.title=`${room.title} · 9702 laboratory`;$('title').textContent=room.title;$('paper').textContent=id.replace('9702_','9702 · ').replace('-q',' · Q');
$('provisional').hidden=!room.provisional;$('source-guide').href=`../practicals/${id}.html`;
$('procedure').innerHTML=room.steps.map(s=>`<li>${escape(s)}</li>`).join('');
$('limits').textContent=(room.cautions||[]).join(' ');
if(question){
  $('question-title').textContent=`${question.paper} · Question ${question.question}`;$('question-meta').textContent=`Original question-paper pages ${question.pages}`;$('question-overview').textContent=question.overview;
  $('question-sections').innerHTML=question.sections.map(s=>`<article class="question-section"><h3>${escape(s.label)}</h3><p>${escape(s.text)}</p></article>`).join('');
  $('question-checklist').innerHTML=question.checklist.map(s=>`<li>${escape(s)}</li>`).join('');$('original-paper').href=question.pdf;$('question-pdf').src=question.pdf;
}else $('open-question').hidden=true;
$('open-question').onclick=()=>{$('question-panel').hidden=false;document.body.classList.add('question-open');$('close-question').focus();};
$('close-question').onclick=()=>{$('question-panel').hidden=true;document.body.classList.remove('question-open');$('open-question').focus();};
const parts=room.parts.map(p=>({...p,placed:false,mounted:false,px:0,py:0,turn:p.rotation||0,dx:0,dy:0,angle:0}));
const partMap=new Map(parts.map(p=>[p.id,p]));
let selected=null,pendingPlacement=null,drag=null,terminal=null,links=[],running=false,paused=false,watchRunning=false,watchTime=0,tally=0,lastTime=null,lastSample=0,view={},observations={},instrumentKey='',liveInstrument=false,zoom=1,feedbackError=false,assemblyOpened=false;
const noteKey=`9702-room-notebook-v1:${id}`;
let rows=[];try{const saved=JSON.parse(localStorage.getItem(noteKey)||'null');if(saved){rows=saved.rows||[];$('evaluation').value=saved.evaluation||'';}}catch{}
function feedback(text,error=false){$('feedback').textContent=text;$('feedback').classList.toggle('error',error);feedbackError=error;}
function position(event){const pt=new DOMPoint(event.clientX,event.clientY);return pt.matrixTransform($('bench').getScreenCTM().inverse());}
function connectKey(a,b){return [a,b].sort().join('|');}
function endpoint(ref){const [pid,port='mount']=ref.split(':'),p=partMap.get(pid);if(!p?.placed)return null;const bb=bounds(p),names=portNames(p),i=names.indexOf(port),count=names.length;let x=0,y=0;
  if(p.kind==='stand'){x=-52.5;y=-140;}
  else if(p.kind==='wire'&&/^(a|start|left|bottom|b|end|right|top)$/i.test(port)){y=/^(a|start|left|bottom)$/i.test(port)?bb.h/2:-bb.h/2;}
  else if(/^(top|upper|hook|suspension|pivot)$/i.test(port)){y=-bb.h/2;}
  else if(/^(bottom|lower|base)$/i.test(port)){y=bb.h/2;}
  else if(count>1){x=i%2===0?-bb.w/2:bb.w/2;y=(Math.floor(i/2)-(Math.ceil(count/2)-1)/2)*18;}
  x*=p.sx||1;y*=p.sy||1;const a=(p.turn+p.angle)*Math.PI/180;return {x:p.px+p.dx+x*Math.cos(a)-y*Math.sin(a),y:p.py+p.dy+x*Math.sin(a)+y*Math.cos(a)};
}
function portNames(p){const refs=(room.connections||[]).flatMap(c=>[c.from,c.to]).filter(x=>x.split(':')[0]===p.id);return [...new Set(refs.map(x=>x.split(':')[1]||'mount'))];}
function neededConnections(){return(room.connections||[]).filter(c=>!c.optional);}
function mountReady(p){return(p.requires||[]).every(x=>partMap.get(x)?.mounted);}
function ready(){return parts.filter(p=>!p.optional).every(p=>p.mounted)&&neededConnections().every(c=>links.some(l=>connectKey(l.from,l.to)===connectKey(c.from,c.to)))&&!links.some(l=>!l.valid);}
function endpointLabel(ref){const[pid,port]=ref.split(':');return`${partMap.get(pid)?.label||pid} (${port||'mount'})`;}
function nextAction(){
  const p=parts.find(x=>!x.mounted&&!x.optional&&mountReady(x));
  if(p)return{kind:'part',part:p,title:`Place ${p.label}`,text:`Drag ${p.label} from the equipment tray to its translucent mounting guide. ${p.purpose||''}`};
  const blocked=parts.find(x=>!x.mounted&&!x.optional);if(blocked)return{kind:'part',part:blocked,title:`Prepare ${blocked.label}`,text:`Mount ${blocked.requires.map(x=>partMap.get(x)?.label||x).join(' before ')} first, then place ${blocked.label}.`};
  const c=neededConnections().find(x=>!links.some(l=>connectKey(l.from,l.to)===connectKey(x.from,x.to)));
  if(c)return{kind:'connection',connection:c,title:c.label||'Make the next connection',text:`Turn on “Connect terminals”, then connect ${endpointLabel(c.from)} to ${endpointLabel(c.to)}.`};
  if(!ready())return{kind:'error',title:'Correct the assembly',text:'Remove any orange incorrect lead, then complete the listed attachments.'};
  return{kind:'ready',title:'Assembly complete',text:'Inspect b and d with the ruler. Level the strip, choose a small release angle, zero the stopwatch, then release and time at least five cycles.'};
}
function updateCoach(){const a=nextAction();$('coach-title').textContent=a.title;$('coach-text').textContent=a.text;$('coach-show').disabled=a.kind==='ready';}
$('coach-show').onclick=()=>{const a=nextAction();document.querySelectorAll('.coach-highlight').forEach(e=>e.classList.remove('coach-highlight'));if(a.part){const b=document.querySelector(`[data-tray="${a.part.id}"]`);b?.classList.add('coach-highlight');b?.scrollIntoView({behavior:'smooth',block:'nearest'});feedback(a.text);}else if(a.connection){$('wire-mode').checked=true;$('connection-picker').hidden=false;$('connect-from').value=a.connection.from;$('connect-to').value=a.connection.to;$('connect-selected').focus();feedback(a.text);}else feedback(a.text,a.kind==='error');};
function refresh(){
  let mounted=parts.filter(p=>p.mounted&&!p.optional).length,needed=parts.filter(p=>!p.optional).length;
  $('assembly-count').textContent=`${mounted} / ${needed} parts mounted`;$('tray-count').textContent=parts.filter(p=>!p.placed).length;
  $('empty-tip').hidden=parts.some(p=>p.placed);$('run').disabled=!ready()||running;
  $('observe').disabled=!ready();$('return-part').disabled=!selected||!selected.placed||running;
  $('pause').disabled=!running&&!watchRunning;$('pause').textContent=paused?'Resume simulation':'Pause simulation';
  $('open-switch').hidden=!room.category?.includes('circuit')&&!['circuit','circuit-time'].includes(room.category);
  $('run').textContent=room.category?.includes('circuit')?'Close switch / energise':room.category==='thermal'?'Pour hot water':room.category==='flow'?'Open / release flow':'Release / apply load';
  const watchPlaced=parts.some(p=>p.kind==='stopwatch'&&p.placed);
  $('watch-start').disabled=!watchPlaced||watchRunning;$('watch-stop').disabled=!watchRunning;$('watch-zero').disabled=!watchPlaced||watchRunning;
  $('watch-state').textContent=!watchPlaced?'Place on bench':watchRunning?(paused?'Paused with simulation':'Running — manual timing'):'Stopped';
  if(!parts.some(p=>p.kind==='stopwatch'))$('watch-state').textContent='Not required for this practical';
  for(const p of parts){const button=document.querySelector(`[data-tray="${p.id}"]`);button?.classList.toggle('placed',p.placed);if(button)button.querySelector('.check').textContent=p.mounted?'✓':p.placed?'○':'';p.node?.classList.toggle('selected',selected===p);p.node?.classList.toggle('mounted',p.mounted);p.node?.classList.toggle('unmounted',!p.mounted);}
  $('connections').innerHTML=neededConnections().map(c=>`<div class="connection-item ${links.some(l=>connectKey(l.from,l.to)===connectKey(c.from,c.to))?'done':''}"><span>${links.some(l=>connectKey(l.from,l.to)===connectKey(c.from,c.to))?'✓':'○'}</span>${escape(c.label||`${c.from} → ${c.to}`)}</div>`).join('');
  $('ghosts').style.display=$('hints').checked?'':'none';for(const p of parts)document.querySelector(`[data-ghost="${p.id}"]`).style.display=p.mounted?'none':'';
  $('bench').classList.toggle('assembled',ready());
  if(ready()&&!assemblyOpened){document.querySelector('.setup-card').open=false;assemblyOpened=true;}
  for(const field of[$('connect-from'),$('connect-to')]){const prior=field.value;field.innerHTML='<option value="">Choose a terminal</option>'+parts.filter(p=>p.mounted).flatMap(p=>portNames(p).map(name=>`<option value="${escape(p.id+':'+name)}">${escape(p.label+' · '+name)}</option>`)).join('');field.value=prior;}
  $('connect-selected').disabled=running;
  updateCoach();
  for(const el of document.querySelectorAll('#controls input,#controls select'))el.disabled=running&&!canAdjustLive(el.id.replace('setting-',''));
  renderTerminals();draw();
}
function choose(p){selected=p;$('selected-label').textContent=`${p.label} — ${p.purpose||'Drag to position.'}`;refresh();}
function createPart(p,x,y){
  p.placed=true;p.px=x;p.py=y;
  const bb=bounds(p),g=svg('g',{'class':'part unmounted',tabindex:0,role:'button','aria-label':`${p.label}. Drag to position; arrows move; R rotates; Delete returns to tray.`,'data-part':p.id});
  g.innerHTML=`<rect class="selection-ring" x="${-bb.w/2-8}" y="${-bb.h/2-8}" width="${bb.w+16}" height="${bb.h+16}" rx="8"/>${shape(p)}<circle class="mount-indicator" cx="${bb.w/2+4}" cy="${-bb.h/2-4}" r="4"/><text class="part-label" text-anchor="middle" y="${bb.h/2+22}">${escape(p.label)}</text>`;
  g.addEventListener('pointerdown',e=>{if(e.target.closest('.terminal'))return;e.stopPropagation();choose(p);if(running&&!isInstrument(p)&&!canAdjustLive(dragControls[engine.family]?.[p.id]?.[0])){feedback('Reset the trial before moving load-bearing apparatus.',true);return;}beginDrag(e,p);});
  g.addEventListener('keydown',e=>{if(e.key==='Enter'){choose(p);return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();returnPart(p);return;}if(e.key.toLowerCase()==='r'){e.preventDefault();rotate(p);return;}const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta){e.preventDefault();if(running&&!isInstrument(p))return;choose(p);p.px+=delta[0]*(e.shiftKey?1:10);p.py+=delta[1]*(e.shiftKey?1:10);tryMount(p);refresh();}});
  p.node=g;$('parts').append(g);choose(p);
}
function isInstrument(p){return p.id!=='rod'&&p.id!=='force-meter'&&['ruler','protractor','stopwatch','micrometer','caliper','thermometer','balance','newton-meter','ammeter','voltmeter','galvanometer','ohmmeter'].includes(p.kind);}
function canAdjustLive(key){return room.category==='circuit'&&engine.family!=='rc_discharge_parallel'&&engine.controls.find(c=>c.key===key)?.type==='range'||engine.family==='inclined_rod_lift'&&key==='force';}
function beginDrag(e,p){
  if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();const q=position(e);
  const binding=p.mounted&&!isInstrument(p)&&!e.altKey?dragControls[engine.family]?.[p.id]:null;
  const control=binding&&engine.controls.find(c=>c.key===binding[0]);
  drag={p,ox:q.x-p.px,oy:q.y-p.py,id:e.pointerId,start:q,moved:false,binding,control,initial:control?engine.settings[control.key]:null};
  $('bench').setPointerCapture?.(e.pointerId);p.node?.classList.add('selected');
}
function tryMount(p){
  const near=Math.hypot(p.px-p.x,p.py-p.y)<85;
  if(near&&mountReady(p)){p.px=p.x;p.py=p.y;p.mounted=true;p.turn=p.rotation||0;feedback(`${p.label} mounted. ${p.purpose||''}`);}
  else if(isInstrument(p)&&p.px>70&&p.px<940&&p.py>40&&p.py<550){p.mounted=true;feedback(`${p.label} on the bench. Place it alongside the apparatus for observation.`);}
  else{p.mounted=false;feedback(near?`Mount ${(p.requires||[]).filter(x=>!partMap.get(x)?.mounted).map(x=>partMap.get(x)?.label||x).join(', ')} first.`:`${p.label} is loose. Move it to its mounting position${$('hints').checked?' shown by the guide':'; enable the mounting guide for help'}.`,true);}
  // Dismounting a support makes dependent apparatus invalid; no invisible support.
  for(const child of parts){if(child.mounted&&!mountReady(child))child.mounted=false;}
  if(ready())feedback('Assembly complete. Inspect the instruments, adjust the setup and release when you are ready.');
}
function returnPart(p){if(!p||running)return;p.node?.remove();p.node=null;p.placed=p.mounted=false;links=links.filter(l=>![l.from,l.to].some(ref=>ref.split(':')[0]===p.id));for(const child of parts)if(child.mounted&&!mountReady(child))child.mounted=false;terminal=null;selected=null;pendingPlacement=null;refresh();}
function rotate(p){if(!p||running)return;p.turn=(p.turn+15)%360;if(!isInstrument(p))p.mounted=false;refresh();}
for(const p of parts){
  const bb=bounds(p),ghost=svg('g',{transform:`translate(${p.x} ${p.y}) rotate(${p.rotation||0})`,'class':'ghost','data-ghost':p.id});ghost.innerHTML=shape(p)+`<text text-anchor="middle" y="${bb.h/2+18}">${escape(p.label)}</text>`;$('ghosts').append(ghost);
  const button=document.createElement('button');button.type='button';button.className='tray-item';button.dataset.tray=p.id;button.setAttribute('aria-label',`Place ${p.label}`);button.innerHTML=`<svg viewBox="${-bb.w/2-10} ${-bb.h/2-10} ${bb.w+20} ${bb.h+20}" aria-hidden="true">${shape(p)}</svg><span>${escape(p.label)}${p.optional?' · spare':''}</span><b class="check"></b>`;
  button.addEventListener('pointerdown',e=>{if(p.placed||running)return;const q=position(e);createPart(p,clamp(q.x,80,900),clamp(q.y,55,510));pendingPlacement=p;beginDrag(e,p);drag.ox=drag.oy=0;});
  button.addEventListener('click',e=>{if(e.detail===0&&!p.placed&&!running){createPart(p,110,450);p.node.focus();feedback(`Move ${p.label} with the arrow keys (Shift for fine movement).`);}else if(p.placed)choose(p);});$('tray').append(button);
}
$('bench').addEventListener('pointerdown',e=>{if(!pendingPlacement||running)return;e.preventDefault();e.stopPropagation();const p=pendingPlacement,q=position(e);p.px=q.x;p.py=q.y;pendingPlacement=null;tryMount(p);refresh();},true);
$('bench').addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const q=position(e),p=drag.p;drag.moved=true;
  if(drag.control){const c=drag.control,distance=q[drag.binding[1]]-drag.start[drag.binding[1]];
    const value=c.type==='range'?clamp(Number(drag.initial)+Math.round(distance/220*(c.max-c.min)/c.step)*c.step,c.min,c.max):c.options[clamp(c.options.findIndex(o=>String(o.value)===String(drag.initial))+Math.round(distance/40),0,c.options.length-1)].value;
    updateSetting(c,value);return;}
  p.px=clamp(q.x-drag.ox,25,975);p.py=clamp(q.y-drag.oy,20,550);p.mounted=false;draw();});
function finishDrag(e){if(!drag||e.pointerId!==drag.id)return;if(pendingPlacement&&!drag.moved){feedback('Tap the mounting guide to place this part, or drag it onto the bench.');}else{pendingPlacement=null;if(!drag.control)tryMount(drag.p);else feedback('Apparatus adjusted by hand. Inspect the scale; release when ready.');}drag=null;refresh();}
$('bench').addEventListener('pointerup',finishDrag);$('bench').addEventListener('pointercancel',finishDrag);
function renderTerminals(){
  document.querySelectorAll('.terminal').forEach(e=>e.remove());
  for(const p of parts.filter(p=>p.placed)){for(const name of portNames(p)){const pos=endpoint(`${p.id}:${name}`);if(!pos)continue;
    const el=svg('circle',{cx:pos.x,cy:pos.y,r:9,'class':`terminal ${terminal===`${p.id}:${name}`?'selected':''}`,tabindex:0,role:'button','aria-label':`${p.label}: ${name}`,'data-terminal':`${p.id}:${name}`});
    const title=svg('title');title.textContent=`${p.label}: ${name}`;el.append(title);
    const activate=()=>{if(running){feedback('Open/reset the trial before changing connections.',true);return;}if(!p.mounted){feedback(`Mount ${p.label} first.`,true);return;}const ref=`${p.id}:${name}`;if(!terminal){terminal=ref;feedback(`Selected ${p.label}: ${name}. Select the other terminal or mounting point.`);}else if(terminal===ref){terminal=null;}else{const key=connectKey(terminal,ref),valid=(room.connections||[]).some(c=>connectKey(c.from,c.to)===key);if(!links.some(c=>connectKey(c.from,c.to)===key))links.push({from:terminal,to:ref,valid});terminal=null;feedback(valid?'Connection made.':'This connection does not match the circuit or attachment. Click the orange lead to remove it.',!valid);}refresh();};
    el.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();activate();});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});$('annotations').append(el);
  }}
}
let leadSignature='';
function drawLinks(){
  const hidden=ready()&&engine.family==='symmetric_movable_pulley'&&!$('wire-mode').checked;
  $('leads').style.display=hidden?'none':'';
  const signature=JSON.stringify(links);
  if(signature!==leadSignature){
    leadSignature=signature;$('leads').replaceChildren();
    for(const link of links){
      const lead=svg('path',{class:`lead ${link.valid?'':'invalid'}`,'aria-label':'Connection; Enter or click to remove',tabindex:0,role:'button'});
      const remove=()=>{if(running)return;links=links.filter(l=>l!==link);refresh();};
      lead.addEventListener('click',remove);lead.addEventListener('keydown',e=>{if(e.key==='Delete'||e.key==='Enter'){e.preventDefault();remove();}});$('leads').append(lead);
    }
  }
  for(const[i,link]of links.entries()){
    const a=endpoint(link.from),b=endpoint(link.to),lead=$('leads').children[i];if(!a||!b||!lead)continue;
    // A small loop makes same-position invalid terminals visible and removable.
    const same=Math.hypot(a.x-b.x,a.y-b.y)<5;
    lead.setAttribute('d',same?`M${a.x} ${a.y}c-35 -45 35 -45 0 0`:room.category==='circuit'?`M${a.x} ${a.y} Q${(a.x+b.x)/2} ${Math.max(a.y,b.y)+25} ${b.x} ${b.y}`:`M${a.x} ${a.y} L${b.x} ${b.y}`);
  }
}
function motionParts(){
  const candidates=parts.filter(p=>p.placed&&!isInstrument(p));
  const of=kind=>candidates.filter(p=>p.kind===kind),first=(...kinds)=>kinds.flatMap(k=>of(k))[0];
  for(const p of parts){p.dx=0;p.dy=0;p.angle=0;p.sx=1;p.sy=1;}
  const moving=first('bob','ball','mass','rod','chain','card');
  const rod=first('rod','board'),balls=[...of('ball'),...of('bob')];
  if(!ready()||!view)return;
  if(['swing','spring','fall','chain','roll','pickup'].includes(view.kind)&&moving){moving.dx=view.dx||0;moving.dy=view.dy||0;if(view.kind==='roll')moving.angle=view.angle||0;}
  if(['lever','thermal'].includes(view.kind)&&rod){rod.angle=view.angle||0;rod.dx=view.dx||0;}
  if(view.kind==='swing'&&!balls.length&&rod){rod.angle=view.angle||0;rod.dx=0;rod.dy=0;}
  if(view.kind==='collision'){for(const[p,dx,dy]of[[balls[0],view.dx,view.dy],[balls[1],view.dx2,view.dy2]])if(p){p.dx=dx;p.dy=dy;}}
  if(view.kind==='pickup'){const magnet=first('magnet');if(magnet){magnet.dx=view.dx;magnet.dy=view.dy;}if(rod)rod.angle=view.angle;if(view.hit){const m=first('mass');if(m){m.dx=view.dx;m.dy=view.dy;}}}
  if(view.kind==='spin-fall'){const card=first('card'),mass=first('mass');if(card)card.angle=view.angle;if(mass)mass.dy=view.dy;}
  if(view.kind==='pulley'){const pulley=of('pulley').find(p=>/mov|lower/i.test(p.label))||first('pulley');if(pulley)pulley.dy=view.dy||0;}
  if(view.kind==='compression'){const foam=first('foam');if(foam)foam.sy=Math.max(.4,1-(view.compression||0)*20);}
  if(view.kind==='stretch'){const rubber=first('rubber');if(rubber){rubber.sx=view.scaleX;rubber.sy=view.scaleY;}}
  if(view.kind==='incline'){const board=first('board');if(board)board.angle=view.angle;const cylinder=first('cylinder');if(cylinder&&view.unstable)cylinder.angle=30;}
  if(view.kind==='card'){const card=first('card');if(card)card.angle=view.angle;}
  applyPoses(engine.family,parts,engine.settings,view,bounds);
  // Strings and springs follow their actual connected moving endpoints.
  for(const p of candidates.filter(p=>['string','spring'].includes(p.kind))){if(engine.family==='spring_network_oscillator')continue;const joined=links.filter(l=>l.valid&&(l.from.startsWith(p.id+':')||l.to.startsWith(p.id+':')));if(joined.length!==2)continue;const ends=joined.map(l=>endpoint(l.from.startsWith(p.id+':')?l.to:l.from));if(ends.some(x=>!x))continue;const[a,b]=ends;p.dx=(a.x+b.x)/2-p.px;p.dy=(a.y+b.y)/2-p.py;p.angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI-90-p.turn;p.sy=Math.hypot(b.x-a.x,b.y-a.y)/bounds(p).h;}
}
function draw(){
  motionParts();
  for(const p of parts.filter(p=>p.node)){p.node.style.visibility=ready()&&engine.family==='symmetric_movable_pulley'&&p.id==='string'?'hidden':'';p.node.setAttribute('transform',`translate(${p.px+p.dx} ${p.py+p.dy}) rotate(${p.turn+p.angle}) scale(${p.sx||1} ${p.sy||1})`);
    const liquid=p.node.querySelector('[data-liquid]');if(liquid&&ready()&&p.id!=='water'&&p.id!=='oil'&&view.kind!=='utube'){const bb=bounds(p),fill=clamp(p.kind==='beaker'&&['liquid','jet'].includes(view.kind)?1-(view.fill??.6):view.fill??.6,0,1);liquid.setAttribute('y',String(bb.h/2-10-(bb.h-25)*fill));liquid.setAttribute('height',String((bb.h-25)*fill));}
    const lcd=p.node.querySelector('[data-reading]');if(lcd){if(p.kind==='stopwatch')lcd.textContent=formatTime(watchTime);else{const value=Object.entries(observations).find(([k])=>instrumentKinds(k).includes(p.kind));lcd.textContent=value?formatValue(value[1]):'—';}}
    const blade=p.node.querySelector('[data-switch]');if(blade){const closed=engine.closed&&ready();blade.setAttribute('d',blade.dataset.switch==='two-way'?(closed?'M0 22L34 -10':'M0 22L-34 -10'):(closed?'M-38 -4L36 -4':'M-38 -4L34 -22'));const knob=p.node.querySelector('[data-switch-knob]');if(knob)knob.setAttribute('cy',closed?-4:-24);}
    p.node.querySelectorAll('[data-lamp]').forEach(el=>el.setAttribute('fill',view.powered?'#ffd865':'#839187'));
  }
  drawLinks();
  for(const node of document.querySelectorAll('[data-terminal]')){const q=endpoint(node.dataset.terminal);if(q){node.setAttribute('cx',q.x);node.setAttribute('cy',q.y);}}
  $('watch').textContent=formatTime(watchTime);$('tally').textContent=tally;
  drawEffects();
}
function drawEffects(){
  const layer=$('effects');layer.replaceChildren();if(!ready())return;
  if(engine.family==='symmetric_movable_pulley'){
    const left=partMap.get('stand-left'),mov=partMap.get('pulley'),fixed=partMap.get('fixed'),load=partMap.get('load'),hanger=partMap.get('hanger');
    const x=mov.px+mov.dx,y=mov.py+mov.dy,fx=fixed.px,fy=fixed.py,hx=hanger.px,hy=hanger.py+hanger.dy;
    layer.append(svg('path',{d:`M${left.px-52.5} ${fy-28}L${x-28} ${y}Q${x} ${y+45} ${x+28} ${y}L${fx-28} ${fy}Q${fx} ${fy-48} ${fx+28} ${fy}L${hx} ${hy-46}`,fill:'none',stroke:'#ad934f','stroke-width':4}));
    layer.append(svg('path',{d:`M${x} ${y+25}L${load.px+load.dx} ${load.py+load.dy-44}`,stroke:'#546d67','stroke-width':3}));
  }
  if(view.kind==='utube'){const p=partMap.get('tube');if(p){const y=z=>p.py+110-(z-.15)*600;
    for(const[x,h,top]of[[p.px-45,view.left,view.topLeft],[p.px+45,view.right,view.topRight]]){
      layer.append(svg('path',{d:`M${x} ${p.py+100}V${y(h)}`,stroke:'#4babc0','stroke-width':14,fill:'none'}));
      layer.append(svg('path',{d:`M${x} ${y(h)}V${y(top)}`,stroke:'#d7b347','stroke-width':14,fill:'none'}));
      layer.append(svg('path',{d:`M${x-16} ${y(h)}h32`,stroke:'#24514b','stroke-width':2}));}}
  }
  if(['liquid','fall'].includes(view.kind)){const p=parts.find(p=>p.placed&&(p.id==='bottle'||p.id==='syringe'||p.id==='tube'));if(p){const bb=bounds(p);for(const f of[.3,.8]){const y=p.py+bb.h/2-10-(bb.h-25)*f;layer.append(svg('path',{d:`M${p.px-bb.w/2-12} ${y}h${bb.w+24}`,stroke:'#a96424','stroke-width':2,'stroke-dasharray':'5 4'}));}}}
  if(view.kind==='optics'){const lamp=parts.find(p=>p.kind==='lamp'),lens=parts.find(p=>p.kind==='lens'),screen=parts.find(p=>p.kind==='screen');if(lamp&&lens&&screen){const y=screen.py+screen.dy,x=screen.px+screen.dx;for(const d of[-35,0,35])layer.append(svg('path',{d:`M${lamp.px+lamp.dx} ${lamp.py} L${lens.px} ${lens.py+d} L${x} ${y+d*(view.blur||0)}`,fill:'none',stroke:'#d9a72a','stroke-width':2,opacity:.7}));const mark=svg('text',{x:x+6,y,fill:'#487277','font-size':36,style:`filter:blur(${Math.min(12,(view.blur||0)*4)}px)`});mark.textContent='↓';layer.append(mark);}}
  if(view.kind==='jet'&&view.jet){const bottle=parts.find(p=>p.kind==='bottle');if(bottle){let path=`M${bottle.px+30} ${bottle.py+70}`;for(let x=4;x<180;x+=4)path+=` L${bottle.px+30+x} ${bottle.py+70+x*x/(Math.max(.003,view.head)*16000)}`;layer.append(svg('path',{d:path,fill:'none',stroke:'#4babc0','stroke-width':3}));}}
  // Midpoint marker is an observation aid, never an automatic cycle counter.
  if(['swing','spring','collision','pickup'].includes(view.kind)){const p=parts.find(p=>['bob','ball','rod'].includes(p.kind));if(p)layer.append(svg('path',{d:`M${p.x-18} ${p.y}h36`,stroke:'#a6803d','stroke-dasharray':'4 4','stroke-width':1}));}
}
function updateSetting(c,value){const el=$(`setting-${c.key}`);try{view=engine.set(c.key,c.type==='range'?Number(value):value);el.value=engine.settings[c.key];el.nextElementSibling.textContent=c.type==='select'?c.options.find(o=>String(o.value)===String(el.value))?.label:el.value;observations={};liveInstrument=false;$('instrument-view').replaceChildren();if(running&&canAdjustLive(c.key)){observations=engine.sample();liveInstrument=true;if(instrumentKey)renderInstrument();}draw();feedback(view.status||'Adjustment changed. Inspect and remeasure before recording.');}catch(e){el.value=engine.settings[c.key];feedback(e.message,true);}}
for(const c of engine.controls){const wrap=document.createElement('div');wrap.innerHTML=`<label for="setting-${c.key}">${escape(c.label)}</label>`;let el;if(c.type==='select'){el=document.createElement('select');el.innerHTML=c.options.map(o=>`<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('');}else{el=document.createElement('input');el.type='range';el.min=c.min;el.max=c.max;el.step=c.step;}el.id=`setting-${c.key}`;el.value=c.value;wrap.append(el);const out=document.createElement('span');out.className='control-value';out.textContent=c.type==='select'?c.options.find(o=>String(o.value)===String(c.value))?.label:String(c.value);wrap.append(out);el.addEventListener(c.type==='range'?'input':'change',()=>updateSetting(c,el.value));$('controls').append(wrap);}
function formatTime(t){return`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;}
function formatValue(v){return Math.abs(v)>=1000?v.toFixed(0):Math.abs(v)>=1?Number(v.toPrecision(5)).toString():v===0?'0':Number(v.toPrecision(4)).toString();}
function watchStart(){if($('watch-start').disabled)return;watchRunning=true;lastTime=performance.now();refresh();}
function watchStop(){watchRunning=false;refresh();}
$('watch-start').onclick=watchStart;$('watch-stop').onclick=watchStop;$('watch-zero').onclick=()=>{watchTime=0;tally=0;draw();};
$('tally-plus').onclick=()=>{tally++;draw();};$('tally-minus').onclick=()=>{tally=Math.max(0,tally-1);draw();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.closest('input,textarea,select,button,[tabindex]')){e.preventDefault();watchRunning?watchStop():watchStart();}});
$('run').onclick=()=>{if(!ready())return;try{view=engine.start();running=true;paused=false;lastTime=performance.now();feedback(view.status||'Experiment running. Observe and use the stopwatch manually.');refresh();}catch(e){feedback(e.message,true);}};
$('open-switch').onclick=()=>{engine.openSwitch();view=engine.view();liveInstrument=false;running=false;observations={};feedback('Switch open. Reset before changing the assembly.');refresh();};
$('pause').onclick=()=>{paused=!paused;lastTime=performance.now();refresh();};
$('reset-trial').onclick=()=>{running=paused=false;watchRunning=false;view=engine.reset();liveInstrument=false;observations={};feedback('Trial reset. Stopwatch reading and notebook retained. Zero the watch when ready.');refresh();};
$('clear-bench').onclick=()=>{assemblyOpened=false;document.querySelector('.setup-card').open=true;running=paused=watchRunning=false;view=engine.reset();links=[];parts.forEach(p=>{p.node?.remove();p.node=null;p.placed=p.mounted=false;});selected=terminal=pendingPlacement=null;observations={};feedback('Bench cleared. Notebook retained.');refresh();};
$('return-part').onclick=()=>returnPart(selected);$('rotate-part').onclick=()=>rotate(selected);$('hints').onchange=refresh;$('wire-mode').onchange=()=>{$('connection-picker').hidden=!$('wire-mode').checked;feedback($('wire-mode').checked?'Select two terminals on the bench or in the endpoint selector. Click an existing lead to remove it.':'Drag components; terminal circles remain available for keyboard access.');draw();};
$('connect-selected').onclick=()=>{const a=$('connect-from').value,b=$('connect-to').value;if(!a||!b||a===b){feedback('Choose two different mounted terminals.',true);return;}const key=connectKey(a,b),valid=(room.connections||[]).some(c=>connectKey(c.from,c.to)===key);if(!links.some(l=>connectKey(l.from,l.to)===key))links.push({from:a,to:b,valid});feedback(valid?'Connection made.':'Incorrect connection. Remove the orange lead before running.',!valid);refresh();};
function setZoom(delta){zoom=clamp(zoom+delta,1,2);const w=1000/zoom,h=600/zoom;$('bench').setAttribute('viewBox',`${(1000-w)/2} ${(600-h)/2} ${w} ${h}`);}
$('zoom-in').onclick=()=>setZoom(.2);$('zoom-out').onclick=()=>setZoom(-.2);
function unit(key){return quantityInfo(engine.family,key).unit;}
function instrumentKinds(key){return quantityInfo(engine.family,key).instruments;}
function observe(){if(!ready())return;try{observations=engine.sample();const old=instrumentKey;const keys=Object.keys(observations);$('quantity').innerHTML=keys.map(k=>`<option value="${escape(k)}">${escape(quantityInfo(engine.family,k).label)} / ${escape(unit(k))}</option>`).join('');instrumentKey=keys.includes(old)?old:keys[0]||'';$('quantity').value=instrumentKey;liveInstrument=['A','V','Ω','°C','cm³'].includes(unit(instrumentKey));$('align').value=8;renderInstrument();feedback(view.status||'Inspect the scale, then enter your own reading.');}catch(e){feedback(e.message,true);}}
$('observe').onclick=observe;$('quantity').onchange=()=>{instrumentKey=$('quantity').value;liveInstrument=['A','V','Ω','°C','cm³'].includes(unit(instrumentKey));$('align').value=8;renderInstrument();};$('align').oninput=renderInstrument;
function renderInstrument(){
  const value=observations[instrumentKey],u=unit(instrumentKey),available=parts.filter(p=>p.placed&&instrumentKinds(instrumentKey).includes(p.kind));
  if(!Number.isFinite(value)){ $('instrument-view').textContent='No measurement available in this state.';return;}
  if(['count','label'].includes(u)){$('instrument-view').textContent=`${quantityInfo(engine.family,instrumentKey).label}: ${formatValue(value)} (label / count, not a measured length).`;$('align-label').hidden=true;return;}
  if(!available.length){$('instrument-view').textContent=`Place the ${instrumentKinds(instrumentKey).join(' or ')} on the bench first.`;return;}
  let type=available[0].kind;
  if(u==='kg'&&type!=='balance'){$('instrument-view').innerHTML=`<div class="digital">${formatValue(value*1000)} g</div>`;$('instrument-note').textContent='Read the mass label; this is not an inferred mass or a length scale.';$('align-label').hidden=true;return;}
  if(u==='m'&&Math.abs(value)<.025)type=available.find(p=>['micrometer','caliper'].includes(p.kind))?.kind||type;
  if(u==='°')type='protractor';
  const result=instrumentDisplay(type,value,u,Number($('align').value));
  $('instrument-view').innerHTML=result.svg;$('instrument-note').textContent=result.note;
  $('align-label').hidden=!result.adjust;
  if(result.adjust)$('align-label').firstChild.textContent=result.adjust;
}

function save(){try{localStorage.setItem(noteKey,JSON.stringify({rows,evaluation:$('evaluation').value}));$('saved').textContent='Notebook saved on this device for this experiment.';}catch{$('saved').textContent='Local storage unavailable. Export CSV to keep your readings.';}}
function renderRows(){$('rows').innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escape(r.quantity)}</td><td>${escape(r.value)}</td><td>${escape(r.unit)}</td><td>${escape(r.uncertainty??'')}</td><td>${escape(r.note)}</td><td><button data-delete="${i}" aria-label="Delete reading ${i+1}">×</button></td></tr>`).join('');$('rows').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.delete),1);renderRows();save();});}
$('reading-form').onsubmit=e=>{e.preventDefault();const value=Number($('entry-value').value);if(!Number.isFinite(value))return;rows.push({quantity:$('entry-quantity').value.trim(),value,unit:$('entry-unit').value.trim(),uncertainty:$('entry-uncertainty').value===''?'':Number($('entry-uncertainty').value),note:$('entry-note').value.trim()});renderRows();save();$('entry-value').value='';};
$('evaluation').oninput=save;$('export').onclick=()=>{const columns=['quantity','value','unit','uncertainty','note'].map(key=>({key,label:key}));const blob=new Blob([readingsCSV(columns,rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${id}-student-notebook.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('plot').onclick=()=>{try{const points=$('plot-data').value.trim().split('\n').map(l=>l.trim().split(/[,;\s]+/).map(Number));const fit=linearFit(points);const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),X=x=>55+(x-xmin)/(xmax-xmin||1)*480,Y=y=>250-(y-ymin)/(ymax-ymin||1)*210;let markup='<path d="M55 25V250H540" fill="none" stroke="#2c5143"/>';for(let i=0;i<=5;i++){const x=xmin+(xmax-xmin)*i/5,y=ymin+(ymax-ymin)*i/5;markup+=`<text x="${X(x)}" y="271" font-size="11" text-anchor="middle">${x.toPrecision(3)}</text><text x="48" y="${Y(y)+4}" font-size="10" text-anchor="end">${y.toPrecision(3)}</text>`;}markup+=`<path d="M${X(xmin)} ${Y(fit.slope*xmin+fit.intercept)} L${X(xmax)} ${Y(fit.slope*xmax+fit.intercept)}" stroke="#cd8537" fill="none"/>`;markup+=points.map(([x,y])=>`<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="#217455"/>`).join('');markup+=`<text x="300" y="295" text-anchor="middle" font-size="12">${escape($('x-label').value)}</text><text x="60" y="15" font-size="12">${escape($('y-label').value)}</text>`;$('graph').innerHTML=markup;$('fit').textContent=`Gradient ${fit.slope.toPrecision(4)}; intercept ${fit.intercept.toPrecision(4)}. Fit to your entered observations only.`;}catch(e){$('fit').textContent=e.message;}};
function frame(now){const dt=lastTime===null?0:Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;if(!paused){if(watchRunning)watchTime+=dt;if(running&&dt>0){try{view=engine.advance(dt);}catch(e){running=false;feedback(e.message,true);refresh();}}}
  if(liveInstrument&&ready()&&now-lastSample>200){lastSample=now;try{observations=engine.sample();renderInstrument();}catch(e){liveInstrument=false;feedback(e.message,true);}}
  draw();requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||watchRunning)){paused=true;feedback('Simulation and stopwatch paused because the tab was hidden. Resume when ready.');refresh();}});
const narrow=matchMedia('(max-width:620px)');function arrangeTools(){const host=narrow.matches?document.querySelector('.workspace'):document.querySelector('.instruments'),before=narrow.matches?document.querySelector('.setup-card'):null;for(const cls of['.inspector','.measure-card'])host.insertBefore(document.querySelector(cls),before);}narrow.addEventListener('change',arrangeTools);arrangeTools();
view=engine.view();renderRows();refresh();requestAnimationFrame(frame);
// Read-only state for reproducible interaction evidence; no ideal model outputs.
Object.defineProperty(window,'labRoom',{value:{get state(){return {id,ready:ready(),mounted:parts.filter(p=>p.mounted).length,connections:links.filter(l=>l.valid).length,running,paused,watchRunning,watchTime,tally,rows:rows.length};}},writable:false});
