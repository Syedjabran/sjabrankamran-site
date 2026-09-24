/**
 * sprites.mjs — realistic 2D SVG apparatus library for the 9702 virtual lab room.
 * Exports:
 *   shape(part)  -> trusted SVG markup string, centred on (0,0), no wrapper transform.
 *   bounds(part) -> {w,h} positive scene-unit dimensions fully containing shape(part).
 *
 * Integration contract with room.mjs:
 *  - Shapes are cloned into tray buttons, ghost hints and the scene: NO element ids,
 *    no <defs>, no external references. Only the global gradients #steel/#wood/#glass
 *    (defined in index.html) are referenced.
 *  - Parent applies translate/rotate/scale; string/spring/wire are drawn with their
 *    length along local Y so the parent can align and stretch them between endpoints.
 *  - Vessels expose one <rect data-liquid> whose y/height are driven by the room:
 *    surface = h/2-10-(h-25)*fill, so every interior bottom sits at h/2-10.
 *  - Instruments expose <text data-reading> for live values; lamp/led expose
 *    data-lamp="" fills. No hidden physics values or reference answers are drawn —
 *    only generic units, ranges and graduations.
 * Kind alone is ambiguous (see contract review), so variants route on label/id text.
 */

const F = 'font-family="Arial,Helvetica,sans-serif"';
const MONO = 'font-family="Consolas,Menlo,monospace"';
const STEEL = 'url(#steel)', WOOD = 'url(#wood)', GLASS = 'url(#glass)';
const INK = '#33413f', BRASS = '#b08d3f', COPPER = '#b5651d';

const txt = (x, y, s, size, fill = INK, anchor = 'middle', extra = '') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" ${F} ${extra}>${s}</text>`;
const post = (x, y, color) =>
  `<circle cx="${x}" cy="${y}" r="7.5" fill="${color}" stroke="#2f3a38" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="2.6" fill="#26302e"/>`;
const coil = (halfW, y0, y1, turns, color, sw) => {
  let d = `M0 ${y0}`;
  const step = (y1 - y0) / turns;
  for (let i = 0; i < turns; i++) d += ` Q ${i % 2 === 0 ? -halfW : halfW} ${y0 + step * (i + .5)} 0 ${y0 + step * (i + 1)}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
};

/* ---------------------------------------------------------------- stands */
function stand() {
  return { w: 140, h: 330, svg:
    `<rect x="-52" y="146" width="28" height="8" rx="3" fill="#37433f"/>` +
    `<rect x="24" y="146" width="28" height="8" rx="3" fill="#37433f"/>` +
    `<rect x="-70" y="120" width="140" height="28" rx="7" fill="#4d5a57" stroke="#2e3a37" stroke-width="2"/>` +
    `<rect x="-70" y="120" width="140" height="7" rx="3" fill="#68766f"/>` +
    `<rect x="-58" y="-158" width="11" height="282" rx="4" fill="${STEEL}" stroke="#43585a" stroke-width="1.4"/>` +
    `<rect x="-60.5" y="-165" width="16" height="10" rx="4" fill="#43585a"/>` +
    `<circle cx="-52.5" cy="-70" r="9" fill="none" stroke="#43585a" stroke-width="4"/>` };
}

/* ------------------------------------------------------- peg / pin / prism */
function peg(label) {
  if (/prism|knife/i.test(label)) // triangular knife-edge prism
    return { w: 84, h: 58, svg:
      `<path d="M-40 26 L40 26 L0 -26 Z" fill="${WOOD}" stroke="#6d4a22" stroke-width="2"/>` +
      `<path d="M0 -26 L0 26" stroke="#6d4a22" stroke-width="1"/>` +
      `<path d="M-40 26 L0 -26" stroke="#e9cd96" stroke-width="2"/>` +
      `<rect x="-46" y="26" width="92" height="6" rx="2" fill="#5c4326"/>` };
  if (/cork/i.test(label)) // pin pushed through a cork
    return { w: 80, h: 48, svg:
      `<rect x="-26" y="-14" width="52" height="30" rx="9" fill="#c8a06a" stroke="#8f6c3d" stroke-width="1.6"/>` +
      `<path d="M-18 -14 V16 M-6 -14 V16 M8 -14 V16 M20 -14 V16" stroke="#a07c4b" stroke-width="1.2"/>` +
      `<rect x="-38" y="-2" width="76" height="4" fill="${STEEL}" stroke="#43585a" stroke-width=".8"/>` +
      `<circle cx="-36" cy="0" r="6" fill="${STEEL}" stroke="#43585a"/>` +
      `<path d="M38 -3 L46 0 L38 3 Z" fill="#8fa7a8"/>` };
  // plain pivot nail, drawn horizontal, head left, point right
  return { w: 78, h: 24, svg:
    `<rect x="-32" y="-3.5" width="62" height="7" rx="2" fill="${STEEL}" stroke="#43585a" stroke-width="1"/>` +
    `<circle cx="-32" cy="0" r="8" fill="${STEEL}" stroke="#3c5052" stroke-width="1.6"/>` +
    `<circle cx="-34.5" cy="-2.5" r="2.2" fill="#e8f4f4"/>` +
    `<path d="M30 -4.5 L42 0 L30 4.5 Z" fill="#9db4b5" stroke="#43585a" stroke-width="1"/>` };
}

/* ---------------------------------------------- clamp: G-clamp or croc clip */
function clamp(label) {
  if (/contact|junction|shunt|null|clip/i.test(label)) { // crocodile / sliding contact
    return { w: 82, h: 36, svg:
      `<circle cx="-37" cy="0" r="6.5" fill="${BRASS}" stroke="#6d5420" stroke-width="1.4"/>` +
      `<rect x="-34" y="-13" width="22" height="11" rx="5" fill="#b03a32" stroke="#7e2721" stroke-width="1"/>` +
      `<rect x="-34" y="2" width="22" height="11" rx="5" fill="#2b2f2e" stroke="#141716" stroke-width="1"/>` +
      `<path d="M-12 -6 L34 -1.5 L34 1.5 L-12 1 Z" fill="#c7cdd2" stroke="#7d8a8e" stroke-width="1"/>` +
      `<path d="M-12 6 L34 1.5 L34 -1.5 L-12 -1 Z" fill="#aeb8bd" stroke="#7d8a8e" stroke-width="1"/>` +
      `<path d="M26 -1.8 V1.8 M30 -1.6 V1.6 M22 -2 V2" stroke="#5c686b" stroke-width="1.4"/>` +
      `<circle cx="-8" cy="0" r="4" fill="#6f8280" stroke="#3c4a48" stroke-width="1.2"/>` };
  }
  // G-clamp / boss clamp
  return { w: 96, h: 72, svg:
    `<path d="M8 -30 L-26 -30 L-26 30 L8 30" fill="none" stroke="#4e6266" stroke-width="13" stroke-linejoin="round"/>` +
    `<path d="M8 -30 L-26 -30 L-26 30 L8 30" fill="none" stroke="#7c9699" stroke-width="4" stroke-linejoin="round"/>` +
    `<circle cx="12" cy="-30" r="6" fill="#8fa3a1" stroke="#3c4a48" stroke-width="1.4"/>` +
    `<rect x="-7" y="6" width="9" height="26" fill="${STEEL}" stroke="#3c4a48"/>` +
    `<circle cx="-2.5" cy="4" r="7" fill="#8fa3a1" stroke="#3c4a48" stroke-width="1.4"/>` +
    `<rect x="-20" y="30" width="34" height="6" rx="3" fill="#37433f"/>` +
    `<circle cx="-26" cy="-2" r="5.5" fill="#2e3a37"/>` };
}

/* ------------------------------------------------------------------- rods */
function rod(label) {
  const holes = (horiz, len, yx, step, r = 4.2) => {
    let s = '';
    for (let p = -len / 2 + step; p < len / 2 - 4; p += step) {
      const x = horiz ? p : yx, y = horiz ? yx : p;
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#4b3418" stroke="#2e2010" stroke-width="1"/>` +
           `<circle cx="${x - 1}" cy="${y - 1}" r="${r * .4}" fill="#7a5c33"/>`;
    }
    return s;
  };
  const grain = (w, h) =>
    `<path d="M${-w / 2 + 8} ${-h / 4} q ${w / 4} 3 ${w / 2} 0 t ${w / 2 - 8} 0" fill="none" stroke="#b9854c" stroke-width="1" opacity=".7"/>` +
    `<path d="M${-w / 2 + 6} ${h / 4} q ${w / 3} -3 ${w * .6} 0" fill="none" stroke="#b9854c" stroke-width="1" opacity=".6"/>`;
  if (/spindle/i.test(label))
    return { w: 30, h: 300, svg:
      `<rect x="-6" y="-140" width="12" height="268" rx="4" fill="${STEEL}" stroke="#43585a" stroke-width="1.2"/>` +
      `<path d="M-6 128 L0 146 L6 128 Z" fill="#8fa7a8" stroke="#43585a"/>` +
      `<rect x="-13" y="-24" width="26" height="10" rx="4" fill="#43585a"/>` +
      `<circle cx="0" cy="-19" r="3" fill="#c8d8d8"/>` };
  if (/interruption|obstruction|support rod|smooth/i.test(label)) // horizontal dowel
    return { w: 174, h: 26, svg:
      `<rect x="-85" y="-9" width="170" height="18" rx="9" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.6"/>` +
      `<ellipse cx="-85" cy="0" rx="5" ry="9" fill="#8a6132"/>` +
      `<ellipse cx="85" cy="0" rx="5" ry="9" fill="#caa06a" stroke="#6d4a22"/>` +
      grain(160, 18) };
  if (/vertical|stem/i.test(label))
    return { w: 38, h: 300, svg:
      `<rect x="-17" y="-148" width="34" height="296" rx="5" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.8"/>` +
      holes(false, 286, 0, 30) + `<path d="M-8 -140 V140" stroke="#b9854c" stroke-width="1" opacity=".6"/>` };
  if (/thin/i.test(label))
    return { w: 264, h: 20, svg:
      `<rect x="-132" y="-8" width="264" height="16" rx="4" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.4"/>` + grain(250, 14) };
  if (/pointer|lever/i.test(label))
    return { w: 322, h: 32, svg:
      `<path d="M-158 -14 L138 -14 L162 0 L138 14 L-158 14 Z" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.8"/>` +
      holes(true, 280, 0, 32) +
      `<path d="M138 -14 L162 0 L138 14 Z" fill="#a8472f" stroke="#7e2f1d" stroke-width="1.2"/>` + grain(270, 20) };
  if (/grooved|notched/i.test(label)) {
    let cuts = '';
    for (let x = -130; x <= 130; x += 26) cuts += /grooved/i.test(label)
      ? `<path d="M${x} -17 l5 7 l5 -7" fill="none" stroke="#4b3418" stroke-width="2.4"/>`
      : `<rect x="${x}" y="-17" width="7" height="8" fill="#4b3418"/>`;
    return { w: 302, h: 34, svg:
      `<rect x="-151" y="-17" width="302" height="34" rx="5" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.8"/>` + cuts + grain(290, 24) };
  }
  // default drilled wooden strip
  return { w: 302, h: 36, svg:
    `<rect x="-151" y="-18" width="302" height="36" rx="5" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.8"/>` +
    holes(true, 290, 0, 30) + grain(290, 26) };
}

