#!/usr/bin/env python3
"""Render the self-contained project-history HTML from graph_data.json."""
import json, os, html, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASE, "graph_data.json"), encoding="utf-8") as f:
    D = json.load(f)

DATA_JSON = json.dumps(D, ensure_ascii=False)
GEN = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sjabrankamran.com — Project History (unskewed)</title>
<style>
  :root{
    --bg:#0B0F14; --panel:#0F151C; --panel2:#131b24; --line:#1e2a36;
    --ink:#E6EEF5; --dim:#93a4b3; --cyan:#3DE1F0; --cyan2:#1eb6c8;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);
    font-family:'Inter',system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
  a{color:var(--cyan);text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{max-width:1400px;margin:0 auto;padding:28px 20px 80px}
  header.top{display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;
    border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px}
  h1{font-size:22px;margin:0;letter-spacing:.2px}
  h1 .accent{color:var(--cyan)}
  .sub{color:var(--dim);font-size:12.5px;margin-top:4px;max-width:820px}
  .note{background:rgba(61,225,240,.08);border:1px solid rgba(61,225,240,.28);
    color:#bfeef5;border-radius:8px;padding:8px 12px;font-size:12.5px;margin-left:auto}
  .note b{color:var(--cyan)}
  section.card{background:var(--panel);border:1px solid var(--line);
    border-radius:12px;padding:16px 16px 8px;margin:18px 0}
  section.card > h2{font-size:15px;margin:0 0 4px;letter-spacing:.3px}
  section.card > .desc{color:var(--dim);font-size:12px;margin:0 0 10px}
  /* stats */
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:6px 0 12px}
  .stat{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
  .stat .n{font-size:22px;font-weight:700;color:var(--cyan)}
  .stat .l{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.6px}
  /* legend */
  .legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin:2px 0 10px}
  .legend .chip{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim)}
  .legend .sw{width:12px;height:12px;border-radius:3px;display:inline-block}
  /* timeline scroll */
  .scroll{overflow-x:auto;overflow-y:hidden;border:1px solid var(--line);
    border-radius:10px;background:var(--panel2)}
  .scroll::-webkit-scrollbar{height:12px}
  .scroll::-webkit-scrollbar-thumb{background:#22303c;border-radius:6px}
  svg{display:block}
  .lane-label{fill:var(--dim);font-size:11px}
  .lane-band:nth-child(even){fill:rgba(255,255,255,0.012)}
  .daycol-head{fill:var(--ink);font-size:11px;font-weight:600}
  .daycol-sub{fill:var(--dim);font-size:9.5px}
  .gaplbl{fill:#5b6c7a;font-size:9px}
  .node{cursor:pointer;transition:r .12s ease}
  .node:hover{stroke:#fff;stroke-width:1.5}
  .mstar{cursor:pointer}
  .grid-v{stroke:var(--line);stroke-width:1}
  .gap-rect{fill:rgba(255,255,255,0.02);stroke:#223} 
  /* bars */
  .bars{display:flex;flex-direction:column;gap:6px;margin-top:4px}
  .bar-row{display:grid;grid-template-columns:190px 1fr 44px;align-items:center;gap:10px;font-size:12px}
  .bar-row .lbl{color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar-track{background:#0c1218;border-radius:6px;height:14px;overflow:hidden;border:1px solid var(--line)}
  .bar-fill{height:100%;border-radius:6px 0 0 6px}
  .bar-row .val{text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}
  /* tooltip */
  #tip{position:fixed;pointer-events:none;z-index:50;max-width:340px;
    background:#0a1219;border:1px solid var(--cyan2);border-radius:8px;
    padding:9px 11px;font-size:12px;box-shadow:0 8px 30px rgba(0,0,0,.6);opacity:0;transition:opacity .1s}
  #tip .h{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--cyan);font-size:11px}
  #tip .d{color:var(--dim);font-size:11px;margin:2px 0 5px}
  #tip .s{color:var(--ink)}
  #tip .tk{display:inline-block;margin-top:6px;padding:1px 7px;border-radius:10px;font-size:10.5px}
  /* detail panel */
  #detail{position:fixed;right:18px;bottom:18px;width:min(420px,92vw);z-index:40;
    background:var(--panel);border:1px solid var(--cyan2);border-radius:12px;
    padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.7);display:none}
  #detail .cls{position:absolute;top:8px;right:12px;color:var(--dim);cursor:pointer;font-size:16px}
  #detail .h{font-family:ui-monospace,monospace;color:var(--cyan);font-size:12px}
  #detail .d{color:var(--dim);font-size:12px;margin:3px 0 8px}
  #detail .s{font-size:13px;line-height:1.5}
  #detail .tk{display:inline-block;margin-top:10px;padding:2px 9px;border-radius:11px;font-size:11px}
  /* dependency DAG */
  .dag-node rect{stroke-width:1.4}
  .dag-node text{fill:var(--ink);font-size:11.5px;font-weight:600}
  .dag-edge{stroke:#33465a;stroke-width:1.6;fill:none;marker-end:url(#arrow)}
  .tier-lbl{fill:#556673;font-size:10px;letter-spacing:.5px;text-transform:uppercase}
  .foot{color:#5b6c7a;font-size:11px;margin-top:22px;text-align:center}
  code{background:#0c1218;border:1px solid var(--line);border-radius:5px;padding:1px 5px;
    font-family:ui-monospace,monospace;font-size:11.5px;color:#bfe}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>sjabrankamran.com <span class="accent">·</span> Website + Education Portal <span class="accent">— Project History</span></h1>
      <div class="sub">Every commit from the first (<b id="firstd"></b>) to the latest (<b id="lastd"></b>), grouped into workstreams. Source of truth: the git commit log; milestone captions verified against daily engineering memory logs.</div>
    </div>
    <div class="note"><b>Time axis is normalized</b> — equal width per <em>active</em> development day; multi-day gaps are shown as fixed-width <b>“no-commit” spacers, not to scale</b>.</div>
  </header>

  <!-- STATS -->
  <section class="card">
    <h2>At a glance</h2>
    <div class="stats" id="stats"></div>
  </section>

  <!-- TIMELINE -->
  <section class="card">
    <h2>Timeline &amp; swimlanes <span style="color:var(--dim);font-weight:400">— equal day-bands, gaps compressed</span></h2>
    <div class="desc">Each column is one active dev day (date + commit count). Grey spacers are calendar gaps with no commits. Each dot is a commit placed in its workstream lane on its day — hover or tap for hash · date · subject. ★ marks a delivered milestone.</div>
    <div class="legend" id="legend"></div>
    <div class="scroll"><svg id="timeline"></svg></div>
  </section>

  <!-- DEPENDENCY DAG -->
  <section class="card">
    <h2>Subsystem dependency view <span style="color:var(--dim);font-weight:400">— layered / topological</span></h2>
    <div class="desc">How the subsystems build on each other, tier by tier (bottom = foundations). Arrows point from a prerequisite to what depends on it.</div>
    <div class="scroll"><svg id="dag"></svg></div>
  </section>

  <!-- HISTOGRAM -->
  <section class="card">
    <h2>Commits per workstream</h2>
    <div class="desc">Distribution of all <span id="tot2"></span> commits across the derived tracks.</div>
    <div class="bars" id="bars"></div>
  </section>

  <div class="foot" id="foot"></div>
</div>

<div id="tip"></div>
<div id="detail"><span class="cls" onclick="document.getElementById('detail').style.display='none'">×</span>
  <div class="h" id="dh"></div><div class="d" id="dd"></div>
  <div class="s" id="ds"></div><span class="tk" id="dt"></span>
</div>

<script>
const D = __DATA__;
const L = D.layout;
const TRACKS = D.tracks;                 // [id,label,colour]
const TMETA = {}; TRACKS.forEach((t,i)=>TMETA[t[0]]={label:t[1],colour:t[2],i:i});
const SVGNS="http://www.w3.org/2000/svg";
function el(tag,attrs,parent){const e=document.createElementNS(SVGNS,tag);
  for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent)parent.appendChild(e); return e;}
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* ---- stats ---- */
const S=D.stats;
document.getElementById('firstd').textContent=S.first;
document.getElementById('lastd').textContent=S.last;
document.getElementById('tot2').textContent=S.total;
const statDefs=[
  ["Total commits",S.total],["Active dev days",S.active_days],
  ["Calendar span",S.span_days+" days"],["Page routes",S.routes],
  ["API routes",S.apis],["Lib modules",S.libs],
];
const statWrap=document.getElementById('stats');
statDefs.forEach(([l,n])=>{const d=document.createElement('div');d.className='stat';
  d.innerHTML='<div class="n">'+n+'</div><div class="l">'+l+'</div>';statWrap.appendChild(d);});

/* ---- legend ---- */
const lg=document.getElementById('legend');
TRACKS.forEach(t=>{const c=document.createElement('div');c.className='chip';
  c.innerHTML='<span class="sw" style="background:'+t[2]+'"></span>'+esc(t[1]);lg.appendChild(c);});

/* ---- tooltip + detail ---- */
const tip=document.getElementById('tip');
function showTip(evt,c){
  tip.innerHTML='<div class="h">'+esc(c.hash)+'</div><div class="d">'+esc(c.date)+' '+esc(c.time)+
    ' · '+esc(c.author)+'</div><div class="s">'+esc(c.subject)+'</div>'+
    '<span class="tk" style="background:'+TMETA[c.track].colour+'22;color:'+TMETA[c.track].colour+
    ';border:1px solid '+TMETA[c.track].colour+'55">'+esc(TMETA[c.track].label)+'</span>';
  tip.style.opacity=1; moveTip(evt);
}
function moveTip(evt){const p=14;let x=evt.clientX+p,y=evt.clientY+p;
  const r=tip.getBoundingClientRect();
  if(x+r.width>innerWidth) x=evt.clientX-r.width-p;
  if(y+r.height>innerHeight) y=evt.clientY-r.height-p;
  tip.style.left=x+'px';tip.style.top=y+'px';}
function hideTip(){tip.style.opacity=0;}
function showDetail(c){
  document.getElementById('dh').textContent=c.hash;
  document.getElementById('dd').textContent=c.date+' '+c.time+' · '+c.author;
  document.getElementById('ds').textContent=c.subject;
  const t=document.getElementById('dt');t.textContent=TMETA[c.track].label;
  t.style.background=TMETA[c.track].colour+'22';t.style.color=TMETA[c.track].colour;
  t.style.border='1px solid '+TMETA[c.track].colour+'55';
  document.getElementById('detail').style.display='block';
}

/* ---- TIMELINE ---- */
(function(){
  const svg=document.getElementById('timeline');
  svg.setAttribute('width',L.PLOT_W); svg.setAttribute('height',L.PLOT_H);
  svg.setAttribute('viewBox','0 0 '+L.PLOT_W+' '+L.PLOT_H);
  // lane bands + labels
  TRACKS.forEach((t,i)=>{
    const y=L.TOP+i*L.LANE_H;
    el('rect',{x:0,y:y,width:L.PLOT_W,height:L.LANE_H,
      fill:(i%2===0)?'rgba(255,255,255,0.015)':'transparent'},svg);
    const tl=el('text',{x:10,y:y+L.LANE_H/2+4,class:'lane-label'},svg);
    tl.textContent=t[1];
    el('rect',{x:L.LEFT-6,y:y+L.LANE_H/2-6,width:4,height:12,rx:2,fill:t[2]},svg);
  });
  // columns
  D.columns.forEach(col=>{
    if(col.type==='gap'){
      el('rect',{x:col.x,y:L.TOP,width:col.w,height:TRACKS.length*L.LANE_H,
        class:'gap-rect',fill:'rgba(255,255,255,0.02)'},svg);
      // hatch
      for(let hy=L.TOP+6; hy<L.TOP+TRACKS.length*L.LANE_H; hy+=10){
        el('line',{x1:col.x+3,y1:hy,x2:col.x+col.w-3,y2:hy-6,stroke:'#1a2733','stroke-width':1},svg);
      }
      const g=el('text',{x:col.x+col.w/2,y:L.TOP-8,class:'gaplbl','text-anchor':'middle'},svg);
      g.textContent=col.days+'d gap';
      const g2=el('text',{x:col.x+col.w/2,y:L.TOP+TRACKS.length*L.LANE_H+16,class:'gaplbl','text-anchor':'middle'},svg);
      g2.textContent='no commits';
    } else {
      // vertical divider
      el('line',{x1:col.x,y1:L.TOP-2,x2:col.x,y2:L.TOP+TRACKS.length*L.LANE_H+2,class:'grid-v'},svg);
      // header date + count
      const md=col.date.slice(5); // MM-DD
      const h1=el('text',{x:col.x+L.DAY_W/2,y:L.TOP-26,class:'daycol-head','text-anchor':'middle'},svg);
      h1.textContent=md;
      const h2=el('text',{x:col.x+L.DAY_W/2,y:L.TOP-13,class:'daycol-sub','text-anchor':'middle'},svg);
      h2.textContent=col.count+(col.count===1?' commit':' commits');
    }
  });
  // right border
  const lastx=L.PLOT_W-40;
  el('line',{x1:lastx,y1:L.TOP-2,x2:lastx,y2:L.TOP+TRACKS.length*L.LANE_H+2,class:'grid-v'},svg);

  // milestones: star above the lane area, on the day column, w/ tick line
  const mByDay={}; D.milestones.forEach(m=>{mByDay[m[0]]=m;});
  D.columns.filter(c=>c.type==='day').forEach(col=>{
    const m=mByDay[col.date]; if(!m) return;
    const mx=col.x+L.DAY_W/2, my=L.TOP-40;
    const star=el('text',{x:mx,y:my,'text-anchor':'middle','font-size':13,fill:'#FFD166',class:'mstar'},svg);
    star.textContent='★';
    star.addEventListener('mousemove',e=>{
      tip.innerHTML='<div class="h">★ '+esc(m[1])+'</div><div class="s">'+esc(m[2])+
        '</div><div class="d" style="margin-top:5px">'+m[3].map(esc).join(' · ')+'</div>';
      tip.style.opacity=1; moveTip(e);
    });
    star.addEventListener('mouseleave',hideTip);
  });

  // nodes
  D.commits.forEach(c=>{
    const col=TMETA[c.track].colour;
    const n=el('circle',{cx:c.cx,cy:c.cy,r:5,fill:col,'fill-opacity':0.92,
      stroke:col,'stroke-width':0.5,class:'node'},svg);
    n.addEventListener('mousemove',e=>showTip(e,c));
    n.addEventListener('mouseleave',hideTip);
    n.addEventListener('click',()=>showDetail(c));
  });
})();

/* ---- DEPENDENCY DAG ---- */
(function(){
  const svg=document.getElementById('dag');
  const nodes=D.dag_nodes, edges=D.dag_edges;
  const tiers={}; nodes.forEach(n=>{(tiers[n[2]]=tiers[n[2]]||[]).push(n);});
  const tierKeys=Object.keys(tiers).map(Number).sort((a,b)=>a-b);
  const NW=132, NH=44, GAPX=34, GAPY=64, PADX=90, PADY=40;
  const maxCols=Math.max(...tierKeys.map(t=>tiers[t].length));
  const W=PADX*2+maxCols*(NW+GAPX)-GAPX;
  const H=PADY*2+tierKeys.length*(NH+GAPY)-GAPY+10;
  svg.setAttribute('width',W);svg.setAttribute('height',H);
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  // arrow marker
  const defs=el('defs',{},svg);
  const mk=el('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,
    markerWidth:7,markerHeight:7,orient:'auto-start-reverse'},defs);
  el('path',{d:'M0,0 L10,5 L0,10 z',fill:'#4a6076'},mk);
  // position: bottom tier = foundations => draw tier 0 at BOTTOM
  const pos={};
  tierKeys.forEach(t=>{
    const row=tiers[t]; const nCols=row.length;
    const rowW=nCols*(NW+GAPX)-GAPX;
    const startX=(W-rowW)/2;
    const y=H-PADY-NH-t*(NH+GAPY);  // tier 0 lowest
    // tier label
    const tl=el('text',{x:12,y:y+NH/2+4,class:'tier-lbl'},svg);
    tl.textContent='Tier '+t;
    row.forEach((n,i)=>{ pos[n[0]]={x:startX+i*(NW+GAPX),y:y}; });
  });
  // edges (draw first, behind)
  edges.forEach(([a,b])=>{
    const pa=pos[a],pb=pos[b]; if(!pa||!pb)return;
    const x1=pa.x+NW/2, y1=pa.y;              // top of prereq
    const x2=pb.x+NW/2, y2=pb.y+NH;           // bottom of dependent
    const my=(y1+y2)/2;
    el('path',{d:'M'+x1+','+y1+' C'+x1+','+my+' '+x2+','+my+' '+x2+','+y2,
      class:'dag-edge'},svg);
  });
  // nodes
  nodes.forEach(n=>{
    const p=pos[n[0]]; const col=TMETA[n[3]]?TMETA[n[3]].colour:'#3DE1F0';
    const g=el('g',{class:'dag-node'},svg);
    el('rect',{x:p.x,y:p.y,width:NW,height:NH,rx:9,fill:col+'1c',stroke:col},g);
    const lines=n[1].split('\n');
    lines.forEach((ln,i)=>{
      const t=el('text',{x:p.x+NW/2,y:p.y+NH/2+4-(lines.length-1)*7+i*14,
        'text-anchor':'middle'},g);
      t.textContent=ln;
    });
  });
})();

/* ---- HISTOGRAM ---- */
(function(){
  const wrap=document.getElementById('bars');
  const per=D.stats.per_track;
  const rows=TRACKS.map(t=>[t[0],t[1],t[2],per[t[0]]||0]).sort((a,b)=>b[3]-a[3]);
  const max=Math.max(...rows.map(r=>r[3]),1);
  rows.forEach(r=>{
    const row=document.createElement('div');row.className='bar-row';
    row.innerHTML='<div class="lbl">'+esc(r[1])+'</div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+(100*r[3]/max)+'%;background:'+r[2]+'"></div></div>'+
      '<div class="val">'+r[3]+'</div>';
    wrap.appendChild(row);
  });
})();

document.getElementById('foot').innerHTML=
  'Generated __GEN__ · source of truth: git commit log ('+D.stats.total+' commits, '+
  D.stats.active_days+' active days, '+D.stats.first+' → '+D.stats.last+
  ') · milestone captions verified against daily engineering memory logs · self-contained, offline, no external requests.';
</script>
</body>
</html>
"""

out = HTML.replace("__DATA__", DATA_JSON).replace("__GEN__", GEN)
with open(os.path.join(BASE, "project-history.html"), "w", encoding="utf-8") as f:
    f.write(out)
print("wrote project-history.html", len(out.encode("utf-8")), "bytes")
