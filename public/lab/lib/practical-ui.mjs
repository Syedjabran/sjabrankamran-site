// Student-only UI utilities. Never fetch the physics specification or teacher guide.
import { readingsCSV, linearFit } from './measurement.mjs';
export const $ = id => document.getElementById(id);
export async function loadGuide(id) {
  const response = await fetch('../../content/student-guides.json');
  if (!response.ok) throw new Error('Student guide could not be loaded');
  const guide = (await response.json()).guides.find(g => g.id === id);
  if (!guide) throw new Error('Student guide missing');
  $('title').textContent = `${guide.paperId} · Q${guide.question} — ${guide.title}`;
  $('provenance').textContent = guide.provenance.statement;
  const host = $('guide');
  const paragraph = text => { const p = document.createElement('p'); p.textContent = text; host.append(p); };
  paragraph(guide.setup.sourceInteraction);
  for (const text of [...guide.setup.actions, ...guide.measurement.sequence,
    guide.measurement.rangeAndRepeats, ...guide.measurement.readings.map(r => r.instruction),
    ...guide.calculations.studentFormulae, ...guide.calculations.graph.studentActions,
    ...guide.evaluationPrompts]) paragraph(text);
  if (guide.calibrationNotice) { const p = document.createElement('p'); p.className = 'notice'; p.textContent = guide.calibrationNotice; host.prepend(p); }
  return guide;
}
export function makeTable(guide, { units = {}, derive = row => row, onChange = () => {} } = {}) {
  const columns = guide.table.columns.map(c => ({ ...c, unit: units[c.key] ?? c.unit }));
  const rows = [];
  const head = $('table').createTHead().insertRow();
  for (const c of columns) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = `${c.label} / ${c.unit}`; head.append(th); }
  const body = $('table').createTBody();
  function render() {
    body.replaceChildren();
    rows.forEach((row, index) => {
      const tr = body.insertRow();
      for (const c of columns) {
        const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = row[c.key] ?? '';
        input.setAttribute('aria-label', `Reading ${index + 1}: ${c.label} / ${c.unit}`);
        input.onchange = () => {
          row[c.key] = input.value === '' ? null : Number(input.value);
          if (c.source === 'measured') derive(row);
          // Refresh values without replacing the focused input.
          columns.forEach((col, j) => { tr.cells[j].firstChild.value = row[col.key] ?? ''; });
          onChange(rows);
        };
        tr.insertCell().append(input);
      }
    });
    onChange(rows);
  }
  $('clear').onclick = () => { rows.length = 0; render(); };
  $('csv').onclick = () => {
    const url = URL.createObjectURL(new Blob([readingsCSV(columns, rows)], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${guide.id}-readings.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return { rows, add(row) { rows.push(derive({ ...row })); render(); } };
}
// Plot measured/student-calculated values only, never ideal model points.
export function drawGraph(rows, xKey, yKey, xLabel, yLabel, showFit = false, { slopeUnit = '1', interceptUnit = 'm' } = {}) {
  const canvas = $('graph'), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const points = rows.filter(r => Number.isFinite(r[xKey]) && Number.isFinite(r[yKey])).map(r => [r[xKey], r[yKey]]);
  ctx.font = '14px system-ui'; ctx.fillStyle = '#a1bfd0'; ctx.fillText(yLabel, 12, 20); ctx.fillText(xLabel, 400, 310);
  ctx.strokeStyle = '#315168'; ctx.strokeRect(80, 35, 430, 235);
  $('fit').textContent = 'Record at least two distinct x values to fit a line.';
  if (!points.length) return;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const dx = (xmax - xmin) || .01, dy = (ymax - ymin) || .01;
  const X = x => 100 + (x - xmin) / dx * 390, Y = y => 250 - (y - ymin) / dy * 195;
  ctx.fillText(xmin.toPrecision(3), 75, 290); ctx.fillText(xmax.toPrecision(3), 460, 290);
  ctx.fillText(ymin.toPrecision(3), 5, 255); ctx.fillText(ymax.toPrecision(3), 5, 60);
  ctx.fillStyle = '#3de1f0'; for (const [x, y] of points) { ctx.beginPath(); ctx.arc(X(x), Y(y), 4, 0, 2 * Math.PI); ctx.fill(); }
  if (points.length < 2 || xmin === xmax) return;
  if (!showFit) { $('fit').textContent = 'Measured points plotted. Choose Fit measured points to calculate a line.'; return; }
  const fit = linearFit(points);
  ctx.save(); ctx.beginPath(); ctx.rect(80,35,430,235); ctx.clip();
  ctx.strokeStyle = '#f7c948'; ctx.beginPath(); ctx.moveTo(X(xmin), Y(fit.slope * xmin + fit.intercept)); ctx.lineTo(X(xmax), Y(fit.slope * xmax + fit.intercept)); ctx.stroke(); ctx.restore();
  $('fit').textContent = `Gradient ${fit.slope.toPrecision(4)} ${slopeUnit}; intercept ${fit.intercept.toPrecision(4)} ${interceptUnit}; r² ${fit.rSquared?.toFixed(4) ?? 'undefined (constant y)'}. Fit uses the editable student table.`;
}