/* -------------------------------------------------- spring / string / wire */
function spring() {
  return { w: 42, h: 72, svg:
    `<circle cx="0" cy="-31" r="4.5" fill="none" stroke="#5c7477" stroke-width="2.6"/>` +
    `<path d="M0 -26.5 L0 -22" stroke="#5c7477" stroke-width="3"/>` +
    coil(15, -22, 22, 7, '#5c7477', 4.6) +
    coil(15, -22, 22, 7, '#cfe0e1', 1.5) +
    `<path d="M0 22 L0 26.5" stroke="#5c7477" stroke-width="3"/>` +
    `<circle cx="0" cy="31" r="4.5" fill="none" stroke="#5c7477" stroke-width="2.6"/>` };
}
function string() {
  return { w: 16, h: 120, svg:
    `<circle cx="0" cy="-55" r="5" fill="none" stroke="#c9bd93" stroke-width="2.4"/>` +
    `<path d="M0 -50 L0 50" stroke="#ddd2ab" stroke-width="2.8"/>` +
    `<path d="M-2 -50 L-2 50" stroke="#b3a67c" stroke-width=".8"/>` +
    `<circle cx="0" cy="55" r="5" fill="none" stroke="#c9bd93" stroke-width="2.4"/>` };
}
function wire(label) {
  if (/lead/i.test(label)) // flexible shorting/connecting lead with clips
    return { w: 66, h: 130, svg:
      `<path d="M0 -56 C -30 -30 30 -10 0 8 C -30 26 22 40 0 56" fill="none" stroke="#26302e" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M-9 -66 L9 -66 L4 -52 L-4 -52 Z" fill="#b03a32" stroke="#7e2721"/>` +
      `<path d="M-9 66 L9 66 L4 52 L-4 52 Z" fill="#2b2f2e" stroke="#141716"/>` };
  if (/folded/i.test(label)) // doubled-back wire, both ends at top
    return { w: 40, h: 240, svg:
      `<rect x="-18" y="-118" width="14" height="9" rx="2" fill="${BRASS}" stroke="#6d5420"/>` +
      `<rect x="4" y="-118" width="14" height="9" rx="2" fill="${BRASS}" stroke="#6d5420"/>` +
      `<path d="M-11 -109 L-11 96 Q-11 110 0 110 Q11 110 11 96 L11 -109" fill="none" stroke="#a35f35" stroke-width="3.4"/>` +
      `<path d="M-11 -109 L-11 96 Q-11 110 0 110 Q11 110 11 96 L11 -109" fill="none" stroke="#d89a6a" stroke-width="1.1"/>` };
  // taut resistance wire between terminal posts (length along local Y)
  return { w: 26, h: 240, svg:
    `<rect x="-13" y="-120" width="26" height="9" rx="2" fill="${BRASS}" stroke="#6d5420" stroke-width="1.2"/>` +
    `<rect x="-13" y="111" width="26" height="9" rx="2" fill="${BRASS}" stroke="#6d5420" stroke-width="1.2"/>` +
    `<circle cx="0" cy="-115.5" r="2.4" fill="#26302e"/><circle cx="0" cy="115.5" r="2.4" fill="#26302e"/>` +
    `<path d="M0 -111 L0 111" stroke="#a35f35" stroke-width="3.2"/>` +
    `<path d="M-1 -111 L-1 111" stroke="#d89a6a" stroke-width="1"/>` };
}

/* ------------------------------------------------------------------ masses */
function hanger(scale = 1, heavy = false) {
  const discs = heavy ? 4 : 3, w = heavy ? 60 : 52, dh = 15;
  let s = `<circle cx="0" cy="-42" r="6" fill="none" stroke="#5c7477" stroke-width="3"/>` +
    `<rect x="-3.5" y="-37" width="7" height="26" fill="${STEEL}" stroke="#43585a" stroke-width="1"/>`;
  for (let i = 0; i < discs; i++) {
    const y = -11 + i * dh;
    s += `<rect x="${-w / 2}" y="${y}" width="${w}" height="${dh - 2}" rx="4" fill="${STEEL}" stroke="#3c5052" stroke-width="1.4"/>` +
      `<path d="M0 ${y + 2} L${w / 2} ${y + 2} L${w / 2} ${y + 6} L0 ${y + 6}" fill="#7c9699" stroke="#3c5052" stroke-width=".8"/>`;
  }
  s += txt(0, -11 + dh * 1.5 + 1, 'MASS', 8.5, '#2c3f41');
  s += `<path d="M-8 ${-11 + discs * dh} L0 ${-11 + discs * dh + 9} L8 ${-11 + discs * dh} Z" fill="#5c7477"/>`;
  const top = -48 * scale, bot = -11 + discs * dh + 9;
  return { w: Math.max(64, w + 14), h: bot - top + 4, yOff: (bot + top) / 2, svg: s, rawTop: top, rawBot: bot };
}
function mass(label) {
  if (/nut/i.test(label)) {
    const hex = (cx, cy, r) => {
      let p = '';
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; p += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)} `; }
      return p + 'Z';
    };
    if (/set/i.test(label))
      return { w: 64, h: 70, svg:
        `<path d="${hex(0, -20, 19)}" fill="${STEEL}" stroke="#3c5052" stroke-width="1.6"/><circle cx="0" cy="-20" r="8" fill="#4d5a57"/>` +
        `<path d="${hex(0, 2, 19)}" fill="${STEEL}" stroke="#3c5052" stroke-width="1.6"/><circle cx="0" cy="2" r="8" fill="#4d5a57"/>` +
        `<path d="${hex(0, 24, 19)}" fill="${STEEL}" stroke="#3c5052" stroke-width="1.6"/><circle cx="0" cy="24" r="8" fill="#4d5a57"/>` };
    const r = /heavier/i.test(label) ? 24 : 19;
    return { w: r * 2 + 12, h: r * 2 + 12, svg:
      `<path d="${hex(0, 0, r + 4)}" fill="${STEEL}" stroke="#3c5052" stroke-width="1.8"/>` +
      `<circle cx="0" cy="0" r="${r * .45}" fill="#4d5a57" stroke="#2e3a37" stroke-width="1.4"/>` +
      `<circle cx="0" cy="0" r="${r * .45 - 3}" fill="none" stroke="#7c9699" stroke-width="1" stroke-dasharray="2 2"/>` };
  }
  if (/stack|support/i.test(label)) // raised-end support stack of blocks
    return { w: 88, h: 92, svg:
      `<rect x="-42" y="14" width="84" height="28" rx="3" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.6"/>` +
      `<rect x="-38" y="-12" width="76" height="26" rx="3" fill="#caa06a" stroke="#6d4a22" stroke-width="1.6"/>` +
      `<rect x="-42" y="-40" width="84" height="28" rx="3" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.6"/>` +
      `<path d="M-30 -32 h60 M-34 -4 h68 M-30 24 h60" stroke="#a97c44" stroke-width="1.2"/>` };
  if (/transferable|small masses/i.test(label)) {
    let s = '<rect x="-50" y="12" width="100" height="6" rx="2" fill="#8a6132"/>';
    for (let i = 0; i < 4; i++) s +=
      `<rect x="${-44 + i * 24}" y="-10" width="18" height="22" rx="4" fill="${STEEL}" stroke="#3c5052" stroke-width="1.2"/>` +
      `<circle cx="${-35 + i * 24}" cy="-13" r="3.4" fill="none" stroke="#5c7477" stroke-width="2"/>`;
    return { w: 104, h: 42, svg: s };
  }
  if (/calibration/i.test(label)) // hanger with pan
    return { w: 72, h: 104, svg:
      `<circle cx="0" cy="-46" r="5.5" fill="none" stroke="#5c7477" stroke-width="2.8"/>` +
      `<path d="M0 -40 L0 12" stroke="#5c7477" stroke-width="3"/>` +
      `<path d="M-34 12 Q0 44 34 12" fill="${STEEL}" stroke="#3c5052" stroke-width="1.6"/>` +
      `<path d="M-34 12 L-20 -6 M34 12 L20 -6 M0 12 L0 -6" stroke="#5c7477" stroke-width="2"/>` +
      `<rect x="-20" y="-16" width="40" height="11" rx="3" fill="${STEEL}" stroke="#3c5052"/>` +
      txt(0, 34, 'MASS', 8, '#2c3f41') };
  if (/small rotating/i.test(label))
    return { w: 44, h: 40, svg:
      `<ellipse cx="0" cy="-14" rx="18" ry="6" fill="#c8d8d8" stroke="#3c5052"/>` +
      `<rect x="-18" y="-14" width="36" height="26" fill="${STEEL}" stroke="#3c5052" stroke-width="1.4"/>` +
      `<ellipse cx="0" cy="12" rx="18" ry="6" fill="#7c9699" stroke="#3c5052"/>` +
      `<circle cx="0" cy="-24" r="4" fill="none" stroke="#5c7477" stroke-width="2.4"/>` };
  const spec = hanger(1, /heavy|central load|fixed lower/i.test(label));
  // recentre vertically
  const cy = spec.yOff || 0;
  return { w: spec.w, h: spec.h, svg: `<g transform="translate(0 ${-cy})">${spec.svg}</g>` };
}

/* ------------------------------------------------------------- bob / ball */
function bob(label) {
  if (/clay|putty|sphere of clay/i.test(label)) // modelling-clay lump
    return { w: 64, h: 52, svg:
      `<path d="M-28 6 Q-30 -14 -12 -20 Q-2 -28 12 -22 Q30 -16 28 2 Q30 18 12 22 Q-4 28 -18 20 Q-28 16 -28 6 Z" fill="#b56b4d" stroke="#7e452a" stroke-width="1.8"/>` +
      `<path d="M-14 -6 q6 -5 12 0 M-6 8 q7 -4 14 1 M4 -14 q5 -3 10 1" fill="none" stroke="#8f4f31" stroke-width="1.4"/>` +
      `<circle cx="0" cy="-22" r="4" fill="none" stroke="#5c7477" stroke-width="2.4"/>` };
  return { w: 58, h: 72, svg: // brass pendulum bob
    `<circle cx="0" cy="-30" r="5" fill="none" stroke="#5c7477" stroke-width="2.6"/>` +
    `<rect x="-3" y="-27" width="6" height="8" fill="#5c7477"/>` +
    `<circle cx="0" cy="2" r="26" fill="#c9a13b" stroke="#8a6a1d" stroke-width="2"/>` +
    `<path d="M-16 -12 A20 20 0 0 1 8 -16" fill="none" stroke="#eed88f" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M-4.5 26 L0 35 L4.5 26 Z" fill="#8a6a1d"/>` };
}
function ball() {
  return { w: 54, h: 60, svg:
    `<circle cx="0" cy="-25" r="4.5" fill="none" stroke="#5c7477" stroke-width="2.4"/>` +
    `<circle cx="0" cy="2" r="24" fill="${STEEL}" stroke="#3c5052" stroke-width="1.8"/>` +
    `<circle cx="-8" cy="-6" r="6" fill="#e8f4f4" opacity=".8"/>` };
}

