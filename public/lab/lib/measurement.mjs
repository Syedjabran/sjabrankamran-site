// Analysis helpers for the student's own notebook entries: a least-squares
// line through the points they type and a CSV of their readings. The
// instrument primitives (seeded noise, quantising, reading an instrument)
// run on the server with the physics models (src/lib/practical-lab).
export function linearFit(points) {
  if (points.length < 2 || points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v))))
    throw new RangeError('At least two finite x,y readings required');
  const n = points.length;
  const mx = points.reduce((a,p) => a+p[0],0)/n;
  const my = points.reduce((a,p) => a+p[1],0)/n;
  let xx=0, xy=0, yy=0;
  for (const [x,y] of points) { xx+=(x-mx)**2; xy+=(x-mx)*(y-my); yy+=(y-my)**2; }
  if (xx === 0) throw new RangeError('Choose distinct x values');
  const slope=xy/xx, intercept=my-slope*mx;
  const residuals=points.map(([x,y])=>y-(slope*x+intercept));
  const sse=residuals.reduce((a,r)=>a+r*r,0);
  return { slope, intercept, residuals, rSquared: yy===0 ? null : 1-sse/yy,
    residualStandardError: n>2 ? Math.sqrt(sse/(n-2)) : null };
}

export function readingsCSV(columns, rows) {
  const cell = value => {
    let s = String(value ?? '');
    // Prevent spreadsheet formulas in student-entered text; preserve numbers.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  return [columns.map(c=>c.label+(c.unit ? ` / ${c.unit}` : '')),
    ...rows.map(row=>columns.map(c=>row[c.key]))].map(r=>r.map(cell).join(',')).join('\r\n');
}
