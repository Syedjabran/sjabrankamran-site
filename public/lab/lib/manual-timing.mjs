import {simulationDelta} from './live-clock.mjs';
// Shared manual stopwatch/counting UI. No ideal period, automatic cycle counter,
// or apparatus parameter is supplied to students by this helper.
import {$} from './practical-ui.mjs';
export function wireManualTiming({canRelease,onRecord,draw,locked=[],onReset=()=>{},step=.05}){
 let active=false,running=false,elapsed=0,started=null,stopped=null,count=0,recorded=false,last=null;
 $('reduced').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const state=()=>({active,running,elapsed,started,stopped,count});
 function refresh(){for(const id of locked)$(id).disabled=active;$('release').disabled=active||!canRelease();$('resume').disabled=!active||running||$('reduced').checked;$('pause').disabled=!running;$('step').disabled=!active||running;
  $('start').disabled=!active||started!==null;$('count').disabled=started===null||stopped!==null;$('uncount').disabled=started===null||stopped!==null||count===0;$('stop').disabled=started===null||stopped!==null||count<5||elapsed<=started;$('record').disabled=stopped===null||recorded;
  $('watch').textContent=`${started===null?'0.0':((stopped??elapsed)-started).toFixed(1)} s`;$('tally').textContent=`${count} full cycles counted`;$('reset').disabled=false;draw(state());
 }
 function advance(dt){elapsed+=dt;refresh();}
 function frame(now){if(running&&last!==null){const dt=simulationDelta(now,last);if(dt<=60)advance(dt);else{running=false;refresh();}}last=now;requestAnimationFrame(frame);}
 $('release').onclick=()=>{active=true;running=!$('reduced').checked;elapsed=0;last=performance.now();refresh();};$('resume').onclick=()=>{running=true;last=performance.now();refresh();};$('pause').onclick=()=>{running=false;refresh();};$('step').onclick=()=>advance(step);
 $('start').onclick=()=>{started=elapsed;count=0;refresh();};$('count').onclick=()=>{count++;refresh();};$('uncount').onclick=()=>{count--;refresh();};$('stop').onclick=()=>{stopped=elapsed;running=false;refresh();};
 $('record').onclick=()=>{onRecord({elapsed_t:stopped-started,cycles:count});recorded=true;refresh();};
 $('reset').onclick=()=>{active=running=false;elapsed=0;started=stopped=null;count=0;recorded=false;onReset();refresh();};$('reduced').onchange=()=>{running=false;refresh();};document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;refresh();}});
 refresh();requestAnimationFrame(frame);return {refresh,state};
}