/* ----------------------------------------------------------------- pulley */
function pulley() {
  let spokes = '';
  for (const a of [0, 60, 120]) spokes += `<path d="M${-19 * Math.cos(a * Math.PI / 180)} ${8 - 19 * Math.sin(a * Math.PI / 180)} L${19 * Math.cos(a * Math.PI / 180)} ${8 + 19 * Math.sin(a * Math.PI / 180)}" stroke="#a3987f" stroke-width="3"/>`;
  return { w: 80, h: 98, svg:
    `<rect x="-9" y="-49" width="18" height="12" rx="3" fill="#4e6266" stroke="#2e3a37" stroke-width="1.4"/>` +
    `<circle cx="0" cy="-43" r="3" fill="#26302e"/>` +
    `<path d="M-26 -37 L-26 0 L26 0 L26 -37 Z" fill="#6e8a88" stroke="#3c4a48" stroke-width="1.6"/>` +
    spokes +
    `<circle cx="0" cy="8" r="26" fill="none" stroke="#d8d2c4" stroke-width="9"/>` +
    `<circle cx="0" cy="8" r="26" fill="none" stroke="#7a735e" stroke-width="1.6"/>` +
    `<circle cx="0" cy="8" r="21.5" fill="none" stroke="#7a735e" stroke-width="1.2"/>` +
    `<circle cx="0" cy="8" r="5.5" fill="${STEEL}" stroke="#3c4a48" stroke-width="1.4"/>` +
    `<path d="M-26 0 L26 0" stroke="#3c4a48" stroke-width="1.6"/>` };
}

/* ----------------------------------------------------------------- boards */
function board(label) {
  if (/glass/i.test(label))
    return { w: 152, h: 124, svg:
      `<rect x="-74" y="-60" width="148" height="120" rx="4" fill="${GLASS}" stroke="#8fb4bc" stroke-width="2.4"/>` +
      `<path d="M-58 44 L40 -52" stroke="#ffffff" stroke-width="5" opacity=".45"/>` +
      `<rect x="-74" y="-60" width="148" height="10" fill="#ffffff" opacity=".3"/>` };
  if (/acrylic/i.test(label))
    return { w: 142, h: 142, svg:
      `<rect x="-69" y="-69" width="138" height="138" rx="6" fill="#dff0f5" fill-opacity=".55" stroke="#9cc3cd" stroke-width="2.6"/>` +
      `<rect x="-60" y="-60" width="120" height="120" rx="4" fill="none" stroke="#ffffff" stroke-width="2" opacity=".5"/>` +
      `<circle cx="-58" cy="-58" r="4" fill="#9cc3cd"/><circle cx="58" cy="-58" r="4" fill="#9cc3cd"/>` +
      `<circle cx="-58" cy="58" r="4" fill="#9cc3cd"/><circle cx="58" cy="58" r="4" fill="#9cc3cd"/>` };
  if (/set square/i.test(label))
    return { w: 164, h: 122, svg:
      `<path d="M-80 58 L80 58 L-80 -58 Z M-56 38 L-56 -34 L46 38 Z" fill="#d5e4ea" fill-opacity=".85" stroke="#7fa3ad" stroke-width="2" fill-rule="evenodd"/>` +
      Array.from({ length: 13 }, (_, i) => `<path d="M${-72 + i * 12} 58 V${i % 4 === 0 ? 46 : 51}" stroke="#5f7f88" stroke-width="1.1"/>`).join('') +
      txt(-52, 50, '0', 6, '#5f7f88') + txt(68, 50, '12', 6, '#5f7f88') };
  if (/holder/i.test(label))
    return { w: 222, h: 122, svg:
      `<rect x="-111" y="-61" width="222" height="122" rx="6" fill="#e8e2cf" stroke="#a99f7d" stroke-width="2"/>` +
      Array.from({ length: 15 }, (_, i) => `<circle cx="${-80 + (i % 5) * 40}" cy="${-34 + Math.floor(i / 5) * 34}" r="4" fill="#b8ad8b" stroke="#8f8562"/>`).join('') +
      `<rect x="-111" y="-61" width="222" height="9" fill="#c9c0a2"/>` };
  if (/track|rail/i.test(label)) // two-rail UPVC track
    return { w: 302, h: 56, svg:
      `<rect x="-151" y="-26" width="302" height="18" rx="6" fill="#dfe4e6" stroke="#93a1a4" stroke-width="1.8"/>` +
      `<rect x="-145" y="-22" width="290" height="5" rx="2" fill="#aeb9bc"/>` +
      `<rect x="-151" y="8" width="302" height="18" rx="6" fill="#dfe4e6" stroke="#93a1a4" stroke-width="1.8"/>` +
      `<rect x="-145" y="12" width="290" height="5" rx="2" fill="#aeb9bc"/>` +
      `<rect x="-151" y="-28" width="10" height="56" rx="3" fill="#7d8f92"/>` +
      `<rect x="141" y="-28" width="10" height="56" rx="3" fill="#7d8f92"/>` };
  if (/pendulum board/i.test(label)) {
    let grid = '';
    for (let x = -100; x <= 100; x += 40) grid += `<path d="M${x} -88 V88" stroke="#c8a469" stroke-width="1" opacity=".55"/>`;
    for (let y = -60; y <= 60; y += 40) grid += `<path d="M-128 ${y} H128" stroke="#c8a469" stroke-width="1" opacity=".55"/>`;
    return { w: 282, h: 202, svg:
      `<rect x="-141" y="-101" width="282" height="202" rx="6" fill="${WOOD}" stroke="#6d4a22" stroke-width="2.4"/>` + grid +
      `<rect x="-141" y="-101" width="282" height="12" rx="5" fill="#8a6132"/>` };
  }
  if (/adjustable/i.test(label)) // wedge support with height steps
    return { w: 104, h: 84, svg:
      `<path d="M-50 40 L50 40 L50 -8 L-18 40 Z" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.8"/>` +
      `<path d="M-50 40 L-50 12 L-20 40 Z" fill="#8a6132" stroke="#6d4a22" stroke-width="1.4"/>` +
      `<path d="M6 28 h34 M20 16 h20 M32 5 h12" stroke="#6d4a22" stroke-width="2.4"/>` +
      `<rect x="-50" y="40" width="100" height="6" fill="#5c4326"/>` };
  if (/block|obstacle/i.test(label))
    return { w: 94, h: 80, svg:
      `<rect x="-47" y="-38" width="94" height="76" rx="4" fill="${WOOD}" stroke="#6d4a22" stroke-width="2"/>` +
      `<path d="M-36 -20 h70 M-40 0 h78 M-36 20 h70" stroke="#b9854c" stroke-width="1.4" opacity=".8"/>` +
      `<rect x="-47" y="-38" width="94" height="9" fill="#caa06a"/>` };
  // plain plank / mounting strip / inclined board
  return { w: 262, h: 42, svg:
    `<rect x="-131" y="-21" width="262" height="42" rx="4" fill="${WOOD}" stroke="#6d4a22" stroke-width="2"/>` +
    `<path d="M-118 -8 q40 4 80 0 t80 0 t78 0 M-118 9 q52 -4 104 0 t100 0" fill="none" stroke="#b9854c" stroke-width="1.2" opacity=".75"/>` +
    `<rect x="-131" y="-21" width="262" height="6" fill="#caa06a" opacity=".8"/>` };
}

