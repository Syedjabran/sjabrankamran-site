import {benches} from './live-config.mjs';
import {setTimeScale, getTimeScale} from './live-clock.mjs';

const $ = id => document.getElementById(id);
const graphicAttrs = ['d','points','transform','x','y','cx','cy','rx','ry','width','height','stroke-width'];
const numbers = /[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi;
// Interpolate only compatible SVG geometry. This is a visual transition between
// verified equilibrium states, NOT a solver or a timed physical observation.
export function interpolateAttribute(from, to, f) {
  if (!from || !to || from.replace(numbers,'#') !== to.replace(numbers,'#')) return to;
  const a=from.match(numbers)?.map(Number), b=to.match(numbers)?.map(Number);
  if (!a?.length || a.length!==b?.length) return to;
  let i=0; return to.replace(numbers,()=>String(a[i]+(b[i]-a[i++])*f));
}

export function mountLiveBench(id) {
  const config=benches[id];
  if(!config) throw new Error(`Missing live apparatus configuration: ${id}`);
  const panel=document.querySelector('.panel'), scene=panel?.querySelector('svg,canvas');
  if(!scene) throw new Error(`Missing apparatus: ${id}`);
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./live-bench.css',import.meta.url);document.head.append(sheet);
  const dynamic=!['equilibrium','optics','circuit'].includes(config.mode);
  const header=document.querySelector('header');
  if(!header.querySelector('.lb-home')) { const a=document.createElement('a');a.className='lb-home';a.href=new URL('../index.html',import.meta.url);a.textContent='← All 50 practicals';header.prepend(a); }
  header.querySelectorAll('p').forEach(p=>{if(p.textContent.includes('browser verification pending'))p.textContent='Hands-on practical · drag apparatus, observe motion, collect your own readings.';});
  const controls=document.createElement('section');controls.className='live-bench';controls.setAttribute('aria-label','Live practical controls');
  controls.innerHTML=`<div class="lb-heading"><div><div class="lb-kicker">Interactive laboratory</div><h2>Your live workbench</h2></div><span class="lb-mode">${dynamic?'PHYSICAL TIME':'LIVE APPARATUS'}</span></div><p class="lb-cue"></p><div class="lb-buttons"><button id="lb-run">▶ Start guided run</button><button id="lb-next">Next setup step</button><button id="lb-pause">Pause</button><button id="lb-step">Step</button><button id="lb-reset">Reset apparatus</button></div><div class="lb-controls"><label id="lb-speed-label">Playback <select id="lb-speed" class="lb-speed"><option value="0.25">¼× slow motion</option><option value="0.5">½× slow motion</option><option value="1" selected>1× real time</option><option value="2">2×</option><option value="4">4×</option></select></label><label><input type="checkbox" id="lb-live" checked> Live instrument display</label></div><p id="lb-status" class="lb-status" role="status" aria-live="polite">Ready. Start the guided setup, or manipulate the apparatus below.</p><details class="lb-details"><summary>Setup steps & measurement notes</summary><ol class="lb-steps"></ol><p class="lb-notes"></p></details>`;
  controls.querySelector('.lb-cue').textContent=config.cue;
  controls.querySelector('.lb-notes').textContent=dynamic
    ? 'Guided setup operates the same controls as you; it never records a table row or supplies an answer. Stopwatches track simulated physical seconds at every playback speed. Use 1× for real-time practice. Pause or step to inspect fast events. Record your own readings below.'
    : 'Guided setup operates the same controls as you and never records a table row. Smooth settling between equilibrium positions is illustrative, not a calibrated transient or a time measurement. Take readings after it settles. Circuit flow cues are schematic, not electron speeds.';
  scene.before(controls);
  const stage=document.createElement('div');stage.className='lb-stage';scene.before(stage);stage.append(scene);
  const handles=document.createElement('div');handles.className='lb-handles';stage.append(handles);
  const hint=document.createElement('p');hint.className='lb-hint';hint.textContent='Drag the turquoise handles on the apparatus. Keyboard: focus a handle and use the arrow keys. Locked handles unlock after Reset.';stage.after(hint);
  const instruments=document.createElement('section');instruments.className='lb-instruments';instruments.innerHTML='<h3>Live observations · student instruments</h3><div class="lb-readings" aria-live="off"></div>';hint.after(instruments);
  $('lb-speed-label').hidden=!dynamic;
  $('lb-live').parentElement.hidden=!config.meter;
  let setupIndex=0,settingUp=false,serial=0,paused=false,transition=null,transitionAt=0,transitionElapsed=0,pendingBefore=null,last=performance.now(),lastPoll=0;
  let chargePath=null,chargeTravel=0;
  const reduced=()=>!!$('reduced')?.checked||(!dynamic&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const status=text=>{$('lb-status').textContent=text;};
  const label=el=>(el?.labels?.[0]?.textContent||el?.textContent||el?.id||'control').replace(/\s+/g,' ').trim().slice(0,105);
  const stepLabel=s=>Array.isArray(s)?`${label($(s[0]))}: ${typeof s[1]==='boolean'?(s[1]?'on':'off'):s[1]}`:label($(s.replace(/^\?/,'')));
  const list=controls.querySelector('ol');
  config.steps.forEach(s=>{const li=document.createElement('li');li.textContent=stepLabel(s);list.append(li);});
  function showSteps(){[...list.children].forEach((li,i)=>li.className=i<setupIndex?'done':i===setupIndex?'current':'');$('lb-next').disabled=settingUp||setupIndex>=config.steps.length;}
  function setControl(el,value) {
    if(!el||el.disabled)return false;
    if(el.type==='checkbox')el.checked=!!value;else el.value=String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }
  function perform(s) {
    if(Array.isArray(s)) {
      const el=$(s[0]);if(!el)throw new Error(`Control ${s[0]} is missing`);
      if(el.disabled)throw new Error(`${label(el)} is locked. Reset the apparatus first.`);
      if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===String(s[1])))throw new Error(`Unavailable setting for ${label(el)}`);
      setControl(el,s[1]);return el;
    }
    const optional=s.startsWith('?'),el=$(s.replace(/^\?/,''));
    if(!el)throw new Error(`Action ${s} is missing`);
    if(el.disabled){if(optional)return el;throw new Error(`${label(el)} is not ready. Check the setup controls below.`);}
    el.click();return el;
  }
  async function nextStep(){
    if(setupIndex>=config.steps.length)return;
    finishTransition();
    const s=config.steps[setupIndex],el=perform(s);el.classList.add('lb-task-active');
    status(`Setup ${setupIndex+1}/${config.steps.length}: ${stepLabel(s)}`);setupIndex++;showSteps();
    await new Promise(r=>setTimeout(r,260));el.classList.remove('lb-task-active');
  }
  $('lb-run').onclick=async()=>{
    if(settingUp)return;
    if(setupIndex===config.steps.length){status('Reset the apparatus for a new guided trial, or continue with your own measurements.');return;}
    settingUp=true;$('lb-run').disabled=true;const run=++serial;
    try {while(setupIndex<config.steps.length&&run===serial)await nextStep();if(run===serial){status(reduced()?'Prepared in reduced-motion mode. Use Step to advance the experiment.':dynamic?'Experiment running. Observe the motion; use the stopwatch and record your own readings.':'Apparatus prepared. Drag the handles to explore its response; record your own readings.');stage.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});}}
    catch(e){status(e.message);}
    finally{settingUp=false;$('lb-run').disabled=false;showSteps();}
  };
  $('lb-next').onclick=()=>{nextStep().catch(e=>status(e.message));};
  $('lb-reset').onclick=()=>{
    serial++;finishTransition();paused=false;
    if($('pause')&&!$('pause').disabled)$('pause').click();
    // Opening circuits before resetting preserves their own interlocks.
    if($('closed')?.checked)setControl($('closed'),false);
    if($('switch')?.textContent.startsWith('Open')&&!$('switch').disabled)$('switch').click();
    const reset=id==='9702_m21_33-q1'?null:$(config.reset||'reset');if(reset&&!reset.disabled)reset.click();
    if(id==='9702_m21_33-q1'){setControl($('x'),.245);setControl($('str'),0);}
    if(!reset&&$('abandon')&&!$('abandon').disabled)$('abandon').click();
    setupIndex=0;showSteps();status('Apparatus reset. Existing student table is retained. Change settings or start another trial.');
  };
  $('lb-speed').onchange=()=>{setTimeScale(Number($('lb-speed').value));status(`${getTimeScale()}× playback. All timing measurements remain in simulated physical seconds.`);};
  $('lb-pause').onclick=()=>{
    if(dynamic){const target=$('pause')&&!$('pause').disabled?$('pause'):['resume','play','drain'].map($).find(el=>el&&!el.disabled);if(target)target.click();}
    else {paused=!paused;document.dispatchEvent(new CustomEvent('lab-visual-pause',{detail:paused}));}
    status(dynamic?'Playback changed. Use Step when paused to inspect the apparatus.':paused?'Visual response paused.':'Visual response resumed.');
  };
  $('lb-step').onclick=()=>{
    if(dynamic){if($('pause')&&!$('pause').disabled)$('pause').click();const b=['step','fine'].map($).find(el=>el&&!el.disabled);if(b){b.click();status(b.textContent.trim()+' — advanced using the experiment clock.');}else status('Prepare the apparatus first.');}
    else if(transition){paused=true;transitionElapsed+=.1;paintTransition();}else {document.dispatchEvent(new CustomEvent('lab-visual-step'));status('Move an apparatus handle to start a new response.');}
  };
  function snapshot(){
    const map=new Map();
    scene.querySelectorAll('path,circle,ellipse,rect,polygon,line,g').forEach((el,i)=>{
      if(el.closest('[data-live-cue]'))return;
      const key=el.id||`${el.tagName}:${i}`,attrs={};for(const a of graphicAttrs)if(el.hasAttribute(a))attrs[a]=el.getAttribute(a);
      map.set(key,{el,attrs});
    });return map;
  }
  function finishTransition(){
    if(transition)for(const t of transition)if(t.el.isConnected)t.el.setAttribute(t.attr,t.to);
    transition=null;document.body.dataset.benchSettling='false';
  }
  function startTransition(before){
    const after=snapshot(),changes=[];
    for(const [key,v]of after){const old=before.get(key);if(!old)continue;for(const [attr,to]of Object.entries(v.attrs)){const from=old.attrs[attr];if(from&&from!==to&&from.replace(numbers,'#')===to.replace(numbers,'#'))changes.push({el:v.el,attr,from,to});}}
    if(!changes.length||reduced())return;
    transition=changes;transitionElapsed=0;transitionAt=performance.now();paused=false;document.body.dataset.benchSettling='true';paintTransition();
  }
  function paintTransition(){
    if(!transition)return;
    const f=Math.min(1,transitionElapsed/.85),ease=1-(1-f)**3;
    for(const t of transition)if(t.el.isConnected)t.el.setAttribute(t.attr,interpolateAttribute(t.from,t.to,ease));
    if(f>=1)finishTransition();
  }
  // Capture a BEFORE view, let the original source-reviewed handler calculate the
  // new equilibrium, then interpolate only its resulting geometry.
  if(!dynamic)for(const type of ['input','change','click'])panel.addEventListener(type,event=>{
    if(event.target.closest('.live-bench,.lb-handles,.lb-instruments')||event.target===scene)return;
    if(transition&&['read','record','take','hot','height'].includes(event.target.id)){
      event.stopImmediatePropagation();event.preventDefault();status('Wait for the apparatus display to settle before taking or recording a reading.');return;
    }
    if(pendingBefore)return;
    finishTransition();pendingBefore=snapshot();queueMicrotask(()=>{const old=pendingBefore;pendingBefore=null;startTransition(old);});
  },true);
  const gripList=[];
  config.drag.forEach(([control,selector,axis],index)=>{
    const el=$(control);if(!el)return;
    const grip=document.createElement('button');grip.className='lb-handle';grip.type='button';grip.textContent=axis==='y'?'↕':'↔';
    grip.setAttribute('aria-label',`Drag ${label(el)}; or use arrow keys`);grip.dataset.control=control;
    const tip=document.createElement('span');tip.className='lb-tip';tip.textContent=label(el);grip.append(tip);handles.append(grip);
    let drag=null;
    const options=()=>el.tagName==='SELECT'?[...el.options].filter(o=>!o.disabled):null;
    function move(delta,keys=false){
      if(el.disabled)return;
      const opts=options();let value;
      if(opts){const origin=drag?.value??opts.findIndex(o=>o.value===el.value),change=keys?Math.sign(delta):Math.round(delta/60);value=opts[Math.max(0,Math.min(opts.length-1,origin+change))].value;}
      else {const lo=Number(el.min)||0,hi=Number(el.max)||100,step=Number(el.step)||1,origin=drag?.value??Number(el.value),v=origin+(keys?Math.sign(delta)*step:delta/230*(hi-lo));value=Number((Math.max(lo,Math.min(hi,Math.round((v-lo)/step)*step+lo))).toPrecision(10));}
      setControl(el,value);status(`${label(el)}: ${el.tagName==='SELECT'?el.selectedOptions[0].textContent:el.value}. ${el.disabled?'Reset before adjusting further.':'Apparatus responds to your setting.'}`);
    }
    grip.onpointerdown=event=>{if(el.disabled)return;event.preventDefault();grip.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,value:options()?options().findIndex(o=>o.value===el.value):Number(el.value)};};
    grip.onpointermove=event=>{if(drag)move(axis==='y'?drag.y-event.clientY:event.clientX-drag.x);};
    grip.onpointerup=()=>{drag=null;if(control==='amplitude'&&$('release')&&!$('release').disabled){$('release').click();status('Released by hand. Observe and time the motion.');}};grip.onpointercancel=()=>{drag=null;};
    grip.onkeydown=event=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(event.key)){event.preventDefault();move(['ArrowRight','ArrowUp'].includes(event.key)?1:-1,true);}};
    gripList.push({grip,el,selector,index,control});
  });
  function layoutHandles(){
    const box=stage.getBoundingClientRect(),seen=[];
    for(const {grip,el,selector,index,control}of gripList){
      grip.disabled=el.disabled;
      let target=selector==='svg'?scene:scene.matches(selector)?scene:scene.querySelector(selector);
      let x,y;
      const dataKey='grip'+control[0].toUpperCase()+control.slice(1);
      if(scene.dataset[dataKey+'x']){x=Number(scene.dataset[dataKey+'x'])*box.width;y=Number(scene.dataset[dataKey+'y'])*box.height;}
      else if(target&&target!==scene){const r=target.getBoundingClientRect();x=r.left+r.width/2-box.left;y=r.top+r.height/2-box.top;}
      else{x=55+index*64;y=box.height-38;}
      x=Math.max(24,Math.min(box.width-24,x));y=Math.max(24,Math.min(box.height-24,y));
      if(seen.some(p=>Math.hypot(p.x-x,p.y-y)<48))x=Math.min(box.width-24,x+52);
      seen.push({x,y});grip.style.left=x+'px';grip.style.top=y+'px';
    }
  }
  function isCircuitClosed(){if($('closed'))return $('closed').checked;if(id==='9702_s22_34-q1')return $('state')?.textContent.startsWith('Discharging');return !!$('switch')?.textContent.startsWith('Open');}
  function circuitCue(dt){
    if(!['circuit','circuit-time'].includes(config.mode)||!scene.matches('svg'))return;
    if(!chargePath?.isConnected){const source=scene.querySelector('path');if(!source)return;chargePath=document.createElementNS('http://www.w3.org/2000/svg','path');chargePath.dataset.liveCue='true';chargePath.setAttribute('fill','none');chargePath.setAttribute('stroke','#80ffe0');chargePath.setAttribute('stroke-width','4');chargePath.setAttribute('stroke-dasharray','1 20');chargePath.setAttribute('stroke-linecap','round');chargePath.setAttribute('d',source.getAttribute('d'));chargePath.style.pointerEvents='none';scene.append(chargePath);}
    const on=isCircuitClosed()&&!paused&&!reduced();chargePath.setAttribute('opacity',on?'.8':'0');if(on)chargeTravel+=dt*25;chargePath.setAttribute('stroke-dashoffset',String(-chargeTravel));
  }
  function pollMeters(){
    if(config.meter&&$('lb-live').checked&&!settingUp&&!paused&&!transition){const b=$(config.meter);if(b&&!b.disabled)b.click();}
    const ids=['watch','tally','motion','response','state','outcome','level','tilt','readout','meter','meters','currentRead','hotRead','hotValues','readings','reading','geometry','position','balance','contact','forces','waterLevel'];
    const lines=[...new Set(ids.map(x=>$(x)?.textContent?.trim()).filter(Boolean))];
    const host=instruments.querySelector('.lb-readings');const text=lines.slice(0,5).join('\n')||'Move the apparatus and use its instruments. Readings appear here; only you record the table.';if(host.textContent!==text)host.textContent=text;
  }
  function frame(now){
    const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
    if(!document.hidden){
      if(transition&&!paused){transitionElapsed+=dt;paintTransition();}
      circuitCue(dt);layoutHandles();
      if(now-lastPoll>250){lastPoll=now;pollMeters();const running=$('pause')&&!$('pause').disabled;$('lb-pause').textContent=dynamic?(running?'Pause':'Resume'):(paused?'Resume':'Pause');if(dynamic){const step=$('step')||$('fine');$('lb-step').textContent=step?.textContent||'Step';}}
    }
    requestAnimationFrame(frame);
  }
  // No fake automatic counts, auto-fitted graphs, or ideal measurements are added.
  showSteps();layoutHandles();pollMeters();requestAnimationFrame(frame);
  document.body.dataset.liveBench=id;document.body.dataset.liveVersion='2026-09-23-motion-1';
  document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;finishTransition();}else last=performance.now();});
}