/* ------------------------------------------------------------------- card */
function card(label) {
  if (/filter/i.test(label)) { // stack of filter-paper discs
    let s = '';
    [[-7, 8, '#e9e6da'], [6, 2, '#f2f0e6'], [0, -6, '#faf8ef']].forEach(([x, y, f]) =>
      s += `<circle cx="${x}" cy="${y}" r="40" fill="${f}" stroke="#c9c4b0" stroke-width="1.6"/>`);
    return { w: 102, h: 108, svg: s +
      `<path d="M0 -46 V34 M-40 -6 H40" stroke="#d8d3bd" stroke-width="1.2"/>` +
      `<circle cx="0" cy="-6" r="26" fill="none" stroke="#e3ddc8" stroke-width="1"/>` };
  }
  if (/shim/i.test(label)) { // counted paper shims
    let s = '';
    for (let i = 0; i < 4; i++) s += `<rect x="${-42 + i * 3}" y="${-24 + i * 11}" width="84" height="12" rx="2" fill="${i % 2 ? '#f4f1e4' : '#faf8ef'}" stroke="#c9c4b0"/>`;
    return { w: 96, h: 66, svg: s };
  }
  if (/gate/i.test(label)) // release card gate with bottom slot
    return { w: 74, h: 104, svg:
      `<path d="M-35 -50 L35 -50 L35 50 L10 50 L10 22 L-10 22 L-10 50 L-35 50 Z" fill="#efe7c8" stroke="#a99a68" stroke-width="1.8"/>` +
      `<circle cx="0" cy="-36" r="4.5" fill="#edf3ed" stroke="#a99a68" stroke-width="1.4"/>` +
      `<path d="M-26 -20 H26 M-26 -8 H26" stroke="#d8cd9f" stroke-width="1.2"/>` };
  if (/stiff|disc|spin/i.test(label)) // rotating card disc on spindle
    return { w: 126, h: 126, svg:
      `<circle cx="0" cy="0" r="60" fill="#f2ecd8" stroke="#a99a68" stroke-width="2.2"/>` +
      `<circle cx="0" cy="0" r="40" fill="none" stroke="#d8cd9f" stroke-width="1.4" stroke-dasharray="5 4"/>` +
      `<path d="M0 0 L42 -42" stroke="#a8472f" stroke-width="3"/>` +
      `<circle cx="0" cy="0" r="7" fill="#edf3ed" stroke="#8a7d55" stroke-width="2"/>` +
      Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path d="M${52 * Math.cos(a)} ${52 * Math.sin(a)} L${58 * Math.cos(a)} ${58 * Math.sin(a)}" stroke="#b3a26e" stroke-width="1.6"/>`; }).join('') };
  if (/lamina|sloping|irregular/i.test(label)) // irregular lamina with hole
    return { w: 152, h: 152, svg:
      `<path d="M-62 -72 L48 -72 L72 8 L20 72 L-70 40 Z" fill="#f5efdd" stroke="#8a7d55" stroke-width="2.2"/>` +
      `<circle cx="-38" cy="-48" r="5.5" fill="#edf3ed" stroke="#8a7d55" stroke-width="1.8"/>` +
      `<path d="M-50 30 L40 -50 M-20 55 L60 -30" stroke="#ddd3ae" stroke-width="1.2"/>` +
      `<circle cx="6" cy="4" r="3" fill="#a8472f"/>` };
  return { w: 132, h: 92, svg: // plain stiff card
    `<rect x="-66" y="-46" width="132" height="92" rx="4" fill="#f5efdd" stroke="#8a7d55" stroke-width="2"/>` +
    `<circle cx="0" cy="-32" r="4.5" fill="#edf3ed" stroke="#8a7d55" stroke-width="1.6"/>` +
    `<path d="M-54 -12 H54 M-54 4 H54 M-54 20 H54" stroke="#e0d7b4" stroke-width="1.4"/>` };
}

/* ------------------------------------------------------------- cylinders */
function cylinder(label) {
  if (/measuring/i.test(label)) { // graduated measuring cylinder
    let g = '';
    for (let i = 0; i <= 10; i++) {
      const y = 78 - i * 15.6;
      g += `<path d="M14 ${y} H${i % 5 === 0 ? 30 : i % 2 === 0 ? 26 : 22}" stroke="#5f7f88" stroke-width="1.1"/>`;
      if (i % 2 === 0) g += txt(33, y + 2.5, String(i * 10), 6.5, '#5f7f88', 'start');
    }
    return { w: 92, h: 192, svg:
      `<rect x="-40" y="82" width="80" height="12" rx="3" fill="#aecdd3" stroke="#7fa3ad" stroke-width="1.6"/>` +
      `<rect x="-30" y="-82" width="60" height="164" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2"/>` +
      `<path d="M-30 -82 Q-36 -92 -26 -90 L-30 -82 M30 -82 L30 -90" fill="none" stroke="#7fa3ad" stroke-width="2"/>` +
      `<rect data-liquid="" x="-24" y="-21.8" width="48" height="103.8" fill="#4babc0" opacity=".72"/>` +
      g + txt(0, -66, 'cm³', 7, '#5f7f88') };
  }
  // solid wrapping cylinder (wood)
  return { w: 96, h: 122, svg:
    `<rect x="-45" y="-48" width="90" height="96" fill="${WOOD}" stroke="#6d4a22" stroke-width="1.8"/>` +
    `<ellipse cx="0" cy="-48" rx="45" ry="12" fill="#caa06a" stroke="#6d4a22" stroke-width="1.8"/>` +
    `<ellipse cx="0" cy="-48" rx="30" ry="7" fill="none" stroke="#a97c44" stroke-width="1.2"/>` +
    `<ellipse cx="0" cy="48" rx="45" ry="12" fill="none" stroke="#6d4a22" stroke-width="1.8"/>` +
    `<path d="M-45 -30 V30 M45 -30 V30" stroke="#a97c44" stroke-width="1"/>` };
}

/* ------------------------------------------------------------------ tubes */
function tube(label) {
  if (/u-?tube/i.test(label)) {
    const wall = 'stroke="#aecdd3" stroke-width="17" fill="none" opacity=".6"';
    const path = 'M-45 -100 L-45 88 Q-45 110 -22 110 L22 110 Q45 110 45 88 L45 -100';
    let ticks = '';
    for (let i = 0; i <= 8; i++) ticks += `<path d="M-72 ${90 - i * 22} H${i % 2 === 0 ? -60 : -64}" stroke="#5f7f88" stroke-width="1.2"/>`;
    return { w: 172, h: 242, svg:
      `<path d="${path}" ${wall} stroke-linecap="round"/>` +
      `<path d="M-45 30 L-45 88 Q-45 110 -22 110 L22 110 Q45 110 45 88 L45 44" stroke="#3f9db4" stroke-width="9" fill="none"/>` +
      `<rect data-liquid="" x="-52.5" y="30" width="15" height="80" fill="#3f9db4" opacity=".85"/>` +
      `<path d="${path}" stroke="#e8f6f8" stroke-width="3" fill="none" opacity=".7" transform="translate(-4 0)"/>` +
      ticks };
  }
  if (/settling/i.test(label)) {
    let g = '';
    for (let i = 0; i <= 10; i++) {
      const y = 128 - i * 26;
      g += `<path d="M16 ${y} H${i % 5 === 0 ? 32 : 26}" stroke="#5f7f88" stroke-width="1.2"/>`;
      if (i % 5 === 0) g += txt(35, y + 2.5, String(i * 10), 6.5, '#5f7f88', 'start');
    }
    return { w: 102, h: 302, svg:
      `<path d="M-26 -146 L-26 120 Q-26 141 0 141 Q26 141 26 120 L26 -146" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
      `<ellipse cx="0" cy="-146" rx="26" ry="6" fill="#e8f6f8" stroke="#7fa3ad" stroke-width="2"/>` +
      `<rect data-liquid="" x="-20" y="30.5" width="40" height="110" fill="#4babc0" opacity=".55"/>` +
      g };
  }
  if (/nozzle/i.test(label))
    return { w: 58, h: 92, svg:
      `<rect x="-24" y="-44" width="48" height="14" rx="4" fill="${STEEL}" stroke="#43585a" stroke-width="1.4"/>` +
      `<path d="M-20 -30 L20 -30 L7 38 L-7 38 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2"/>` +
      `<ellipse cx="0" cy="40" rx="7.5" ry="3" fill="#2e3a37"/>` +
      `<path d="M-12 -22 L-4 30" stroke="#ffffff" stroke-width="2.4" opacity=".5"/>` };
  if (/funnel/i.test(label))
    return { w: 102, h: 112, svg:
      `<ellipse cx="0" cy="-46" rx="48" ry="9" fill="#e8f6f8" stroke="#7fa3ad" stroke-width="2"/>` +
      `<path d="M-48 -46 L-9 6 L-9 52 L9 52 L9 6 L48 -46" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
      `<path d="M-34 -34 L-12 -4" stroke="#ffffff" stroke-width="2.6" opacity=".5"/>` };
  // horizontal translucent pipe (PEX / plastic)
  return { w: 232, h: 58, svg:
    `<rect x="-116" y="-26" width="232" height="52" rx="24" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
    `<ellipse cx="-116" cy="0" rx="7" ry="24" fill="#cfe4e8" stroke="#7fa3ad" stroke-width="2"/>` +
    `<ellipse cx="116" cy="0" rx="7" ry="24" fill="#9fc3cb" stroke="#7fa3ad" stroke-width="2"/>` +
    `<path d="M-104 -14 H104" stroke="#ffffff" stroke-width="3" opacity=".5"/>` +
    `<path d="M-104 16 H104" stroke="#8fb4bc" stroke-width="1.4" opacity=".6"/>` };
}

/* ---------------------------------------------------------- beaker / bowl */
function beaker(label) {
  if (/bowl/i.test(label))
    return { w: 172, h: 92, svg:
      `<path d="M-84 -26 L84 -26 Q84 36 0 36 Q-84 36 -84 -26 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
      `<ellipse cx="0" cy="-26" rx="84" ry="10" fill="#e8f6f8" stroke="#7fa3ad" stroke-width="2"/>` +
      `<rect data-liquid="" x="-72" y="3" width="144" height="33" fill="#4babc0" opacity=".6"/>` +
      `<ellipse cx="0" cy="-26" rx="72" ry="7" fill="#4babc0" opacity=".55"/>` };
  if (/optical|container|tank/i.test(label))
    return { w: 172, h: 162, svg:
      `<rect x="-84" y="-72" width="168" height="146" rx="4" fill="${GLASS}" stroke="#7fa3ad" stroke-width="3"/>` +
      `<rect data-liquid="" x="-77" y="-1.7" width="154" height="72.9" fill="#4babc0" opacity=".5"/>` +
      `<path d="M-70 -60 L-40 60" stroke="#ffffff" stroke-width="4" opacity=".4"/>` +
      `<rect x="-84" y="-72" width="168" height="8" fill="#ffffff" opacity=".35"/>` };
  let g = '';
  for (let i = 1; i <= 4; i++) g += `<path d="M-46 ${58 - i * 26} H-32" stroke="#5f7f88" stroke-width="1.2"/>`;
  return { w: 122, h: 142, svg: // standard graduated beaker
    `<path d="M-52 -62 L-52 62 L52 62 L52 -62 L44 -70 L52 -62" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
    `<path d="M-52 -62 L-60 -70" stroke="#7fa3ad" stroke-width="2.2"/>` +
    `<rect data-liquid="" x="-46" y="-4.5" width="92" height="66.5" fill="#4babc0" opacity=".62"/>` +
    g + txt(0, 78 - 116, 'cm³', 7, '#5f7f88') };
}

/* ----------------------------------------------------------------- bottle */
function bottle(label) {
  const hot = /hot/i.test(label), pierced = /pierced/i.test(label);
  const word = /sugar/i.test(label) ? 'SUGAR' : hot ? 'HOT WATER' : /oil/i.test(label) ? 'OIL' : 'WATER';
  const liquid = /oil/i.test(label) ? '#d9a52a' : '#4babc0';
  if (/drinks|cylindrical/i.test(label)) // cylindrical drinks bottle
    return { w: 92, h: 202, svg:
      `<rect x="-14" y="-100" width="28" height="14" rx="4" fill="#3a6ea5"/>` +
      `<rect x="-11" y="-88" width="22" height="12" fill="#cfe4e8" stroke="#7fa3ad"/>` +
      `<rect x="-38" y="-76" width="76" height="166" rx="16" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
      `<rect data-liquid="" x="-31" y="13.2" width="62" height="73" fill="${liquid}" opacity=".7"/>` +
      `<rect x="-38" y="-30" width="76" height="34" rx="4" fill="#f4efe0" stroke="#c9c0a2"/>` +
      txt(0, -9, word, 9, '#6d5420') +
      `<path d="M-38 -60 q38 8 76 0 M-38 60 q38 -8 76 0" fill="none" stroke="#9fc3cb" stroke-width="1.4"/>` };
  const marks = /marked/i.test(label)
    ? `<path d="M30 -40 h10 M30 -10 h10 M30 20 h10" stroke="#33413f" stroke-width="2.2"/>` : '';
  const hole = pierced
    ? `<circle cx="40" cy="34" r="5" fill="#26302e"/><circle cx="40" cy="34" r="7.5" fill="none" stroke="#7fa3ad" stroke-width="1.6"/>` : '';
  return { w: 92, h: 182, svg:
    `<rect x="-15" y="-92" width="30" height="14" rx="4" fill="${hot ? '#b03a32' : '#3a6ea5'}"/>` +
    `<rect x="-12" y="-80" width="24" height="16" fill="#cfe4e8" stroke="#7fa3ad" stroke-width="1.4"/>` +
    `<path d="M-12 -64 Q-38 -52 -38 -26 L-38 70 Q-38 82 -26 82 L26 82 Q38 82 38 70 L38 -26 Q38 -52 12 -64 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
    `<rect data-liquid="" x="-31" y="10.4" width="62" height="70.6" fill="${liquid}" opacity=".7"/>` +
    `<rect x="-30" y="-18" width="60" height="30" rx="3" fill="#f4efe0" stroke="#c9c0a2"/>` +
    txt(0, 1, word, hot ? 7.5 : 9, '#6d5420') + marks + hole +
    (hot ? `<path d="M-10 -104 q5 -7 0 -14 M4 -104 q5 -7 0 -14" fill="none" stroke="#9db4b5" stroke-width="2" stroke-linecap="round"/>` : '') };
}

/* ------------------------------------------------------------- water / oil */
function waterOil(kind, label) {
  const oil = kind === 'oil';
  const liquid = oil ? '#d9a52a' : '#4babc0';
  const word = oil ? 'OIL' : /hot/i.test(label) ? 'HOT' : 'WATER';
  if (/jug|pitcher/i.test(label))
    return { w: 106, h: 152, svg:
      `<path d="M-34 -64 L34 -64 L34 56 Q34 68 22 68 L-22 68 Q-34 68 -34 56 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
      `<path d="M34 -50 Q56 -44 54 -16 Q52 8 34 4" fill="none" stroke="#7fa3ad" stroke-width="7"/>` +
      `<path d="M-34 -64 L-44 -56 L-34 -50" fill="none" stroke="#7fa3ad" stroke-width="2.2"/>` +
      `<rect data-liquid="" x="-28" y="9.8" width="56" height="56.2" fill="${liquid}" opacity=".68"/>` +
      txt(0, -30, word, 9, '#5f7f88') };
  return { w: 86, h: 152, svg:
    `<rect x="-14" y="-76" width="28" height="13" rx="4" fill="${oil ? '#4a7d3a' : '#3a6ea5'}"/>` +
    `<rect x="-11" y="-64" width="22" height="12" fill="#cfe4e8" stroke="#7fa3ad" stroke-width="1.2"/>` +
    `<path d="M-11 -52 Q-36 -42 -36 -18 L-36 56 Q-36 68 -24 68 L24 68 Q36 68 36 56 L36 -18 Q36 -42 11 -52 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2"/>` +
    `<rect data-liquid="" x="-29" y="7.9" width="58" height="59.1" fill="${liquid}" opacity=".7"/>` +
    `<rect x="-28" y="-12" width="56" height="24" rx="3" fill="#f4efe0" stroke="#c9c0a2"/>` +
    txt(0, 4, word, 8.5, '#6d5420') };
}

/* ------------------------------------------------------------- syringes */
function syringe(label) {
  if (/dropper|pipette/i.test(label))
    return { w: 46, h: 132, svg:
      `<circle cx="0" cy="-46" r="15" fill="#b03a32" stroke="#7e2721" stroke-width="1.8"/>` +
      `<rect x="-6" y="-32" width="12" height="76" rx="5" fill="${GLASS}" stroke="#7fa3ad" stroke-width="1.8"/>` +
      `<path d="M-6 44 L-2 64 L2 64 L6 44 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="1.6"/>` +
      `<rect x="-3.5" y="6" width="7" height="36" fill="#d9a52a" opacity=".75"/>` +
      `<circle cx="0" cy="70" r="2.6" fill="#d9a52a"/>` };
  let g = '';
  for (let i = 0; i <= 10; i++) {
    const y = 56 - i * 12.6;
    g += `<path d="M8 ${y} H${i % 5 === 0 ? 22 : 16}" stroke="#33413f" stroke-width="1.1"/>`;
    if (i % 5 === 0) g += txt(25, y + 2.5, String(i * 5), 6.5, '#33413f', 'start');
  }
  return { w: 72, h: 192, svg:
    `<rect x="-21" y="-96" width="42" height="11" rx="4" fill="${STEEL}" stroke="#43585a" stroke-width="1.2"/>` +
    `<rect x="-5" y="-85" width="10" height="38" fill="#c8d8d8" stroke="#43585a" stroke-width="1"/>` +
    `<rect x="-22" y="-47" width="44" height="11" rx="3" fill="#3c4a48"/>` +
    `<rect x="-26" y="-36" width="52" height="124" rx="5" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.2"/>` +
    `<rect x="-26" y="-36" width="52" height="9" fill="#9fc3cb"/>` +
    `<rect data-liquid="" x="-21" y="23.7" width="42" height="62.3" fill="#4babc0" opacity=".6"/>` +
    `<path d="M-8 88 L8 88 L4 96 L-4 96 Z" fill="#9fc3cb" stroke="#7fa3ad" stroke-width="1.4"/>` +
    g + txt(0, 62, 'cm³', 6.5, '#33413f') };
}

/* ------------------------------------------------------------- electrical */
function cell() {
  return { w: 132, h: 78, svg:
    `<rect x="-66" y="-32" width="132" height="64" rx="9" fill="#3c4a49" stroke="#222d2c" stroke-width="2"/>` +
    `<rect x="-54" y="-21" width="48" height="42" rx="19" fill="${STEEL}" stroke="#2e3a37" stroke-width="1.6"/>` +
    `<rect x="6" y="-21" width="48" height="42" rx="19" fill="${STEEL}" stroke="#2e3a37" stroke-width="1.6"/>` +
    `<rect x="-38" y="-21" width="10" height="42" fill="#b03a32"/>` +
    `<rect x="22" y="-21" width="10" height="42" fill="#b03a32"/>` +
    txt(-30, 4, '1.5 V', 8, '#26302e') + txt(30, 4, '1.5 V', 8, '#26302e') +
    post(-66, 0, '#2b2f2e') + post(66, 0, '#c0453c') +
    txt(-66, -12, '−', 12, '#e8ecea') + txt(66, -12, '+', 12, '#e8ecea') };
}
function onOffSwitch(label) {
  if (/two-way|charge/i.test(label))
    return { w: 132, h: 88, svg:
      `<rect x="-66" y="-38" width="132" height="76" rx="7" fill="#8a6a3d" stroke="#5c4326" stroke-width="2"/>` +
      post(-40, -16, BRASS) + post(40, -16, BRASS) + post(0, 26, BRASS) +
      `<path data-switch="two-way" d="M0 22 L-34 -10" stroke="#d8c07a" stroke-width="7" stroke-linecap="round"/>` +
      `<circle cx="0" cy="24" r="5" fill="#6d5420"/>` +
      `<circle cx="-36" cy="-13" r="5" fill="#d8c07a" stroke="#6d5420"/>` +
      txt(-40, -26, 'C', 8, '#f4e8c8') + txt(40, -26, 'D', 8, '#f4e8c8') + txt(0, 40, 'COM', 7, '#f4e8c8') };
  return { w: 122, h: 68, svg: // knife switch, drawn open
    `<rect x="-61" y="-26" width="122" height="52" rx="7" fill="#8a6a3d" stroke="#5c4326" stroke-width="2"/>` +
    `<rect x="-46" y="-10" width="16" height="22" rx="3" fill="${BRASS}" stroke="#6d5420" stroke-width="1.4"/>` +
    `<rect x="28" y="-10" width="16" height="22" rx="3" fill="${BRASS}" stroke="#6d5420" stroke-width="1.4"/>` +
    `<path data-switch="knife" d="M-38 -4 L34 -22" stroke="#d8c07a" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="-38" cy="-4" r="5.5" fill="#6d5420"/>` +
    `<circle data-switch-knob="" cx="38" cy="-24" r="6.5" fill="#3c4a48" stroke="#222d2c" stroke-width="1.4"/>` +
    `<circle cx="-50" cy="18" r="2.4" fill="#5c4326"/><circle cx="50" cy="18" r="2.4" fill="#5c4326"/>` +
    post(-61, 2, BRASS) + post(61, 2, BRASS) };
}
function resistor(label) {
  if (/variable|rheostat/i.test(label)) { // rheostat with slider
    let wind = '';
    for (let x = -62; x <= 62; x += 6.4) wind += `<path d="M${x} -14 V12" stroke="${COPPER}" stroke-width="2.6"/>`;
    return { w: 172, h: 94, svg:
      `<rect x="-86" y="16" width="172" height="26" rx="6" fill="#e8e2cf" stroke="#a99f7d" stroke-width="1.8"/>` +
      `<rect x="-70" y="-18" width="140" height="34" rx="15" fill="#cfc8b4" stroke="#8f8562" stroke-width="1.8"/>` +
      wind +
      `<rect x="-70" y="-38" width="140" height="7" rx="3" fill="${STEEL}" stroke="#43585a"/>` +
      `<rect x="4" y="-46" width="20" height="18" rx="3" fill="#4e6266" stroke="#2e3a37" stroke-width="1.4"/>` +
      `<path d="M14 -28 L14 -16" stroke="#2e3a37" stroke-width="4"/>` +
      post(-86, 29, BRASS) + post(86, 29, BRASS) + post(14, -46, BRASS) };
  }
  const bands = ['#7a4a2b', '#26302e', '#b03a32', '#c9a13b'];
  return { w: 142, h: 74, svg: // mounted fixed resistor
    `<rect x="-71" y="-32" width="142" height="64" rx="7" fill="#efe9da" stroke="#b3a98c" stroke-width="1.8"/>` +
    `<path d="M-64 0 H-46 M46 0 H64" stroke="#8f9a98" stroke-width="3.4"/>` +
    `<rect x="-46" y="-13" width="92" height="26" rx="12" fill="#d9c9a8" stroke="#a3946e" stroke-width="1.6"/>` +
    bands.map((c, i) => `<rect x="${-28 + i * 15}" y="-13" width="6" height="26" fill="${c}"/>`).join('') +
    `<path d="M-40 -7 h80" stroke="#f4ead0" stroke-width="2" opacity=".7"/>` +
    post(-71, 0, BRASS) + post(71, 0, BRASS) +
    txt(0, 27, 'Ω', 10, '#6d5c33') };
}
function capacitor() {
  return { w: 102, h: 106, svg:
    `<rect x="-51" y="32" width="102" height="18" rx="5" fill="#3c4a49" stroke="#222d2c" stroke-width="1.6"/>` +
    `<path d="M-28 32 L-46 41 M28 32 L46 41" stroke="#8f9a98" stroke-width="4"/>` +
    `<rect x="-31" y="-46" width="62" height="82" rx="16" fill="${STEEL}" stroke="#2e3a37" stroke-width="1.8"/>` +
    `<rect x="-31" y="-46" width="62" height="30" rx="16" fill="#2f4a68"/>` +
    `<path d="M-31 -32 h62" stroke="#22384f" stroke-width="2"/>` +
    txt(0, -27, 'µF', 10, '#dbe6ee') +
    `<path d="M-18 4 h10 M-13 -1 v10" stroke="#c0453c" stroke-width="2.4"/>` +
    `<circle cx="-20" cy="-50" r="3.4" fill="#c8d8d8" stroke="#43585a"/><circle cx="20" cy="-50" r="3.4" fill="#c8d8d8" stroke="#43585a"/>` +
    post(-51, 41, '#2b2f2e') + post(51, 41, '#c0453c') };
}
function meter(kind) {
  const letter = { ammeter: 'A', voltmeter: 'V', ohmmeter: 'Ω', galvanometer: 'G' }[kind] || 'V';
  const centre = kind === 'galvanometer';
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = (225 - i * 27) * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const major = i % 5 === 0;
    ticks += `<path d="M${38 * c} ${10 + 38 * s} L${47 * c} ${10 + 47 * s}" stroke="${INK}" stroke-width="${major ? 1.8 : 1.1}"/>`;
    if (major || centre) {
      const v = centre ? i - 5 : i;
      if (major || i % 5 === 0 || centre && i % 5 === 0)
        ticks += txt((29 * c).toFixed(1), (10 + 29 * s + 2.5).toFixed(1), String(v), 7.5, INK);
    }
  }
  const needleA = centre ? 90 : 112; // galvanometer needle at centre-zero
  const na = needleA * Math.PI / 180;
  return { w: 134, h: 118, svg:
    `<rect x="-67" y="-57" width="134" height="106" rx="11" fill="#454f4d" stroke="#222d2c" stroke-width="2"/>` +
    `<rect x="-59" y="-49" width="118" height="68" rx="6" fill="#fbf7ea" stroke="#c9c0a2"/>` +
    `<path d="M${44 * Math.cos(225 * Math.PI / 180)} ${10 + 44 * Math.sin(225 * Math.PI / 180)} A44 44 0 0 1 ${44 * Math.cos(-45 * Math.PI / 180)} ${10 + 44 * Math.sin(-45 * Math.PI / 180)}" fill="none" stroke="${INK}" stroke-width="1.6"/>` +
    ticks +
    txt(0, -36, letter, 19, INK, 'middle', 'font-weight="bold"') +
    (centre ? txt(0, 4, '0', 7, '#a8472f') : '') +
    `<path d="M0 10 L${34 * Math.cos(na)} ${10 + 34 * Math.sin(na)}" stroke="#b03a32" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="0" cy="10" r="4.4" fill="#26302e"/>` +
    `<rect x="-33" y="24" width="66" height="16" rx="2.5" fill="#e4ebe2" stroke="#9db4b5"/>` +
    `<text data-reading="" x="0" y="36" text-anchor="middle" font-size="11.5" fill="#26302e" ${MONO}>—</text>` +
    post(-32, 45, '#2b2f2e') + post(32, 45, '#c0453c') +
    txt(-32, 57.5, '−', 9, '#e8ecea') + txt(32, 57.5, '+', 9, '#e8ecea') };
}
function coilPart() {
  let turns = '';
  for (let x = -38; x <= 38; x += 5.8) turns += `<rect x="${x - 1.6}" y="-36" width="3.6" height="72" rx="1.8" fill="${COPPER}" stroke="#8a4a16" stroke-width=".6"/>`;
  return { w: 122, h: 122, svg:
    `<rect x="-56" y="46" width="30" height="12" rx="3" fill="#4d5a57"/><rect x="26" y="46" width="30" height="12" rx="3" fill="#4d5a57"/>` +
    `<rect x="-47" y="-42" width="94" height="88" rx="10" fill="#e4ddc8" stroke="#a99f7d" stroke-width="2"/>` +
    turns +
    `<path d="M-47 -42 h94 M-47 46 h94" stroke="#a99f7d" stroke-width="2.4"/>` +
    `<path d="M-58 0 H-47 M47 0 H58" stroke="#8f9a98" stroke-width="3.4"/>` +
    post(-61, 0, BRASS) + post(61, 0, BRASS) };
}
function led() {
  return { w: 58, h: 88, svg:
    `<rect x="-10" y="22" width="5.5" height="38" fill="${STEEL}" stroke="#43585a" stroke-width=".8"/>` +
    `<rect x="5" y="22" width="5.5" height="30" fill="${STEEL}" stroke="#43585a" stroke-width=".8"/>` +
    `<path d="M-18 20 L-18 -6 A18 18 0 0 1 18 -6 L18 20 Z" data-lamp="" fill="#839187" stroke="#5c6a60" stroke-width="2"/>` +
    `<rect x="-22" y="16" width="44" height="7" rx="3" fill="#9aa79c" stroke="#5c6a60" stroke-width="1.2"/>` +
    `<path d="M-8 -14 A12 12 0 0 1 6 -14" fill="none" stroke="#ffffff" stroke-width="2" opacity=".4"/>` };
}
function ldr() {
  return { w: 62, h: 80, svg:
    `<rect x="-11" y="24" width="5.5" height="34" fill="${STEEL}" stroke="#43585a" stroke-width=".8"/>` +
    `<rect x="6" y="24" width="5.5" height="34" fill="${STEEL}" stroke="#43585a" stroke-width=".8"/>` +
    `<circle cx="0" cy="0" r="24" fill="#d8ceb8" stroke="#8a7d55" stroke-width="2.2"/>` +
    `<circle cx="0" cy="0" r="19" fill="#e8e0c8" stroke="#b3a26e" stroke-width="1"/>` +
    `<path d="M-13 -10 L-6 -16 L0 -10 L7 -16 L13 -10 M-13 0 L-6 -6 L0 0 L7 -6 L13 0 M-13 10 L-6 4 L0 10 L7 4 L13 10" fill="none" stroke="#7a4f2a" stroke-width="2.2"/>` +
    `<path d="M-24 0 H-19 M19 0 H24" stroke="#8a7d55" stroke-width="2"/>` };
}
function lamp() { // LED torch as light object
  return { w: 136, h: 68, svg:
    `<rect x="-62" y="-19" width="76" height="38" rx="16" fill="#3f5a66" stroke="#22363e" stroke-width="2"/>` +
    `<path d="M-48 -19 V19 M-36 -19 V19 M-24 -19 V19" stroke="#2c424c" stroke-width="2.4"/>` +
    `<rect x="-16" y="-26" width="20" height="8" rx="4" fill="#c0453c" stroke="#7e2721" stroke-width="1.2"/>` +
    `<path d="M14 -26 L46 -30 L46 30 L14 26 Z" fill="#2f454f" stroke="#22363e" stroke-width="2"/>` +
    `<circle cx="52" cy="0" r="21" fill="#22363e"/>` +
    `<circle cx="52" cy="0" r="17" data-lamp="" fill="#839187" stroke="#c8d8d8" stroke-width="2"/>` +
    `<path d="M45 -7 A12 12 0 0 1 57 -9" fill="none" stroke="#ffffff" stroke-width="2.4" opacity=".5"/>` };
}

/* ------------------------------------------------------- optical elements */
function lens() {
  return { w: 62, h: 162, svg:
    `<rect x="-15" y="66" width="30" height="14" rx="4" fill="#4d5a57" stroke="#2e3a37" stroke-width="1.4"/>` +
    `<path d="M0 -72 C 36 -38 36 38 0 72 C -36 38 -36 -38 0 -72 Z" fill="${GLASS}" stroke="#7fa3ad" stroke-width="2.4"/>` +
    `<path d="M-12 -50 C 6 -30 6 30 -12 50" fill="none" stroke="#ffffff" stroke-width="2.6" opacity=".55"/>` +
    `<path d="M0 -80 V-72 M0 72 V80" stroke="#7fa3ad" stroke-width="1.4" stroke-dasharray="3 3"/>` };
}
function screen() {
  return { w: 102, h: 126, svg:
    `<rect x="-51" y="52" width="102" height="11" rx="4" fill="#6b7a72" stroke="#43504b" stroke-width="1.4"/>` +
    `<rect x="-5" y="40" width="10" height="14" fill="#8a9891"/>` +
    `<rect x="-43" y="-62" width="86" height="104" rx="3" fill="#fbfaf2" stroke="#9aa7a4" stroke-width="2.2"/>` +
    `<path d="M-43 -10 H43 M0 -62 V42" stroke="#d8dcd2" stroke-width="1.2"/>` +
    `<rect x="-43" y="-62" width="86" height="12" rx="3" fill="#eef0e8"/>` };
}

/* ------------------------------------------------------------------- tray */
function tray() {
  return { w: 186, h: 80, svg:
    `<rect x="-93" y="-38" width="186" height="16" rx="7" fill="#cfdfe2" stroke="#6e878d" stroke-width="1.8"/>` +
    `<rect x="-93" y="-26" width="186" height="62" rx="6" fill="#b9cdd2" stroke="#6e878d" stroke-width="2"/>` +
    `<rect x="-83" y="-17" width="166" height="42" rx="4" fill="#93aab0"/>` +
    `<path d="M-83 -17 L-93 -26 M83 -17 L93 -26" stroke="#6e878d" stroke-width="1.6"/>` +
    `<path d="M-76 -10 H76" stroke="#c3d4d8" stroke-width="2" opacity=".7"/>` };
}

/* ------------------------------------------------------- measurement: ruler */
function ruler(label) {
  const vertical = /vertical|sag|head/i.test(label);
  const L = 336, ticks = [];
  for (let i = 0; i <= 100; i++) {
    const p = -L / 2 + i * (L / 100), long = i % 10 === 0, mid = i % 5 === 0;
    const len = long ? 15 : mid ? 10 : 6;
    if (vertical) ticks.push(`<path d="M-21 ${p} H${-21 + len}" stroke="#5a4520" stroke-width="${long ? 1.4 : .8}"/>`);
    else ticks.push(`<path d="M${p} -21 V${-21 + len}" stroke="#5a4520" stroke-width="${long ? 1.4 : .8}"/>`);
    if (long) ticks.push(vertical
      ? txt(4, p + 3, String(i), 8, '#4a3816')
      : txt(p, 17, String(i), 8.5, '#4a3816'));
  }
  const body = vertical
    ? `<rect x="-23" y="-178" width="46" height="356" rx="3" fill="${WOOD}" stroke="#8a6a35" stroke-width="1.8"/>`
    : `<rect x="-178" y="-23" width="356" height="46" rx="3" fill="${WOOD}" stroke="#8a6a35" stroke-width="1.8"/>`;
  const unit = vertical ? txt(2, -164, 'cm', 7, '#4a3816') : txt(164, 17, 'cm', 7.5, '#4a3816');
  const brace = vertical
    ? `<rect x="-23" y="-178" width="46" height="7" fill="#c9a13b"/><rect x="-23" y="171" width="46" height="7" fill="#c9a13b"/>`
    : `<rect x="-178" y="-23" width="7" height="46" fill="#c9a13b"/><rect x="171" y="-23" width="7" height="46" fill="#c9a13b"/>`;
  return vertical
    ? { w: 48, h: 358, svg: body + brace + ticks.join('') + unit }
    : { w: 358, h: 48, svg: body + brace + ticks.join('') + unit };
}
function protractor() {
  const cy = 44, R = 88;
  let s = `<path d="M-88 ${cy} A88 88 0 0 1 88 ${cy} Z M-56 ${cy} A56 56 0 0 1 56 ${cy} Z" fill="#d9e7ec" fill-opacity=".8" stroke="#7fa3ad" stroke-width="2" fill-rule="evenodd"/>`;
  for (let a = 0; a <= 180; a += 5) {
    const rad = (180 - a) * Math.PI / 180, c = Math.cos(rad), si = Math.sin(rad);
    const inner = a % 10 === 0 ? 74 : 80;
    s += `<path d="M${(inner * c).toFixed(1)} ${(cy - inner * si).toFixed(1)} L${(87 * c).toFixed(1)} ${(cy - 87 * si).toFixed(1)}" stroke="#5f7f88" stroke-width="${a % 10 === 0 ? 1.5 : .9}"/>`;
    if (a % 10 === 0) s += txt((66 * c).toFixed(1), (cy - 66 * si + 2.5).toFixed(1), String(a), 6.8, '#4a6a72');
  }
  s += `<path d="M-88 ${cy} H88" stroke="#5f7f88" stroke-width="2"/>` +
    `<circle cx="0" cy="${cy}" r="3" fill="none" stroke="#a8472f" stroke-width="1.6"/>` +
    `<path d="M0 ${cy} V${cy - 52}" stroke="#a8472f" stroke-width="1" stroke-dasharray="3 3"/>`;
  return { w: 188, h: 96, svg: s };
}

/* ------------------------------------------- micrometer / caliper / others */
function micrometer() {
  let sleeveTicks = '';
  for (let i = 0; i <= 8; i++) {
    const x = -38 + i * 5.6;
    sleeveTicks += `<path d="M${x} -10 V${i % 2 === 0 ? -2 : -5}" stroke="#2c3f41" stroke-width="1.1"/>`;
  }
  let thimbleTicks = '';
  for (let i = 0; i < 10; i++) thimbleTicks += `<path d="M${15 + i * 3.3} -12 V-6" stroke="#2c3f41" stroke-width="${i % 5 === 0 ? 1.3 : .8}"/>`;
  return { w: 162, h: 102, svg:
    `<path d="M-52 -2 C-76 -2 -76 42 -40 42 L18 42 C44 42 52 26 52 10" fill="none" stroke="#48615f" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M-52 -2 C-76 -2 -76 42 -40 42 L18 42 C44 42 52 26 52 10" fill="none" stroke="#6e8a88" stroke-width="3.4" stroke-linecap="round"/>` +
    `<rect x="-58" y="-9" width="12" height="18" rx="2" fill="${STEEL}" stroke="#2c3f41" stroke-width="1.2"/>` +
    `<rect x="-46" y="-10" width="58" height="20" fill="${STEEL}" stroke="#2c3f41" stroke-width="1.2"/>` +
    `<path d="M-44 0 H10" stroke="#2c3f41" stroke-width="1.2"/>` +
    sleeveTicks + txt(-35, 17, '0', 7, '#2c3f41') + txt(-13, 17, '5', 7, '#2c3f41') + txt(4, 17, '10', 7, '#2c3f41') +
    txt(-20, 27, 'mm', 6.5, '#2c3f41') +
    `<rect x="12" y="-12" width="36" height="24" rx="3" fill="#6e8a88" stroke="#2c3f41" stroke-width="1.2"/>` +
    thimbleTicks + txt(30, 16, '0', 7, '#f0f4f1') +
    `<rect x="48" y="-8" width="17" height="16" rx="5" fill="#556f6d" stroke="#2c3f41" stroke-width="1.2"/>` +
    `<circle cx="70" cy="0" r="4.5" fill="#48615f"/>` };
}
function caliper() {
  let ticks = '';
  for (let i = 0; i <= 15; i++) {
    const x = -92 + i * 12;
    ticks += `<path d="M${x} -7 V${i % 5 === 0 ? 1 : -2}" stroke="#2c3f41" stroke-width="1"/>`;
    if (i % 5 === 0) ticks += txt(x, 15, String(i), 6.5, '#2c3f41');
  }
  let vernier = '';
  for (let i = 0; i < 6; i++) vernier += `<path d="M${-22 + i * 6} 2 V9" stroke="#1f2c2a" stroke-width="1"/>`;
  return { w: 226, h: 70, svg:
    `<rect x="-98" y="-7" width="192" height="14" rx="2" fill="${STEEL}" stroke="#3c4a48" stroke-width="1.2"/>` +
    `<rect x="94" y="-2.5" width="18" height="5" fill="#8fa3a1" stroke="#3c4a48"/>` +
    ticks + txt(84, 15, 'cm', 6.5, '#2c3f41') +
    `<path d="M-98 -7 L-112 -7 L-112 -33 L-104 -33 L-104 -11 L-98 -11 Z" fill="${STEEL}" stroke="#3c4a48" stroke-width="1.2"/>` +
    `<path d="M-98 7 L-108 7 L-108 28 L-101 28 L-101 10 L-98 10 Z" fill="${STEEL}" stroke="#3c4a48" stroke-width="1.2"/>` +
    `<rect x="-26" y="-13" width="38" height="28" rx="3" fill="#6e8a88" stroke="#2c3f41" stroke-width="1.4"/>` +
    vernier +
    `<path d="M-26 -13 L-38 -13 L-38 -35 L-30 -35 L-30 -15 L-26 -15 Z" fill="#6e8a88" stroke="#3c4a48" stroke-width="1.2"/>` +
    `<path d="M-26 15 L-34 15 L-34 30 L-28 30 L-28 17 L-26 17 Z" fill="#6e8a88" stroke="#3c4a48" stroke-width="1.2"/>` +
    `<circle cx="8" cy="19" r="6" fill="#8fa3a1" stroke="#2c3f41" stroke-width="1.2"/>` +
    `<path d="M4.5 19 h7 M8 15.5 v7" stroke="#2c3f41" stroke-width="1"/>` +
    `<rect x="-6" y="-19" width="9" height="7" rx="2" fill="#556f6d" stroke="#2c3f41"/>` };
}
function thermometer() {
  let g = '';
  for (let t = 0; t <= 10; t++) {
    const y = 62 - t * 14;
    g += `<path d="M6 ${y} H${t % 2 === 0 ? 14 : 11}" stroke="#5a4a3a" stroke-width="1.1"/>`;
    if (t % 2 === 0) g += txt(17, y + 2.5, String(t * 10), 6.5, '#5a4a3a', 'start');
  }
  return { w: 58, h: 202, svg:
    `<rect x="-14" y="-86" width="28" height="164" rx="9" fill="#f6f3e6" stroke="#c9c0a2" stroke-width="1.4"/>` +
    `<rect x="-6" y="-82" width="12" height="156" fill="${GLASS}" stroke="#7fa3ad" stroke-width="1.6"/>` +
    `<rect x="-2.5" y="-8" width="5" height="82" fill="#c0392b"/>` +
    `<circle cx="0" cy="80" r="13" fill="${GLASS}" stroke="#7fa3ad" stroke-width="1.8"/>` +
    `<circle cx="0" cy="80" r="8.5" fill="#c0392b"/>` +
    g + txt(17, -78, '°C', 7, '#5a4a3a', 'start') +
    `<rect x="-21" y="-100" width="42" height="13" rx="2.5" fill="#e4ebe2" stroke="#9db4b5"/>` +
    `<text data-reading="" x="0" y="-90" text-anchor="middle" font-size="8.5" fill="#26302e" ${MONO}>—</text>` };
}
function balance() {
  return { w: 182, h: 122, svg:
    `<rect x="-72" y="52" width="26" height="8" rx="3" fill="#6f7d7a"/><rect x="46" y="52" width="26" height="8" rx="3" fill="#6f7d7a"/>` +
    `<rect x="-91" y="-10" width="182" height="64" rx="9" fill="#e9ecea" stroke="#9aa7a4" stroke-width="2"/>` +
    `<rect x="-70" y="-14" width="140" height="7" rx="3" fill="#c3cecb"/>` +
    `<rect x="-9" y="-24" width="18" height="12" fill="#8fa3a1" stroke="#5c7477"/>` +
    `<ellipse cx="0" cy="-26" rx="58" ry="11" fill="${STEEL}" stroke="#5c7477" stroke-width="1.8"/>` +
    `<ellipse cx="0" cy="-29" rx="52" ry="8" fill="#dce8e8"/>` +
    `<rect x="-62" y="2" width="78" height="30" rx="4" fill="#26302e"/>` +
    `<text data-reading="" x="-23" y="23" text-anchor="middle" font-size="16" fill="#b8e6c3" ${MONO}>—</text>` +
    txt(6, 23, 'g', 10, '#b8e6c3', 'start') +
    `<circle cx="48" cy="17" r="8" fill="#c9d2cf" stroke="#8a9891" stroke-width="1.4"/>` + txt(48, 20.5, 'T', 7.5, '#43504b') +
    `<circle cx="72" cy="17" r="8" fill="#c9d2cf" stroke="#8a9891" stroke-width="1.4"/>` + txt(72, 20.5, 'M', 7.5, '#43504b') };
}
function newtonMeter() {
  let g = '';
  for (let i = 0; i <= 10; i++) {
    const y = -66 + i * 9.4;
    g += `<path d="M-16 ${y} H${i % 5 === 0 ? -8 : -11}" stroke="#33413f" stroke-width="1"/>`;
    if (i % 2 === 0) g += txt(-19, y + 2.5, String(i), 6.2, '#33413f', 'end');
  }
  return { w: 66, h: 210, svg:
    `<circle cx="0" cy="-94" r="8" fill="none" stroke="#6f8280" stroke-width="3.4"/>` +
    `<rect x="-3.5" y="-88" width="7" height="10" fill="#6f8280"/>` +
    `<rect x="-17" y="-78" width="34" height="150" rx="13" fill="#f0f4f1" stroke="#7d918d" stroke-width="2"/>` +
    `<rect x="-6" y="-68" width="12" height="98" rx="4" fill="#ffffff" stroke="#b9c6c2" stroke-width="1.2"/>` +
    `<rect x="-3" y="-60" width="6" height="82" fill="#d7e0dc"/>` +
    `<path d="M-6 -18 H6" stroke="#b03a32" stroke-width="2.6"/>` +
    g + txt(-19, -72, 'N', 7, '#33413f', 'end') +
    `<rect x="-16" y="38" width="32" height="15" rx="2.5" fill="#e4ebe2" stroke="#9db4b5"/>` +
    `<text data-reading="" x="0" y="49" text-anchor="middle" font-size="8.5" fill="#26302e" ${MONO}>—</text>` +
    `<path d="M0 72 C0 86 -12 86 -12 94 C-12 102 -2 104 3 97" fill="none" stroke="#6f8280" stroke-width="4" stroke-linecap="round"/>` };
}
function stopwatch() {
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = i * 6 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), maj = i % 5 === 0;
    ticks += `<path d="M${(maj ? 31 : 34) * c} ${6 + (maj ? 31 : 34) * s} L${37 * c} ${6 + 37 * s}" stroke="#3c4a48" stroke-width="${maj ? 1.6 : .8}"/>`;
    if (maj) ticks += txt((25 * c).toFixed(1), (6 + 25 * s + 2.6).toFixed(1), String(i === 0 ? 60 : i), 7, '#3c4a48');
  }
  return { w: 94, h: 128, svg:
    `<circle cx="0" cy="-58" r="5.5" fill="none" stroke="#5c7477" stroke-width="3"/>` +
    `<rect x="-6" y="-55" width="12" height="11" rx="3" fill="${STEEL}" stroke="#43585a" stroke-width="1.2"/>` +
    `<rect x="-33" y="-47" width="12" height="9" rx="3" fill="${STEEL}" stroke="#43585a" transform="rotate(-24 -27 -42)"/>` +
    `<rect x="21" y="-47" width="12" height="9" rx="3" fill="${STEEL}" stroke="#43585a" transform="rotate(24 27 -42)"/>` +
    `<circle cx="0" cy="6" r="44" fill="#4d5a57" stroke="#2e3a37" stroke-width="2.4"/>` +
    `<circle cx="0" cy="6" r="38" fill="#fdfcf4" stroke="#c9c0a2" stroke-width="1.4"/>` +
    ticks +
    `<circle cx="0" cy="-8" r="11" fill="#fdfcf4" stroke="#8a9891" stroke-width="1.2"/>` +
    `<path d="M0 -8 L0 -16 M0 -8 L6 -5" stroke="#3c4a48" stroke-width="1.4"/>` +
    `<path d="M0 6 L0 -26" stroke="#b03a32" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="0" cy="6" r="3.4" fill="#26302e"/>` +
    `<rect x="-26" y="20" width="52" height="16" rx="3" fill="#e4ebe2" stroke="#9db4b5"/>` +
    `<text data-reading="" x="0" y="32" text-anchor="middle" font-size="10.5" fill="#26302e" ${MONO}>00:00.00</text>` };
}

/* ----------------------------------------------------------- magnets etc. */
function magnet(label) {
  if (/bar/i.test(label))
    return { w: 126, h: 46, svg:
      `<rect x="-63" y="-20" width="126" height="40" rx="6" fill="#c0453c" stroke="#7e2721" stroke-width="1.8"/>` +
      `<rect x="0" y="-20" width="63" height="40" fill="#3f6ea5" stroke="#274a75" stroke-width="1.8"/>` +
      txt(-31, 5, 'N', 15, '#f4e8e8', 'middle', 'font-weight="bold"') +
      txt(31, 5, 'S', 15, '#e8eef4', 'middle', 'font-weight="bold"') +
      `<circle cx="0" cy="-26" r="4" fill="none" stroke="#5c7477" stroke-width="2.4"/>` };
  return { w: 70, h: 40, svg: // compact neodymium block
    `<rect x="-35" y="-16" width="70" height="32" rx="6" fill="${STEEL}" stroke="#3c5052" stroke-width="1.8"/>` +
    `<rect x="-35" y="-16" width="35" height="32" rx="6" fill="#c0453c" stroke="#7e2721" stroke-width="1.4"/>` +
    txt(-17, 4, 'N', 10, '#f4e8e8') + txt(17, 4, 'S', 10, '#26302e') +
    `<circle cx="0" cy="-21" r="4" fill="none" stroke="#5c7477" stroke-width="2.2"/>` };
}
function rubber(label) {
  if (/membrane|polythene|sheet/i.test(label))
    return { w: 132, h: 112, svg:
      `<rect x="-64" y="-54" width="128" height="108" rx="4" fill="#dfe9e4" fill-opacity=".72" stroke="#9fb3a7" stroke-width="2"/>` +
      `<path d="M-48 -30 q20 8 40 0 t44 4 M-50 6 q24 -8 48 0 t40 -4 M-44 36 q20 6 44 0" fill="none" stroke="#b9c9bf" stroke-width="1.6"/>` +
      `<rect x="-64" y="-54" width="128" height="12" fill="#ffffff" opacity=".3"/>` };
  if (/putty|adhesive|fixing/i.test(label))
    return { w: 76, h: 50, svg:
      `<path d="M-32 8 Q-36 -10 -18 -16 Q-4 -24 12 -18 Q32 -14 32 2 Q34 16 16 20 Q-2 26 -20 20 Q-32 16 -32 8 Z" fill="#cbb9a0" stroke="#99876a" stroke-width="1.8"/>` +
      `<path d="M-16 -4 q8 -5 16 0 M-6 8 q9 -4 18 1" fill="none" stroke="#a8946f" stroke-width="1.4"/>` };
  // elastic band, length along X (parent scales sx/sy for stretch)
  return { w: 170, h: 46, svg:
    `<rect x="-82" y="-20" width="164" height="40" rx="20" fill="none" stroke="#b04a3a" stroke-width="10"/>` +
    `<rect x="-82" y="-20" width="164" height="40" rx="20" fill="none" stroke="#d0786a" stroke-width="2.4"/>` +
    `<path d="M-60 -14 q30 -5 60 0 t60 0" fill="none" stroke="#8a3629" stroke-width="1.6" opacity=".7"/>` };
}
function foam() {
  let speckle = '';
  [[-30, -22], [18, -30], [34, 8], [10, 30], [-26, 26], [-38, 2], [4, -34], [26, 24]].forEach(([x, y]) =>
    speckle += `<circle cx="${x}" cy="${y}" r="2" fill="#c9b96a"/>`);
  return { w: 102, h: 102, svg:
    `<path d="M0 -49 A49 49 0 1 0 0 49 A49 49 0 1 0 0 -49 Z M0 -20 A20 20 0 1 1 0 20 A20 20 0 1 1 0 -20 Z" fill="#e8d98a" stroke="#b3a45c" stroke-width="2" fill-rule="evenodd"/>` +
    `<path d="M0 -49 A49 49 0 1 0 0 49 A49 49 0 1 0 0 -49 Z" fill="none" stroke="#f4ead0" stroke-width="1.4" transform="translate(-2 -2)"/>` +
    speckle };
}
function chain() {
  const clips = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = -140 + t * 280;
    const y = -38 + 58 * (1 - Math.pow(2 * t - 1, 2));
    const slope = -232 * (2 * t - 1) / 280;
    const ang = Math.atan(slope) * 180 / Math.PI;
    clips.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})">` +
      `<rect x="-15" y="-6.5" width="30" height="13" rx="6.5" fill="${i % 2 ? '#dfe5e7' : '#cfd7da'}" stroke="#7f8b90" stroke-width="2.6"/>` +
      `<rect x="-7" y="-2.6" width="16" height="5.2" rx="2.6" fill="none" stroke="#98a4a8" stroke-width="1.8"/></g>`);
  }
  return { w: 302, h: 100, svg:
    `<path d="M-140 -38 Q0 78 140 -38" fill="none" stroke="#98a4a8" stroke-width="1" stroke-dasharray="2 4"/>` + clips.join('') };
}

/* --------------------------------------------------------------- dispatch */
function spec(part) {
  const label = `${part?.label || ''} ${part?.id || ''}`;
  switch (part?.kind) {
    case 'stand': return stand();
    case 'peg': return peg(label);
    case 'clamp': return clamp(label);
    case 'rod': return rod(label);
    case 'spring': return spring();
    case 'string': return string();
    case 'wire': return wire(label);
    case 'mass': return mass(label);
    case 'bob': return bob(label);
    case 'ball': return ball();
    case 'pulley': return pulley();
    case 'board': return board(label);
    case 'card': return card(label);
    case 'cylinder': return cylinder(label);
    case 'tube': return tube(label);
    case 'beaker': return beaker(label);
    case 'bottle': return bottle(label);
    case 'water': return waterOil('water', label);
    case 'oil': return waterOil('oil', label);
    case 'syringe': return syringe(label);
    case 'cell': return cell();
    case 'switch': return onOffSwitch(label);
    case 'resistor': return resistor(label);
    case 'capacitor': return capacitor();
    case 'ammeter': case 'voltmeter': case 'ohmmeter': case 'galvanometer': return meter(part.kind);
    case 'coil': return coilPart();
    case 'led': return led();
    case 'ldr': return ldr();
    case 'lamp': return lamp();
    case 'lens': return lens();
    case 'screen': return screen();
    case 'tray': return tray();
    case 'ruler': return ruler(label);
    case 'protractor': return protractor();
    case 'micrometer': return micrometer();
    case 'caliper': return caliper();
    case 'thermometer': return thermometer();
    case 'balance': return balance();
    case 'newton-meter': return newtonMeter();
    case 'stopwatch': return stopwatch();
    case 'magnet': return magnet(label);
    case 'rubber': return rubber(label);
    case 'foam': return foam();
    case 'chain': return chain();
    default: return { w: 80, h: 60, svg:
      `<rect x="-40" y="-30" width="80" height="60" rx="8" fill="#dfe5e3" stroke="#8a9891" stroke-width="2"/>` +
      txt(0, 4, '?', 18, '#8a9891') };
  }
}

/** SVG markup for a part, centred on (0,0), no wrapper transform. */
export function shape(part) {
  return spec(part).svg;
}
/** Positive scene-unit bounding box fully containing shape(part). */
export function bounds(part) {
  const s = spec(part);
  return { w: s.w, h: s.h };
}
export default { shape, bounds };
